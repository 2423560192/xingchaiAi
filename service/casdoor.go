package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/setting"
)

// Casdoor 支付渠道的对外错误，便于 controller 层区分处理（不向客户端泄漏细节）。
var (
	ErrCasdoorNotConfigured    = errors.New("casdoor payment is not configured")
	ErrCasdoorInsecureEndpoint = errors.New("casdoor endpoint must use https")
	ErrCasdoorLoginFailed      = errors.New("casdoor admin login failed")
	ErrCasdoorRequestFailed    = errors.New("casdoor request failed")
	ErrCasdoorPaymentNotFound  = errors.New("casdoor payment not found")

	errCasdoorSessionExpired = errors.New("casdoor session expired")
)

// Casdoor 支付单状态（与 Casdoor object.Payment 的 State 字段一致）。
const (
	CasdoorPaymentStateCreated  = "Created"
	CasdoorPaymentStatePaid     = "Paid"
	CasdoorPaymentStateCanceled = "Canceled"
	CasdoorPaymentStateTimeout  = "Timeout"
	CasdoorPaymentStateError    = "Error"
)

const (
	casdoorSessionTTL      = 6 * time.Hour
	casdoorLoginBackoff    = 30 * time.Second
	casdoorHTTPTimeout     = 15 * time.Second
	casdoorMaxResponseSize = 1 << 20
)

// CasdoorPayment 是 Casdoor 支付单的关键字段子集。
type CasdoorPayment struct {
	Name     string   `json:"name"`
	Provider string   `json:"provider"`
	Type     string   `json:"type"`
	User     string   `json:"user"`
	Order    string   `json:"order"`
	Price    float64  `json:"price"`
	Currency string   `json:"currency"`
	State    string   `json:"state"`
	PayUrl   string   `json:"payUrl"`
	Products []string `json:"products"`
}

type casdoorEnvelope struct {
	Status string          `json:"status"`
	Msg    string          `json:"msg"`
	Data   json.RawMessage `json:"data"`
}

type casdoorClient struct {
	endpoint  string
	http      *http.Client
	createdAt time.Time
}

var (
	casdoorClientMu      sync.Mutex
	casdoorClientCache   *casdoorClient
	casdoorLastLoginErr  error
	casdoorLastLoginFail time.Time
)

// CasdoorUserName 返回 new-api 用户在 Casdoor 中对应的用户名。
// 使用确定性的前缀+用户ID，避免依赖/信任客户端传入的任何标识。
func CasdoorUserName(userId int) string {
	return "np_" + strconv.Itoa(userId)
}

// casdoorEndpoint 读取并校验 Casdoor 地址。强制要求 https（本机调试地址除外），
// 避免管理员账号凭据在明文连接中传输。
func casdoorEndpoint() (string, error) {
	raw := strings.TrimSpace(setting.GetCasdoorPaymentSettings().Endpoint)
	if raw == "" {
		return "", ErrCasdoorNotConfigured
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "", ErrCasdoorNotConfigured
	}
	if !strings.EqualFold(parsed.Scheme, "https") {
		host := strings.ToLower(parsed.Hostname())
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return "", ErrCasdoorInsecureEndpoint
		}
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func getCasdoorClient(ctx context.Context, forceRefresh bool) (*casdoorClient, error) {
	casdoorClientMu.Lock()
	defer casdoorClientMu.Unlock()

	if !forceRefresh && casdoorClientCache != nil && time.Since(casdoorClientCache.createdAt) < casdoorSessionTTL {
		return casdoorClientCache, nil
	}
	// 登录失败退避：配置错误时避免反复重试导致 Casdoor 管理员账号被锁定。
	if !forceRefresh && casdoorLastLoginErr != nil && time.Since(casdoorLastLoginFail) < casdoorLoginBackoff {
		return nil, casdoorLastLoginErr
	}

	client, err := loginCasdoor(ctx)
	if err != nil {
		casdoorLastLoginErr = err
		casdoorLastLoginFail = time.Now()
		return nil, err
	}
	casdoorLastLoginErr = nil
	casdoorClientCache = client
	return client, nil
}

func invalidateCasdoorClient() {
	casdoorClientMu.Lock()
	casdoorClientCache = nil
	casdoorClientMu.Unlock()
}

func loginCasdoor(ctx context.Context) (*casdoorClient, error) {
	settings := setting.GetCasdoorPaymentSettings()
	endpoint, err := casdoorEndpoint()
	if err != nil {
		return nil, err
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	client := &casdoorClient{
		endpoint:  endpoint,
		http:      &http.Client{Jar: jar, Timeout: casdoorHTTPTimeout},
		createdAt: time.Now(),
	}
	adminOrganization := strings.TrimSpace(settings.AdminOrganization)
	if adminOrganization == "" {
		// 兼容旧配置：未配置时按 Casdoor 内置组织登录
		adminOrganization = "built-in"
	}
	payload := map[string]any{
		"application":  "app-built-in",
		"organization": adminOrganization,
		"username":     strings.TrimSpace(settings.AdminUser),
		"password":     settings.AdminPassword,
		"autoSignin":   true,
		"type":         "login",
	}
	envelope, err := client.do(ctx, http.MethodPost, "/api/login", nil, payload)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCasdoorLoginFailed, err)
	}
	if envelope.Status != "ok" {
		return nil, fmt.Errorf("%w: %s", ErrCasdoorLoginFailed, envelope.Msg)
	}
	return client, nil
}

func (c *casdoorClient) do(ctx context.Context, method, path string, query url.Values, body any) (*casdoorEnvelope, error) {
	requestURL := c.endpoint + path
	if len(query) > 0 {
		requestURL += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, errCasdoorSessionExpired
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, casdoorMaxResponseSize))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: http status %d", ErrCasdoorRequestFailed, resp.StatusCode)
	}

	var envelope casdoorEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("%w: invalid response", ErrCasdoorRequestFailed)
	}
	return &envelope, nil
}

func casdoorMessageNeedsRelogin(msg string) bool {
	lower := strings.ToLower(msg)
	return strings.Contains(lower, "please login") ||
		strings.Contains(lower, "please sign in") ||
		strings.Contains(lower, "session")
}

// casdoorCall 调用 Casdoor 接口；会话失效时自动重新登录并重试一次。
// out 为 nil 时忽略返回的 data。
func casdoorCall(ctx context.Context, method, path string, query url.Values, body any, out any) error {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		client, err := getCasdoorClient(ctx, attempt > 0)
		if err != nil {
			return err
		}
		envelope, err := client.do(ctx, method, path, query, body)
		if err != nil {
			if errors.Is(err, errCasdoorSessionExpired) {
				invalidateCasdoorClient()
				lastErr = err
				continue
			}
			return err
		}
		if envelope.Status != "ok" {
			if casdoorMessageNeedsRelogin(envelope.Msg) {
				invalidateCasdoorClient()
				lastErr = fmt.Errorf("%w: %s", ErrCasdoorRequestFailed, envelope.Msg)
				continue
			}
			return fmt.Errorf("%w: %s", ErrCasdoorRequestFailed, envelope.Msg)
		}
		if out != nil && len(envelope.Data) > 0 && !bytes.Equal(bytes.TrimSpace(envelope.Data), []byte("null")) {
			if err := json.Unmarshal(envelope.Data, out); err != nil {
				return fmt.Errorf("%w: invalid data", ErrCasdoorRequestFailed)
			}
		}
		return nil
	}
	if lastErr == nil {
		lastErr = ErrCasdoorRequestFailed
	}
	return lastErr
}

// EnsureCasdoorUser 确保 new-api 用户在 Casdoor 组织下存在对应账号，返回 Casdoor 用户名。
// 账号由服务端按确定规则生成（np_<userId>），不接受客户端指定。
func EnsureCasdoorUser(ctx context.Context, userId int, displayName, email string) (string, error) {
	settings := setting.GetCasdoorPaymentSettings()
	organization := strings.TrimSpace(settings.Organization)
	if organization == "" {
		return "", ErrCasdoorNotConfigured
	}
	name := CasdoorUserName(userId)
	userId4Casdoor := organization + "/" + name

	var existing json.RawMessage
	if err := casdoorCall(ctx, http.MethodGet, "/api/get-user", url.Values{"id": {userId4Casdoor}}, nil, &existing); err != nil {
		return "", err
	}
	if isCasdoorJSONObject(existing) {
		return name, nil
	}

	if strings.TrimSpace(displayName) == "" {
		displayName = name
	}
	if strings.TrimSpace(email) == "" {
		email = name + "@casdoor.local"
	}
	payload := map[string]any{
		"owner":             organization,
		"name":              name,
		"displayName":       displayName,
		"email":             email,
		"password":          generateCasdoorUserPassword(),
		"type":              "normal-user",
		"isAdmin":           false,
		"isForbidden":       false,
		"isDeleted":         false,
		"emailVerified":     false,
		"signupApplication": "",
	}
	var created json.RawMessage
	if err := casdoorCall(ctx, http.MethodPost, "/api/add-user", nil, payload, &created); err != nil {
		// 并发场景下账号可能已被其他请求创建，重新查询确认。
		var again json.RawMessage
		if getErr := casdoorCall(ctx, http.MethodGet, "/api/get-user", url.Values{"id": {userId4Casdoor}}, nil, &again); getErr == nil && isCasdoorJSONObject(again) {
			return name, nil
		}
		return "", err
	}
	return name, nil
}

// CasdoorCreatePayment 在 Casdoor 中为指定用户下单并拉起支付，返回 Casdoor 订单号和支付单。
// 金额与商品均由服务端决定（商品来自受管理员保护的配置），客户端无法指定。
func CasdoorCreatePayment(ctx context.Context, casdoorUserName string, money float64, channel string) (string, *CasdoorPayment, error) {
	settings := setting.GetCasdoorPaymentSettings()
	organization := strings.TrimSpace(settings.Organization)
	productName := strings.TrimSpace(settings.ProductName)
	if organization == "" || productName == "" {
		return "", nil, ErrCasdoorNotConfigured
	}
	providerName, ok := settings.ProviderForChannel(channel)
	if !ok {
		return "", nil, fmt.Errorf("%w: unsupported payment channel", ErrCasdoorRequestFailed)
	}
	// 金额统一保留两位小数，且必须为正数。
	money = roundCasdoorMoney(money)
	if money <= 0 {
		return "", nil, fmt.Errorf("%w: invalid amount", ErrCasdoorRequestFailed)
	}

	placeOrderPayload := map[string]any{
		"productInfos": []map[string]any{
			{
				"name":     productName,
				"price":    money,
				"quantity": 1,
			},
		},
	}
	query := url.Values{}
	query.Set("owner", organization)
	query.Set("userName", casdoorUserName)

	var orderResp struct {
		Name string `json:"name"`
	}
	if err := casdoorCall(ctx, http.MethodPost, "/api/place-order", query, placeOrderPayload, &orderResp); err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(orderResp.Name) == "" {
		return "", nil, fmt.Errorf("%w: empty order name", ErrCasdoorRequestFailed)
	}

	payQuery := url.Values{}
	payQuery.Set("id", organization+"/"+orderResp.Name)
	payQuery.Set("providerName", providerName)

	var payment CasdoorPayment
	if err := casdoorCall(ctx, http.MethodPost, "/api/pay-order", payQuery, nil, &payment); err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(payment.Name) == "" || strings.TrimSpace(payment.PayUrl) == "" {
		return "", nil, fmt.Errorf("%w: empty payment", ErrCasdoorRequestFailed)
	}
	return orderResp.Name, &payment, nil
}

// CasdoorGetPayment 查询 Casdoor 支付单。查询结果只作为服务端结算依据，绝不用于信任客户端输入。
func CasdoorGetPayment(ctx context.Context, paymentName string) (*CasdoorPayment, error) {
	settings := setting.GetCasdoorPaymentSettings()
	organization := strings.TrimSpace(settings.Organization)
	if organization == "" {
		return nil, ErrCasdoorNotConfigured
	}
	if strings.TrimSpace(paymentName) == "" {
		return nil, ErrCasdoorPaymentNotFound
	}

	query := url.Values{}
	query.Set("id", organization+"/"+paymentName)

	var payment CasdoorPayment
	if err := casdoorCall(ctx, http.MethodGet, "/api/get-payment", query, nil, &payment); err != nil {
		return nil, err
	}
	if strings.TrimSpace(payment.Name) == "" {
		return nil, ErrCasdoorPaymentNotFound
	}
	return &payment, nil
}

func isCasdoorJSONObject(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) > 1 && trimmed[0] == '{'
}

func generateCasdoorUserPassword() string {
	// 该密码仅用于满足 Casdoor 账号创建要求，new-api 不会使用它登录。
	return "Np_" + strconv.FormatInt(time.Now().UnixNano(), 36) + "_aA1!"
}

func roundCasdoorMoney(money float64) float64 {
	// 以分为单位四舍五入，避免浮点误差影响订单金额与后续校验。
	cents := int64(money*100 + 0.5)
	if money < 0 {
		cents = int64(money*100 - 0.5)
	}
	return float64(cents) / 100
}

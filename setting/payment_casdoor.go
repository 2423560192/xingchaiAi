package setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// Casdoor 支付渠道的支付方式标识。
const (
	CasdoorChannelAlipay = "alipay"
	CasdoorChannelWechat = "wechat"
)

// CasdoorPaymentSettings 定义 Casdoor 支付渠道的配置。
//
// Casdoor 的支付能力以「商品(Product) -> 订单(Order) -> 支付单(Payment)」为核心：
// new-api 服务端使用 Casdoor 管理员账号，在指定组织下为该用户创建充值订单并发起支付，
// 客户端只负责展示支付链接/二维码。是否到账完全以 Casdoor 支付单状态（Paid）为准。
type CasdoorPaymentSettings struct {
	Enabled        bool    `json:"enabled"`
	Endpoint       string  `json:"endpoint"`
	AdminUser      string  `json:"admin_user"`
	AdminPassword  string  `json:"admin_password"`
	AdminOrganization string `json:"admin_organization"`
	Organization   string  `json:"organization"`
	ProductName    string  `json:"product_name"`
	AlipayProvider string  `json:"alipay_provider"`
	WechatProvider string  `json:"wechat_provider"`
	Currency       string  `json:"currency"`
	MinTopUp       float64 `json:"min_topup"`
	MaxTopUp       float64 `json:"max_topup"`
}

var casdoorPaymentSettings = CasdoorPaymentSettings{
	AdminOrganization: "built-in",
	Organization:   "afusion",
	ProductName:    "danqing_recharge",
	AlipayProvider: "provider_alipay",
	WechatProvider: "provider_payment_wechat",
	Currency:       "CNY",
	MinTopUp:       0.01,
	MaxTopUp:       100000,
}

func init() {
	config.GlobalConfig.Register("payment_casdoor", &casdoorPaymentSettings)
}

func GetCasdoorPaymentSettings() *CasdoorPaymentSettings {
	return &casdoorPaymentSettings
}

// IsConfigured 判断 Casdoor 支付渠道是否具备可用配置。
// 注意：合规声明确认由 controller 层单独校验，这里不包含合规状态。
func (s *CasdoorPaymentSettings) IsConfigured() bool {
	if s == nil || !s.Enabled {
		return false
	}
	if strings.TrimSpace(s.Endpoint) == "" ||
		strings.TrimSpace(s.AdminUser) == "" ||
		strings.TrimSpace(s.AdminPassword) == "" ||
		strings.TrimSpace(s.AdminOrganization) == "" ||
		strings.TrimSpace(s.Organization) == "" ||
		strings.TrimSpace(s.ProductName) == "" {
		return false
	}
	return strings.TrimSpace(s.AlipayProvider) != "" || strings.TrimSpace(s.WechatProvider) != ""
}

// ProviderForChannel 返回给指定支付方式在 Casdoor 中配置的支付渠道（provider）名称。
func (s *CasdoorPaymentSettings) ProviderForChannel(channel string) (string, bool) {
	if s == nil {
		return "", false
	}
	var name string
	switch strings.ToLower(strings.TrimSpace(channel)) {
	case CasdoorChannelAlipay:
		name = strings.TrimSpace(s.AlipayProvider)
	case CasdoorChannelWechat:
		name = strings.TrimSpace(s.WechatProvider)
	default:
		return "", false
	}
	if name == "" {
		return "", false
	}
	return name, true
}

// CurrencyCode 返回统一大写的币种代码，用于与 Casdoor 支付单返回值做校验。
func (s *CasdoorPaymentSettings) CurrencyCode() string {
	if s == nil {
		return "CNY"
	}
	currency := strings.ToUpper(strings.TrimSpace(s.Currency))
	if currency == "" {
		return "CNY"
	}
	return currency
}

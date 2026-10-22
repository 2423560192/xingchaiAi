package controller

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// Casdoor 渠道的订单/对账参数。
const (
	casdoorPendingOrderWindow = 15 * time.Minute
	casdoorMaxPendingOrders   = 10
	casdoorReconcileInterval  = 60 * time.Second
	casdoorReconcileWindow    = 2 * time.Hour
	casdoorReconcileLimit     = 50
	casdoorTradeNoPrefix      = "CASD"
)

type CasdoorPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

// casdoorPayType 返回前端应如何展示支付链接：redirect（跳转收银台）或 qrcode（二维码）。
func casdoorPayType(channel, payUrl string) (string, bool) {
	payUrl = strings.TrimSpace(payUrl)
	if payUrl == "" {
		return "", false
	}
	switch channel {
	case setting.CasdoorChannelWechat:
		// 微信 Native 支付返回 weixin://wxpay/bizpayurl?pr=...，前端渲染成二维码。
		if !strings.HasPrefix(payUrl, "weixin://wxpay/bizpayurl") {
			return "", false
		}
		return "qrcode", true
	case setting.CasdoorChannelAlipay:
		parsed, err := url.Parse(payUrl)
		if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" {
			return "", false
		}
		return "redirect", true
	default:
		return "", false
	}
}

func buildCasdoorTradeNo(userId int) string {
	return fmt.Sprintf("%s%dNO%s%d", casdoorTradeNoPrefix, userId, common.GetRandomString(8), time.Now().UnixNano())
}

// settled 表示一次结算尝试的结果。
type casdoorSettleResult string

const (
	casdoorSettlePending casdoorSettleResult = "pending"
	casdoorSettleSuccess casdoorSettleResult = "success"
	casdoorSettleFailed  casdoorSettleResult = "failed"
	casdoorSettleInvalid casdoorSettleResult = "invalid"
)

// verifyCasdoorPayment 校验 Casdoor 支付单确实对应当前 new-api 充值订单。
// 任一字段不匹配都不入账，避免金额篡改、串单、重放等风险。
func verifyCasdoorPayment(topUp *model.TopUp, payment *service.CasdoorPayment, settings *setting.CasdoorPaymentSettings) error {
	if topUp == nil || payment == nil {
		return errors.New("订单或支付单为空")
	}
	if strings.TrimSpace(payment.Name) == "" {
		return errors.New("支付单号为空")
	}
	if topUp.ProviderPaymentId == "" || payment.Name != topUp.ProviderPaymentId {
		return errors.New("支付单号不匹配")
	}
	if topUp.ProviderOrderId == "" || payment.Order != topUp.ProviderOrderId {
		return errors.New("订单号不匹配")
	}
	if payment.User != service.CasdoorUserName(topUp.UserId) {
		return errors.New("支付用户不匹配")
	}
	if !strings.EqualFold(strings.TrimSpace(payment.Currency), settings.CurrencyCode()) {
		return fmt.Errorf("支付币种不匹配: %s", payment.Currency)
	}
	expectedMoney := decimal.NewFromFloat(topUp.Money).Round(2)
	actualMoney := decimal.NewFromFloat(payment.Price).Round(2)
	if !expectedMoney.Equal(actualMoney) {
		return fmt.Errorf("支付金额不匹配: expected=%s actual=%s", expectedMoney.String(), actualMoney.String())
	}
	productName := strings.TrimSpace(settings.ProductName)
	foundProduct := false
	for _, product := range payment.Products {
		if product == productName {
			foundProduct = true
			break
		}
	}
	if !foundProduct {
		return errors.New("支付商品不匹配")
	}
	return nil
}

// settleCasdoorTopUp 以 Casdoor 服务端状态为准结算充值订单。
// 只有 Casdoor 明确返回 Paid 且所有校验通过才会入账；入账本身在 model 层用行锁+事务保证幂等。
func settleCasdoorTopUp(ctx context.Context, topUp *model.TopUp, callerIp string) (casdoorSettleResult, error) {
	if topUp == nil {
		return casdoorSettleInvalid, errors.New("订单为空")
	}
	settings := setting.GetCasdoorPaymentSettings()
	if strings.TrimSpace(topUp.ProviderPaymentId) == "" {
		return casdoorSettlePending, nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	payment, err := service.CasdoorGetPayment(queryCtx, topUp.ProviderPaymentId)
	if err != nil {
		if errors.Is(err, service.ErrCasdoorPaymentNotFound) {
			return casdoorSettlePending, nil
		}
		return casdoorSettlePending, err
	}

	switch payment.State {
	case service.CasdoorPaymentStatePaid:
		if err := verifyCasdoorPayment(topUp, payment, settings); err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("Casdoor 支付校验未通过，拒绝入账 trade_no=%s payment=%s reason=%s", topUp.TradeNo, payment.Name, err.Error()))
			return casdoorSettleInvalid, nil
		}
		alreadyDone, err := model.RechargeCasdoor(topUp.TradeNo, callerIp)
		if err != nil {
			return casdoorSettlePending, err
		}
		if alreadyDone {
			logger.LogInfo(ctx, fmt.Sprintf("Casdoor 充值重复结算已幂等忽略 trade_no=%s", topUp.TradeNo))
		} else {
			logger.LogInfo(ctx, fmt.Sprintf("Casdoor 充值成功 trade_no=%s user_id=%d money=%.2f", topUp.TradeNo, topUp.UserId, topUp.Money))
		}
		return casdoorSettleSuccess, nil
	case service.CasdoorPaymentStateCanceled, service.CasdoorPaymentStateTimeout, service.CasdoorPaymentStateError:
		if err := model.UpdatePendingTopUpStatus(topUp.TradeNo, model.PaymentProviderCasdoor, common.TopUpStatusFailed); err != nil {
			if !errors.Is(err, model.ErrTopUpStatusInvalid) {
				logger.LogWarn(ctx, fmt.Sprintf("Casdoor 订单置为失败状态失败 trade_no=%s error=%s", topUp.TradeNo, err.Error()))
			}
		}
		return casdoorSettleFailed, nil
	default:
		// Created 等中间态，继续保持待支付。
		return casdoorSettlePending, nil
	}
}

// RequestCasdoorAmount 返回按当前分组倍率/折扣计算的应付金额（仅用于前端展示）。
func RequestCasdoorAmount(c *gin.Context) {
	if !isCasdoorTopUpEnabled() {
		common.ApiErrorMsg(c, "Casdoor 支付未启用")
		return
	}
	settings := setting.GetCasdoorPaymentSettings()

	var req AmountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	if req.Amount < getMinTopup() {
		common.ApiErrorMsg(c, fmt.Sprintf("充值数量不能小于 %d", getMinTopup()))
		return
	}
	if rejectInvalidTopUpQuota(c, userId, req.Amount) {
		return
	}
	group, err := model.GetUserGroup(userId, true)
	if err != nil {
		common.ApiErrorMsg(c, "获取用户分组失败")
		return
	}
	payMoney := roundCasdoorAmount(getPayMoney(req.Amount, group))
	if err := validateCasdoorPayMoney(payMoney, settings); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, strconv.FormatFloat(payMoney, 'f', 2, 64))
}

func validateCasdoorPayMoney(payMoney float64, settings *setting.CasdoorPaymentSettings) error {
	if payMoney <= 0 {
		return errors.New("支付金额无效")
	}
	if payMoney < settings.MinTopUp {
		return fmt.Errorf("支付金额不能小于 %.2f %s", settings.MinTopUp, settings.CurrencyCode())
	}
	if settings.MaxTopUp > 0 && payMoney > settings.MaxTopUp {
		return fmt.Errorf("支付金额不能大于 %.2f %s", settings.MaxTopUp, settings.CurrencyCode())
	}
	return nil
}

func roundCasdoorAmount(money float64) float64 {
	return decimal.NewFromFloat(money).Round(2).InexactFloat64()
}

// RequestCasdoorPay 创建 Casdoor 充值订单并返回支付链接/二维码。
//
// 安全要点：
//   - 金额、商品、币种全部由服务端计算/配置决定，客户端只可选择支付方式和充值数量；
//   - 交易号由服务端生成并落库，客户端无法指定或伪造；
//   - Casdoor 调用失败时不落库、不返回支付链接；
//   - 单用户未完成订单数量受限，避免刷单与资源滥用。
func RequestCasdoorPay(c *gin.Context) {
	if !isCasdoorTopUpEnabled() {
		common.ApiErrorMsg(c, "Casdoor 支付未启用")
		return
	}
	settings := setting.GetCasdoorPaymentSettings()

	var req CasdoorPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误：amount 必须是整数（额度数量，当前汇率下 1 元 = 1 额度，最低 1）")
		return
	}
	req.PaymentMethod = strings.ToLower(strings.TrimSpace(req.PaymentMethod))
	if _, ok := settings.ProviderForChannel(req.PaymentMethod); !ok {
		common.ApiErrorMsg(c, "不支持的支付方式")
		return
	}

	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	if req.Amount < getMinTopup() {
		common.ApiErrorMsg(c, fmt.Sprintf("充值数量不能小于 %d", getMinTopup()))
		return
	}
	if rejectInvalidTopUpQuota(c, userId, req.Amount) {
		return
	}

	group, err := model.GetUserGroup(userId, true)
	if err != nil {
		common.ApiErrorMsg(c, "获取用户分组失败")
		return
	}
	payMoney := roundCasdoorAmount(getPayMoney(req.Amount, group))
	if err := validateCasdoorPayMoney(payMoney, settings); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	pendingCount, err := model.CountPendingCasdoorTopUps(userId, time.Now().Add(-casdoorPendingOrderWindow).Unix())
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Casdoor 统计未完成订单失败 user_id=%d error=%q", userId, err.Error()))
		common.ApiErrorMsg(c, "创建订单失败，请稍后重试")
		return
	}
	if pendingCount >= casdoorMaxPendingOrders {
		common.ApiErrorMsg(c, "存在较多未完成的充值订单，请稍后再试")
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()

	casdoorUserName, err := service.EnsureCasdoorUser(ctx, user.Id, user.DisplayName, user.Email)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Casdoor 确保用户失败 user_id=%d error=%q", userId, err.Error()))
		common.ApiErrorMsg(c, "创建支付账号失败，请稍后重试")
		return
	}

	orderName, payment, err := service.CasdoorCreatePayment(ctx, casdoorUserName, payMoney, req.PaymentMethod)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Casdoor 拉起支付失败 user_id=%d amount=%d money=%.2f channel=%s error=%q", userId, req.Amount, payMoney, req.PaymentMethod, err.Error()))
		common.ApiErrorMsg(c, "拉起支付失败，请稍后重试")
		return
	}

	payType, ok := casdoorPayType(req.PaymentMethod, payment.PayUrl)
	if !ok {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Casdoor 返回了非预期的支付链接 user_id=%d payment=%s provider=%s", userId, payment.Name, payment.Provider))
		common.ApiErrorMsg(c, "支付链接异常，请稍后重试")
		return
	}

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}

	paymentMethod := model.PaymentMethodCasdoorAlipay
	if req.PaymentMethod == setting.CasdoorChannelWechat {
		paymentMethod = model.PaymentMethodCasdoorWechat
	}

	topUp := &model.TopUp{
		UserId:            userId,
		Amount:            amount,
		Money:             payMoney,
		PaymentMethod:     paymentMethod,
		PaymentProvider:   model.PaymentProviderCasdoor,
		ProviderOrderId:   orderName,
		ProviderPaymentId: payment.Name,
		CreateTime:        time.Now().Unix(),
		Status:            common.TopUpStatusPending,
	}
	var insertErr error
	for attempt := 0; attempt < 3; attempt++ {
		topUp.TradeNo = buildCasdoorTradeNo(userId)
		insertErr = topUp.Insert()
		if insertErr == nil {
			break
		}
	}
	if insertErr != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Casdoor 创建充值订单失败 user_id=%d error=%q", userId, insertErr.Error()))
		common.ApiErrorMsg(c, "创建订单失败，请稍后重试")
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Casdoor 充值订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f channel=%s payment=%s", userId, topUp.TradeNo, topUp.Amount, topUp.Money, req.PaymentMethod, payment.Name))

	common.ApiSuccess(c, gin.H{
		"trade_no":       topUp.TradeNo,
		"pay_url":        payment.PayUrl,
		"pay_type":       payType,
		"payment_method": req.PaymentMethod,
		"amount":         req.Amount,
		"money":          payMoney,
		"currency":       settings.CurrencyCode(),
		"status":         common.TopUpStatusPending,
	})
}

// CasdoorPayStatus 查询充值订单状态；待支付订单会向 Casdoor 核实支付结果并结算。
//
// 安全要点：
//   - 只能查询自己的订单（不属于当前用户一律返回"订单不存在"，避免探测他人订单）；
//   - 入账金额取自服务端订单记录，客户端无法传金额；
//   - 是否到账完全取决于 Casdoor 支付单状态与字段校验，客户端无法伪造；
//   - 由 UserCriticalRateLimit 限制轮询频率。
func CasdoorPayStatus(c *gin.Context) {
	if !isCasdoorTopUpEnabled() {
		common.ApiErrorMsg(c, "Casdoor 支付未启用")
		return
	}
	tradeNo := strings.TrimSpace(c.Query("trade_no"))
	if len(tradeNo) == 0 || len(tradeNo) > 80 || !strings.HasPrefix(tradeNo, casdoorTradeNoPrefix) {
		common.ApiErrorMsg(c, "订单号无效")
		return
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}

	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.UserId != userId || topUp.PaymentProvider != model.PaymentProviderCasdoor {
		// 不区分"不存在"与"不属于你"，避免通过错误信息探测他人订单。
		common.ApiErrorMsg(c, "订单不存在")
		return
	}

	status := topUp.Status
	if status == common.TopUpStatusPending {
		result, err := settleCasdoorTopUp(c.Request.Context(), topUp, c.ClientIP())
		if err != nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("Casdoor 查询支付结果失败 trade_no=%s error=%q", topUp.TradeNo, err.Error()))
			common.ApiErrorMsg(c, "查询支付结果失败，请稍后重试")
			return
		}
		switch result {
		case casdoorSettleSuccess:
			status = common.TopUpStatusSuccess
		case casdoorSettleFailed:
			status = common.TopUpStatusFailed
		default:
			status = common.TopUpStatusPending
		}
	}

	common.ApiSuccess(c, gin.H{
		"trade_no": topUp.TradeNo,
		"status":   status,
		"money":    topUp.Money,
		"amount":   topUp.Amount,
	})
}

// StartCasdoorTopUpReconciler 后台对账：补偿用户支付后关闭页面/未轮询导致的漏单。
// 只处理 pending 且已关联 Casdoor 支付单的订单，结算逻辑与前台查询完全一致（幂等）。
func StartCasdoorTopUpReconciler() {
	ticker := time.NewTicker(casdoorReconcileInterval)
	defer ticker.Stop()
	for range ticker.C {
		if !isCasdoorTopUpEnabled() {
			continue
		}
		topUps, err := model.GetPendingCasdoorTopUps(casdoorReconcileLimit, time.Now().Add(-casdoorReconcileWindow).Unix())
		if err != nil {
			logger.LogWarn(context.Background(), fmt.Sprintf("Casdoor 对账查询失败 error=%q", err.Error()))
			continue
		}
		for _, topUp := range topUps {
			if _, err := settleCasdoorTopUp(context.Background(), topUp, ""); err != nil {
				logger.LogWarn(context.Background(), fmt.Sprintf("Casdoor 对账失败 trade_no=%s error=%q", topUp.TradeNo, err.Error()))
			}
		}
	}
}

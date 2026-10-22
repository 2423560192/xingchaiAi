package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	// PaymentMethodCasdoorAlipay / PaymentMethodCasdoorWechat 是 Casdoor 渠道下两种支付方式，
	// 用于充值记录展示；真实支付网关在 Casdoor 侧配置。
	PaymentMethodCasdoorAlipay = "casdoor_alipay"
	PaymentMethodCasdoorWechat = "casdoor_wechat"

	// PaymentProviderCasdoor 标识由 Casdoor 支付渠道产生的充值订单。
	PaymentProviderCasdoor = "casdoor"
)

// RechargeCasdoor 原子完成 Casdoor 充值订单：订单行锁、状态校验、成功更新与用户额度增加
// 在同一个事务内完成，因此同一订单的并发/重复结算（包括多实例部署下）最多充值一次。
// alreadyDone=true 表示订单此前已完成，本次为幂等重复结算。
//
// 调用方必须先用 Casdoor 服务端支付单状态与字段校验确认支付真实有效（见 controller 层），
// 本函数只负责"订单状态机 + 入账"，不接受任何来自客户端的金额。
func RechargeCasdoor(tradeNo string, callerIp string) (alreadyDone bool, err error) {
	if tradeNo == "" {
		return false, errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var quotaToAdd int
	topUp := &TopUp{}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderCasdoor {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess {
			alreadyDone = true
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}
		// 防御：没有关联 Casdoor 支付单的订单不允许入账。
		if topUp.ProviderPaymentId == "" {
			return errors.New("充值订单未关联外部支付单")
		}

		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(
			decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
		)
		if quotaErr != nil || quotaToAdd <= 0 {
			return ErrInvalidTopUpQuota
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}
		return creditTopUpQuota(tx, topUp.UserId, quotaToAdd, nil)
	})
	if err != nil {
		if !errors.Is(err, ErrTopUpNotFound) && !errors.Is(err, ErrPaymentMethodMismatch) && !errors.Is(err, ErrTopUpStatusInvalid) {
			common.SysError("casdoor topup failed: " + err.Error())
		}
		return false, err
	}
	if alreadyDone {
		return true, nil
	}
	syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "casdoor topup")

	common.SysLog(fmt.Sprintf("Casdoor 充值成功 trade_no=%s user_id=%d quota_to_add=%d money=%.2f", topUp.TradeNo, topUp.UserId, quotaToAdd, topUp.Money))
	RecordTopupLog(topUp.UserId, common.NewMessage("{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{
		"provider": "Casdoor",
		"quota":    logger.FormatQuota(quotaToAdd),
		"amount":   fmt.Sprintf("%.2f", topUp.Money),
	}), callerIp, topUp.PaymentMethod, PaymentProviderCasdoor)
	return false, nil
}

// GetPendingCasdoorTopUps 返回指定时间之后创建、仍处于待支付且已关联 Casdoor 支付单的订单，
// 供后台对账任务使用。
func GetPendingCasdoorTopUps(limit int, createdAfter int64) ([]*TopUp, error) {
	topUps := make([]*TopUp, 0)
	query := DB.Where("payment_provider = ? AND status = ? AND create_time >= ?", PaymentProviderCasdoor, common.TopUpStatusPending, createdAfter)
	query = query.Where("provider_payment_id <> ''")
	if limit > 0 {
		query = query.Limit(limit)
	}
	err := query.Order("id asc").Find(&topUps).Error
	return topUps, err
}

// CountPendingCasdoorTopUps 统计用户在指定时间之后创建的待支付 Casdoor 订单数量，
// 用于限制单个用户同时存在的未完成订单数，避免刷单/滥用 Casdoor 下单接口。
func CountPendingCasdoorTopUps(userId int, createdAfter int64) (int64, error) {
	var count int64
	err := DB.Model(&TopUp{}).
		Where("user_id = ? AND payment_provider = ? AND status = ? AND create_time >= ?", userId, PaymentProviderCasdoor, common.TopUpStatusPending, createdAfter).
		Count(&count).Error
	return count, err
}

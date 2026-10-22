package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
)

func casdoorTestSettings() *setting.CasdoorPaymentSettings {
	return &setting.CasdoorPaymentSettings{
		Enabled:        true,
		Endpoint:       "https://iam.example.com",
		AdminUser:      "paybot",
		AdminPassword:  "secret",
		Organization:   "afusion",
		ProductName:    "danqing_recharge",
		AlipayProvider: "provider_alipay",
		WechatProvider: "provider_payment_wechat",
		Currency:       "CNY",
		MinTopUp:       0.01,
		MaxTopUp:       100000,
	}
}

func casdoorTestTopUp() *model.TopUp {
	return &model.TopUp{
		UserId:            7,
		Amount:            100,
		Money:             1.00,
		TradeNo:           "CASD7NOtest123",
		PaymentMethod:     model.PaymentMethodCasdoorAlipay,
		PaymentProvider:   model.PaymentProviderCasdoor,
		ProviderOrderId:   "order_1",
		ProviderPaymentId: "payment_1",
		Status:            common.TopUpStatusPending,
	}
}

func casdoorTestPayment() *service.CasdoorPayment {
	return &service.CasdoorPayment{
		Name:     "payment_1",
		Provider: "provider_alipay",
		Type:     "Alipay",
		User:     service.CasdoorUserName(7),
		Order:    "order_1",
		Price:    1.00,
		Currency: "CNY",
		State:    service.CasdoorPaymentStatePaid,
		Products: []string{"danqing_recharge"},
	}
}

func TestCasdoorPayType(t *testing.T) {
	cases := []struct {
		channel string
		url     string
		want    string
		ok      bool
	}{
		{setting.CasdoorChannelWechat, "weixin://wxpay/bizpayurl?pr=abc", "qrcode", true},
		{setting.CasdoorChannelWechat, "https://evil.example.com", "", false},
		{setting.CasdoorChannelWechat, "javascript:alert(1)", "", false},
		{setting.CasdoorChannelWechat, "", "", false},
		{setting.CasdoorChannelAlipay, "https://openapi.alipay.com/gateway.do?x=1", "redirect", true},
		{setting.CasdoorChannelAlipay, "http://openapi.alipay.com/gateway.do", "", false},
		{setting.CasdoorChannelAlipay, "weixin://wxpay/bizpayurl?pr=abc", "", false},
		{setting.CasdoorChannelAlipay, "javascript:alert(1)", "", false},
		{"unknown", "https://openapi.alipay.com/gateway.do", "", false},
	}
	for _, tc := range cases {
		got, ok := casdoorPayType(tc.channel, tc.url)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("casdoorPayType(%q, %q) = (%q, %v), want (%q, %v)", tc.channel, tc.url, got, ok, tc.want, tc.ok)
		}
	}
}

func TestVerifyCasdoorPayment(t *testing.T) {
	settings := casdoorTestSettings()

	if err := verifyCasdoorPayment(casdoorTestTopUp(), casdoorTestPayment(), settings); err != nil {
		t.Fatalf("expected payment to verify, got error: %v", err)
	}

	mutations := []struct {
		name   string
		mutate func(topUp *model.TopUp, payment *service.CasdoorPayment)
	}{
		{"payment name mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Name = "payment_2" }},
		{"order mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Order = "order_2" }},
		{"user mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.User = service.CasdoorUserName(8) }},
		{"money mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Price = 0.01 }},
		{"currency mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Currency = "USD" }},
		{"product mismatch", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Products = []string{"other_product"} }},
		{"empty products", func(_ *model.TopUp, p *service.CasdoorPayment) { p.Products = nil }},
		{"missing provider payment id", func(topUp *model.TopUp, _ *service.CasdoorPayment) { topUp.ProviderPaymentId = "" }},
		{"missing provider order id", func(topUp *model.TopUp, _ *service.CasdoorPayment) { topUp.ProviderOrderId = "" }},
	}
	for _, m := range mutations {
		topUp := casdoorTestTopUp()
		payment := casdoorTestPayment()
		m.mutate(topUp, payment)
		if err := verifyCasdoorPayment(topUp, payment, settings); err == nil {
			t.Fatalf("expected verification to fail for %q", m.name)
		}
	}

	if err := verifyCasdoorPayment(casdoorTestTopUp(), nil, settings); err == nil {
		t.Fatal("expected nil payment to fail verification")
	}
}

func TestValidateCasdoorPayMoney(t *testing.T) {
	settings := casdoorTestSettings()
	if err := validateCasdoorPayMoney(0, settings); err == nil {
		t.Fatal("zero amount must be rejected")
	}
	if err := validateCasdoorPayMoney(0.001, settings); err == nil {
		t.Fatal("amount below minimum must be rejected")
	}
	if err := validateCasdoorPayMoney(settings.MaxTopUp+1, settings); err == nil {
		t.Fatal("amount above maximum must be rejected")
	}
	if err := validateCasdoorPayMoney(1.00, settings); err != nil {
		t.Fatalf("expected valid amount, got %v", err)
	}
}

func TestBuildCasdoorTradeNo(t *testing.T) {
	tradeNo := buildCasdoorTradeNo(12)
	if len(tradeNo) > 80 {
		t.Fatalf("trade no too long: %s", tradeNo)
	}
	if len(tradeNo) < len(casdoorTradeNoPrefix)+1 || tradeNo[:len(casdoorTradeNoPrefix)] != casdoorTradeNoPrefix {
		t.Fatalf("unexpected trade no prefix: %s", tradeNo)
	}
	if tradeNo == buildCasdoorTradeNo(12) {
		t.Fatal("trade no should be unique across calls")
	}
}

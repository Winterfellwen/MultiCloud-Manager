package cost

import (
	"context"
	"database/sql"
)

type PricingEntry struct {
	Provider      string  `json:"provider"`
	Region        string  `json:"region"`
	Tier          string  `json:"tier"`
	PricePerHour  float64 `json:"price_per_hour"`
	PricePerMonth float64 `json:"price_per_month"`
}

func SeedPricing() []PricingEntry {
	return []PricingEntry{
		{Provider: "aws", Region: "us-east-1", Tier: "t3.nano", PricePerHour: 0.0052, PricePerMonth: 3.80},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.micro", PricePerHour: 0.0104, PricePerMonth: 7.60},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.small", PricePerHour: 0.0208, PricePerMonth: 15.18},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.medium", PricePerHour: 0.0416, PricePerMonth: 30.37},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.large", PricePerHour: 0.0832, PricePerMonth: 60.74},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.xlarge", PricePerHour: 0.1664, PricePerMonth: 121.47},
		{Provider: "aws", Region: "us-east-1", Tier: "t3.2xlarge", PricePerHour: 0.3328, PricePerMonth: 242.94},
		{Provider: "azure", Region: "eastus", Tier: "Standard_B1s", PricePerHour: 0.0076, PricePerMonth: 5.55},
		{Provider: "azure", Region: "eastus", Tier: "Standard_B1ms", PricePerHour: 0.0151, PricePerMonth: 11.02},
		{Provider: "azure", Region: "eastus", Tier: "Standard_B2s", PricePerHour: 0.0302, PricePerMonth: 22.05},
		{Provider: "azure", Region: "eastus", Tier: "Standard_B2ms", PricePerHour: 0.0605, PricePerMonth: 44.17},
		{Provider: "azure", Region: "eastus", Tier: "Standard_D2s_v3", PricePerHour: 0.096, PricePerMonth: 70.08},
		{Provider: "azure", Region: "eastus", Tier: "Standard_D4s_v3", PricePerHour: 0.192, PricePerMonth: 140.16},
		{Provider: "azure", Region: "eastus", Tier: "Standard_D8s_v3", PricePerHour: 0.384, PricePerMonth: 280.32},
		{Provider: "tencent", Region: "ap-guangzhou", Tier: "SA1.SMALL1", PricePerHour: 0.04, PricePerMonth: 29.20},
		{Provider: "tencent", Region: "ap-guangzhou", Tier: "SA1.SMALL2", PricePerHour: 0.08, PricePerMonth: 58.40},
		{Provider: "tencent", Region: "ap-guangzhou", Tier: "SA1.SMALL4", PricePerHour: 0.16, PricePerMonth: 116.80},
	}
}

func InsertSeedPricing(ctx context.Context, db *sql.DB) error {
	for _, p := range SeedPricing() {
		_, err := db.ExecContext(ctx, `
			INSERT INTO pricing_plans (provider, region, tier, price_per_hour, price_per_month)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (provider, region, tier, effective_from) DO NOTHING`,
			p.Provider, p.Region, p.Tier, p.PricePerHour, p.PricePerMonth)
		if err != nil {
			return err
		}
	}
	return nil
}

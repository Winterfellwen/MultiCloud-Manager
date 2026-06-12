package cost

import (
	"context"
	"time"
)

type CostFetcher interface {
	Fetch(ctx context.Context, creds map[string]string, periodStart, periodEnd time.Time) ([]CostData, error)
	Provider() string
}

func NewCostFetcher(provider string) CostFetcher {
	switch provider {
	case "azure":
		return &AzureFetcher{}
	case "aws":
		return &AwsFetcher{}
	case "tencent":
		return &TencentFetcher{}
	case "alicloud":
		return &AlicloudFetcher{}
	case "oracle":
		return &OracleEstimatorAdapter{}
	case "render":
		return &RenderEstimatorAdapter{}
	default:
		return nil
	}
}

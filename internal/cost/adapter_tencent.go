package cost

import (
	"context"
	"fmt"
	"time"
)

type TencentFetcher struct{}

func (a *TencentFetcher) Provider() string { return "tencent" }

func (a *TencentFetcher) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// TenCloud Billing API: POST / DescribeBillSummaryByResource
	// Requires: secret_id, secret_key
	return nil, fmt.Errorf("Tencent Billing API requires SDK signature — implement via existing Tencent provider's DoRawRequest")
}

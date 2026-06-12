package cost

import (
	"context"
	"fmt"
	"time"
)

type AlicloudFetcher struct{}

func (a *AlicloudFetcher) Provider() string { return "alicloud" }

func (a *AlicloudFetcher) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// Alibaba Cloud Billing API: QueryInstanceBill
	// Requires: access_key_id, access_key_secret
	return nil, fmt.Errorf("Alibaba Billing API requires SDK signature — implement via existing Alibaba provider's DoRawRequest")
}

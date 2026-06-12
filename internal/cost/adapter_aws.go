package cost

import (
	"context"
	"fmt"
	"time"
)

type AwsFetcher struct{}

func (a *AwsFetcher) Provider() string { return "aws" }

func (a *AwsFetcher) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// AWS Cost Explorer API: POST /aws-cost-explorer/
	// Requires: access_key_id, secret_access_key, region
	return nil, fmt.Errorf("AWS Cost Explorer API requires AWS SDK — implement via existing AWS provider's DoRawRequest")
}

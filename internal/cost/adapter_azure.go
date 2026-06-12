package cost

import (
	"context"
	"fmt"
	"time"
)

type AzureFetcher struct{}

func (a *AzureFetcher) Provider() string { return "azure" }

func (a *AzureFetcher) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// Azure Cost Management API: POST /subscriptions/{sub}/providers/Microsoft.CostManagement/query
	// Requires: subscription_id, tenant_id, client_id, client_secret
	// Full implementation uses existing AzureProvider.DoRawRequest pattern
	return nil, fmt.Errorf("Azure Cost Management API requires OAuth2 token — implement via existing Azure provider's DoRawRequest")
}

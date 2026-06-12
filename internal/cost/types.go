package cost

import "time"

type CostData struct {
	ID                string    `json:"id,omitempty"`
	ResourceCacheID   string    `json:"resource_cache_id,omitempty"`
	AccountID         string    `json:"account_id,omitempty"`
	Provider          string    `json:"provider"`
	CloudResourceID   string    `json:"cloud_resource_id"`
	CostType          string    `json:"cost_type"`
	Amount            float64   `json:"amount"`
	Currency          string    `json:"currency"`
	BillingPeriodStart time.Time `json:"billing_period_start"`
	BillingPeriodEnd   time.Time `json:"billing_period_end"`
	UsageQuantity     float64   `json:"usage_quantity,omitempty"`
	UsageUnit         string    `json:"usage_unit,omitempty"`
	Metadata          string    `json:"metadata,omitempty"`
	FetchedAt         time.Time `json:"fetched_at"`
}

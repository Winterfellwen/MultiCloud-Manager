package cost

import (
	"context"
	"database/sql"
	"time"
)

type Estimator struct {
	db *sql.DB
}

func NewEstimator(db *sql.DB) *Estimator {
	return &Estimator{db: db}
}

type EstimateInput struct {
	ResourceCacheID string
	AccountID       string
	Provider        string
	CloudResourceID string
	Tier            string
	Region          string
	Status          string
	PeriodStart     time.Time
	PeriodEnd       time.Time
}

func (e *Estimator) Estimate(ctx context.Context, in EstimateInput) (*CostData, error) {
	var pricePerHour float64
	err := e.db.QueryRowContext(ctx, `
		SELECT price_per_hour FROM pricing_plans
		WHERE provider = $1 AND region = $2 AND tier = $3
			AND (effective_from <= $4 OR effective_from IS NULL)
			AND (effective_to >= $4 OR effective_to IS NULL)
		ORDER BY effective_from DESC LIMIT 1`,
		in.Provider, in.Region, in.Tier, in.PeriodStart,
	).Scan(&pricePerHour)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	hours := in.PeriodEnd.Sub(in.PeriodStart).Hours()
	if hours < 0 {
		hours = 0
	}

	effectivePrice := pricePerHour
	if in.Status != "running" && in.Status != "" {
		effectivePrice = pricePerHour * 0.1
	}

	amount := effectivePrice * hours

	return &CostData{
		ResourceCacheID:    in.ResourceCacheID,
		AccountID:          in.AccountID,
		Provider:           in.Provider,
		CloudResourceID:    in.CloudResourceID,
		CostType:           "estimated",
		Amount:             amount,
		Currency:           "USD",
		BillingPeriodStart: in.PeriodStart,
		BillingPeriodEnd:   in.PeriodEnd,
		UsageQuantity:      hours,
		UsageUnit:          "hours",
		FetchedAt:          time.Now(),
	}, nil
}

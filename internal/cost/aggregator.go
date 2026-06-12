package cost

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type CostAggregator struct {
	db *sql.DB
}

func NewCostAggregator(db *sql.DB) *CostAggregator {
	return &CostAggregator{db: db}
}

type CostOverview struct {
	TotalAmount    float64          `json:"total_amount"`
	Currency       string           `json:"currency"`
	ByProvider     []CostByProvider `json:"by_provider"`
	PeriodStart    time.Time        `json:"period_start"`
	PeriodEnd      time.Time        `json:"period_end"`
	PrevTotalAmount float64         `json:"prev_total_amount"`
	ChangePercent  float64          `json:"change_percent"`
}

type CostByProvider struct {
	Provider string  `json:"provider"`
	Amount   float64 `json:"amount"`
}

type CostBreakdown struct {
	ResourceID   string  `json:"resource_id"`
	ResourceName string  `json:"resource_name"`
	Provider     string  `json:"provider"`
	ResourceType string  `json:"resource_type"`
	Amount       float64 `json:"amount"`
	CostType     string  `json:"cost_type"`
}

type CostTrendPoint struct {
	Date   time.Time `json:"date"`
	Amount float64   `json:"amount"`
}

func (ca *CostAggregator) Overview(ctx context.Context, providers []string, start, end time.Time) (*CostOverview, error) {
	args := []interface{}{start, end}
	providerFilter := ""
	if len(providers) > 0 {
		providerFilter = " AND provider = ANY($3)"
		args = append(args, providers)
	}

	var total float64
	row := ca.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM cost_data
		WHERE billing_period_start >= $1 AND billing_period_end <= $2`+providerFilter, args...)
	if err := row.Scan(&total); err != nil {
		return nil, err
	}

	rows, err := ca.db.QueryContext(ctx, `
		SELECT provider, COALESCE(SUM(amount), 0) FROM cost_data
		WHERE billing_period_start >= $1 AND billing_period_end <= $2`+providerFilter+`
		GROUP BY provider ORDER BY provider`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var byProvider []CostByProvider
	for rows.Next() {
		var p string
		var a float64
		if err := rows.Scan(&p, &a); err != nil {
			return nil, err
		}
		byProvider = append(byProvider, CostByProvider{Provider: p, Amount: a})
	}

	periodLen := end.Sub(start)
	prevEnd := start
	prevStart := start.Add(-periodLen)

	var prevTotal float64
	prevArgs := []interface{}{prevStart, prevEnd}
	if len(providers) > 0 {
		prevArgs = append(prevArgs, providers)
	}
	ca.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM cost_data
		WHERE billing_period_start >= $1 AND billing_period_end <= $2`+providerFilter, prevArgs...).Scan(&prevTotal)

	changePercent := 0.0
	if prevTotal > 0 {
		changePercent = (total - prevTotal) / prevTotal * 100
	}

	return &CostOverview{
		TotalAmount:     total,
		Currency:        "USD",
		ByProvider:      byProvider,
		PeriodStart:     start,
		PeriodEnd:       end,
		PrevTotalAmount: prevTotal,
		ChangePercent:   changePercent,
	}, nil
}

func (ca *CostAggregator) Breakdown(ctx context.Context, providers []string, start, end time.Time) ([]CostBreakdown, error) {
	args := []interface{}{start, end}
	providerFilter := ""
	if len(providers) > 0 {
		providerFilter = " AND cd.provider = ANY($3)"
		args = append(args, providers)
	}

	rows, err := ca.db.QueryContext(ctx, `
		SELECT cd.cloud_resource_id, COALESCE(rc.name, ''), cd.provider,
			COALESCE(rc.resource_type, ''), cd.amount, cd.cost_type
		FROM cost_data cd
		LEFT JOIN resources_cache rc ON rc.id = cd.resource_cache_id
		WHERE cd.billing_period_start >= $1 AND cd.billing_period_end <= $2`+providerFilter+`
		ORDER BY cd.amount DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CostBreakdown
	for rows.Next() {
		var b CostBreakdown
		if err := rows.Scan(&b.ResourceID, &b.ResourceName, &b.Provider, &b.ResourceType, &b.Amount, &b.CostType); err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, nil
}

func (ca *CostAggregator) Trend(ctx context.Context, providers []string, start, end time.Time, interval string) ([]CostTrendPoint, error) {
	dateTrunc := "day"
	switch interval {
	case "week":
		dateTrunc = "week"
	case "month":
		dateTrunc = "month"
	}

	args := []interface{}{start, end, dateTrunc}
	providerFilter := ""
	if len(providers) > 0 {
		providerFilter = " AND provider = ANY($4)"
		args = append(args, providers)
	}

	rows, err := ca.db.QueryContext(ctx, `
		SELECT date_trunc($3, billing_period_start) AS period,
			COALESCE(SUM(amount), 0) AS total
		FROM cost_data
		WHERE billing_period_start >= $1 AND billing_period_end <= $2`+providerFilter+`
		GROUP BY period ORDER BY period`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CostTrendPoint
	for rows.Next() {
		var p CostTrendPoint
		if err := rows.Scan(&p.Date, &p.Amount); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, nil
}

func (ca *CostAggregator) CompareCrossCloud(ctx context.Context, tier string, region string) ([]PricingEntry, error) {
	rows, err := ca.db.QueryContext(ctx, `
		SELECT provider, region, tier, price_per_hour, price_per_month
		FROM pricing_plans WHERE tier = $1 AND region = $2`, tier, region)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []PricingEntry
	for rows.Next() {
		var e PricingEntry
		if err := rows.Scan(&e.Provider, &e.Region, &e.Tier, &e.PricePerHour, &e.PricePerMonth); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, nil
}

func (ca *CostAggregator) Forecast(ctx context.Context, providers []string) ([]CostTrendPoint, error) {
	args := []interface{}{}
	providerFilter := ""
	if len(providers) > 0 {
		providerFilter = " AND provider = ANY($1)"
		args = append(args, providers)
	}

	// Simple forecast: average daily cost over the last 30 days, projected 30 days forward
	rows, err := ca.db.QueryContext(ctx, `
		SELECT date_trunc('day', billing_period_start) AS day, SUM(amount) AS total
		FROM cost_data
		WHERE billing_period_start >= NOW() - INTERVAL '30 days'`+providerFilter+`
		GROUP BY day ORDER BY day`, args...)
	if err != nil {
		return nil, fmt.Errorf("forecast query: %w", err)
	}
	defer rows.Close()

	var dailyTotals []float64
	for rows.Next() {
		var day time.Time
		var total float64
		if err := rows.Scan(&day, &total); err != nil {
			return nil, err
		}
		dailyTotals = append(dailyTotals, total)
	}

	if len(dailyTotals) == 0 {
		return []CostTrendPoint{}, nil
	}

	var sum float64
	for _, d := range dailyTotals {
		sum += d
	}
	avgDaily := sum / float64(len(dailyTotals))

	now := time.Now()
	var forecast []CostTrendPoint
	for i := 1; i <= 30; i++ {
		forecast = append(forecast, CostTrendPoint{
			Date:   now.AddDate(0, 0, i),
			Amount: avgDaily,
		})
	}
	return forecast, nil
}

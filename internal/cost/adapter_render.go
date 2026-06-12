package cost

import (
	"context"
	"time"
)

type RenderEstimatorAdapter struct{}

func (r *RenderEstimatorAdapter) Provider() string { return "render" }

func (r *RenderEstimatorAdapter) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// Always estimate — Render has no billing API
	return nil, nil
}

package cost

import (
	"context"
	"time"
)

type OracleEstimatorAdapter struct{}

func (o *OracleEstimatorAdapter) Provider() string { return "oracle" }

func (o *OracleEstimatorAdapter) Fetch(ctx context.Context, creds map[string]string, start, end time.Time) ([]CostData, error) {
	// Always estimate — Oracle has no billing API
	return nil, nil
}

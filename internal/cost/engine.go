package cost

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

type AccountInfo struct {
	ID        string
	Name      string
	CloudType string
	VaultPath string
}

type CostEngine struct {
	db         *sql.DB
	aggregator *CostAggregator
	estimator  *Estimator
	optimizer  *Optimizer
	running    bool
	stopCh     chan struct{}
}

func NewCostEngine(db *sql.DB) *CostEngine {
	return &CostEngine{
		db:         db,
		aggregator: NewCostAggregator(db),
		estimator:  NewEstimator(db),
		optimizer:  NewOptimizer(db),
		stopCh:     make(chan struct{}),
	}
}

func (ce *CostEngine) Aggregator() *CostAggregator { return ce.aggregator }
func (ce *CostEngine) Estimator() *Estimator       { return ce.estimator }
func (ce *CostEngine) Optimizer() *Optimizer       { return ce.optimizer }
func (ce *CostEngine) DB() *sql.DB                 { return ce.db }

func (ce *CostEngine) getActiveAccounts(ctx context.Context) ([]AccountInfo, error) {
	rows, err := ce.db.QueryContext(ctx, `
		SELECT id, name, cloud_type, COALESCE(vault_path, '') FROM cloud_accounts WHERE is_active = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []AccountInfo
	for rows.Next() {
		var a AccountInfo
		if err := rows.Scan(&a.ID, &a.Name, &a.CloudType, &a.VaultPath); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}

func (ce *CostEngine) loadCredentials(ctx context.Context, accountID, vaultPath string) map[string]string {
	if vaultPath != "" {
		var vaultData []byte
		err := ce.db.QueryRowContext(ctx,
			`SELECT credential FROM credentials WHERE name = $1 ORDER BY created_at DESC LIMIT 1`,
			accountID).Scan(&vaultData)
		if err == nil {
			var creds map[string]string
			if json.Unmarshal(vaultData, &creds) == nil {
				return creds
			}
		}
	}

	var credJSON string
	err := ce.db.QueryRowContext(ctx,
		`SELECT credentials FROM cloud_accounts WHERE id = $1`, accountID).Scan(&credJSON)
	if err != nil {
		return nil
	}

	var creds map[string]string
	if json.Unmarshal([]byte(credJSON), &creds) != nil {
		return nil
	}
	return creds
}

func (ce *CostEngine) estimateForAccount(ctx context.Context, acct AccountInfo, periodStart, periodEnd time.Time) ([]CostData, error) {
	rows, err := ce.db.QueryContext(ctx, `
		SELECT id, cloud_resource_id, resource_type, cloud_region, status, COALESCE(name, '')
		FROM resources_cache WHERE account_id = $1`, acct.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CostData
	for rows.Next() {
		var id, cloudResID, tier, region, status, name string
		if err := rows.Scan(&id, &cloudResID, &tier, &region, &status, &name); err != nil {
			continue
		}
		if region == "" {
			region = "eastus"
		}
		if tier == "" {
			tier = "Standard_B1s"
		}

		cd, err := ce.estimator.Estimate(ctx, EstimateInput{
			ResourceCacheID: id,
			AccountID:       acct.ID,
			Provider:        acct.CloudType,
			CloudResourceID: cloudResID,
			Tier:            tier,
			Region:          region,
			Status:          status,
			PeriodStart:     periodStart,
			PeriodEnd:       periodEnd,
		})
		if err != nil {
			log.Printf("cost: estimate error for %s/%s: %v", acct.Name, cloudResID, err)
			continue
		}
		if cd != nil {
			result = append(result, *cd)
		}
	}
	return result, nil
}

func (ce *CostEngine) insertCostData(ctx context.Context, cd *CostData) error {
	_, err := ce.db.ExecContext(ctx, `
		INSERT INTO cost_data (resource_cache_id, account_id, provider, cloud_resource_id, cost_type,
			amount, currency, billing_period_start, billing_period_end, usage_quantity, usage_unit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		cd.ResourceCacheID, cd.AccountID, cd.Provider, cd.CloudResourceID, cd.CostType,
		cd.Amount, cd.Currency, cd.BillingPeriodStart, cd.BillingPeriodEnd, cd.UsageQuantity, cd.UsageUnit)
	return err
}

func (ce *CostEngine) SyncAll(ctx context.Context) error {
	accounts, err := ce.getActiveAccounts(ctx)
	if err != nil {
		return fmt.Errorf("cost: get accounts: %w", err)
	}

	now := time.Now()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := now

	for _, acct := range accounts {
		fetcher := NewCostFetcher(acct.CloudType)
		if fetcher == nil {
			continue
		}

		creds := ce.loadCredentials(ctx, acct.ID, acct.VaultPath)
		costData, err := fetcher.Fetch(ctx, creds, periodStart, periodEnd)
		if err != nil || len(costData) == 0 {
			costData, err = ce.estimateForAccount(ctx, acct, periodStart, periodEnd)
			if err != nil {
				log.Printf("cost: estimation failed for %s: %v", acct.Name, err)
				continue
			}
		}

		for i := range costData {
			if err := ce.insertCostData(ctx, &costData[i]); err != nil {
				log.Printf("cost: insert failed for %s: %v", acct.Name, err)
			}
		}
	}

	return nil
}

func (ce *CostEngine) Start(ctx context.Context) {
	if ce.running {
		return
	}
	ce.running = true

	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		ce.syncOnce(ctx)

		for {
			select {
			case <-ticker.C:
				ce.syncOnce(ctx)
			case <-ce.stopCh:
				ce.running = false
				return
			}
		}
	}()
}

func (ce *CostEngine) Stop() {
	close(ce.stopCh)
	ce.running = false
}

func (ce *CostEngine) syncOnce(ctx context.Context) {
	if err := ce.SyncAll(ctx); err != nil {
		log.Printf("cost: sync error: %v", err)
	}
}

package cloud

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"multicloud/internal/cloud/providers"
	"multicloud/internal/cloud/types"
	"multicloud/internal/vault"
)

type Syncer struct {
	db         *sql.DB
	vault      vault.Service
	lastSyncAt time.Time
	lastErrors []string
	mu         sync.RWMutex
	bgCtx      context.Context
	bgCancel   context.CancelFunc
	started    bool
}

func NewSyncer(db *sql.DB, v vault.Service) *Syncer {
	return &Syncer{
		db:    db,
		vault: v,
	}
}

func (s *Syncer) Start(ctx context.Context, interval time.Duration) {
	if s.db == nil || s.started {
		return
	}
	s.bgCtx, s.bgCancel = context.WithCancel(ctx)
	s.started = true
	go func() {
		log.Printf("syncer: background sync started every %v", interval)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		s.SyncAll(s.bgCtx)
		for {
			select {
			case <-ticker.C:
				s.SyncAll(s.bgCtx)
			case <-s.bgCtx.Done():
				log.Println("syncer: stopped")
				return
			}
		}
	}()
}

func (s *Syncer) Stop() {
	if s.bgCancel != nil {
		s.bgCancel()
	}
	s.started = false
}

func (s *Syncer) GetLastSync() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastSyncAt
}

func (s *Syncer) SyncAll(ctx context.Context) error {
	if s.db == nil {
		return nil
	}

	rows, err := s.db.QueryContext(ctx, `SELECT id, cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE is_active = true`)
	if err != nil {
		return fmt.Errorf("syncer: query accounts: %w", err)
	}
	defer rows.Close()

	var syncErrors []string
	for rows.Next() {
		var id, cloudType string
		var credJSON string
		var vaultPath string
		if err := rows.Scan(&id, &cloudType, &credJSON, &vaultPath); err != nil {
			log.Printf("syncer: scan row: %v", err)
			continue
		}

		// Prefer vault credentials over plaintext
		if vaultPath != "" && s.vault != nil {
			if secretData, err := s.vault.GetSecret(vaultPath); err == nil {
				if dataBytes, err := json.Marshal(secretData); err == nil {
					credJSON = string(dataBytes)
				}
			} else {
				log.Printf("syncer: vault read %s failed: %v, falling back to DB", vaultPath, err)
			}
		}

		if err := s.syncAccount(ctx, id, cloudType, credJSON); err != nil {
			log.Printf("syncer: sync account %s (%s): %v", id, cloudType, err)
			syncErrors = append(syncErrors, fmt.Sprintf("%s: %v", cloudType, err))
		}
	}

	s.mu.Lock()
	s.lastSyncAt = time.Now()
	s.lastErrors = syncErrors
	s.mu.Unlock()

	if len(syncErrors) > 0 {
		return fmt.Errorf("sync errors: %s", strings.Join(syncErrors, "; "))
	}
	return nil
}

func (s *Syncer) syncAccount(ctx context.Context, accountID, cloudType, credJSON string) error {
	var creds map[string]string

	// Try to load credentials from vault first (if vault_path is set)
	// The caller should pass vault_path; for now, try parsing credJSON directly
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return fmt.Errorf("parse credentials: %w", err)
	}

	prov := createProvider(cloudType, creds)
	if prov == nil {
		return nil
	}

	instances, err := prov.ListInstances(ctx, types.ListOptions{Limit: 100})
	if err != nil {
		return fmt.Errorf("list instances: %w", err)
	}

	liveIDs := make(map[string]bool, len(instances))
	for _, inst := range instances {
		liveIDs[inst.ID] = true
		specJSON, err := json.Marshal(inst.Spec)
		if err != nil {
			log.Printf("syncer: marshal spec for %s: %v", inst.ID, err)
			specJSON = []byte("{}")
		}
		tagsJSON, err := json.Marshal(inst.Tags)
		if err != nil {
			log.Printf("syncer: marshal tags for %s: %v", inst.ID, err)
			tagsJSON = []byte("{}")
		}

		_, err = s.db.Exec(`
			INSERT INTO resources_cache (account_id, cloud_resource_id, resource_type, cloud_region, name, status, spec, tags)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
			ON CONFLICT (account_id, cloud_resource_id)
			DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, spec = EXCLUDED.spec, tags = EXCLUDED.tags, last_synced_at = CURRENT_TIMESTAMP
		`, accountID, inst.ID, inst.InstanceType, inst.Region, inst.Name, inst.Status, string(specJSON), string(tagsJSON))
		if err != nil {
			log.Printf("syncer: upsert resource %s: %v", inst.Name, err)
		}
	}

	s.detectDeletedResources(ctx, accountID, liveIDs)

	_, err = s.db.Exec(`UPDATE cloud_accounts SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1`, accountID)
	if err != nil {
		log.Printf("syncer: update last_sync_at for %s: %v", accountID, err)
	}
	return nil
}

func (s *Syncer) detectDeletedResources(ctx context.Context, accountID string, liveIDs map[string]bool) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, cloud_resource_id, name, resource_type FROM resources_cache WHERE account_id = $1`, accountID)
	if err != nil {
		log.Printf("syncer: query cache: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var cacheID, cloudResID string
		var name, resType sql.NullString
		if err := rows.Scan(&cacheID, &cloudResID, &name, &resType); err != nil {
			continue
		}
		if !liveIDs[cloudResID] {
			_, delErr := s.db.Exec(`DELETE FROM resources_cache WHERE id = $1`, cacheID)
			if delErr != nil {
				log.Printf("syncer: delete resource %s: %v", cacheID, err)
			} else {
				log.Printf("syncer: removed deleted resource %s (%s)", cloudResID, name.String)
			}
		}
	}
}

func (s *Syncer) GetResources(ctx context.Context) ([]map[string]interface{}, error) {
	if s.db == nil {
		return nil, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT rc.id, rc.name, rc.resource_type, rc.cloud_region, rc.status,
			rc.spec, rc.tags, ca.cloud_type, ca.name as account_name
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		ORDER BY ca.cloud_type, rc.resource_type, rc.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query resources: %w", err)
	}
	defer rows.Close()

	var resources []map[string]interface{}
	for rows.Next() {
		var id, name, resourceType, region, status, cloudType, accountName string
		var specJSON, tagsJSON []byte
		if err := rows.Scan(&id, &name, &resourceType, &region, &status, &specJSON, &tagsJSON, &cloudType, &accountName); err != nil {
			continue
		}

		var spec map[string]interface{}
		if len(specJSON) > 0 {
			json.Unmarshal(specJSON, &spec)
		}
		var tags map[string]interface{}
		if len(tagsJSON) > 0 {
			json.Unmarshal(tagsJSON, &tags)
		}

		r := map[string]interface{}{
			"id":         id,
			"name":       name,
			"type":       resourceType,
			"cloud_type": cloudType,
			"region":     region,
			"status":     status,
			"account":    accountName,
		}
		if spec != nil {
			for k, v := range spec {
				r[k] = v
			}
		}
		if tags != nil && len(tags) > 0 {
			r["tags"] = tags
		}
		resources = append(resources, r)
	}
	if resources == nil {
		resources = []map[string]interface{}{}
	}
	return resources, nil
}

func (s *Syncer) SyncAccount(ctx context.Context, accountID, cloudType, credJSON string) error {
	return s.syncAccount(ctx, accountID, cloudType, credJSON)
}

func (s *Syncer) GetProviderForResource(ctx context.Context, resourceID string) (types.Provider, string, error) {
	if s.db == nil {
		return nil, "", fmt.Errorf("no database")
	}

	var accountID, cloudType, credJSON, cloudResID string
	err := s.db.QueryRowContext(ctx, `
		SELECT rc.account_id, rc.cloud_resource_id, ca.cloud_type, ca.credentials
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		WHERE rc.id = $1
	`, resourceID).Scan(&accountID, &cloudResID, &cloudType, &credJSON)
	if err != nil {
		return nil, "", fmt.Errorf("resource lookup: %w", err)
	}

	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return nil, "", fmt.Errorf("parse credentials: %w", err)
	}

	prov := createProvider(cloudType, creds)
	if prov == nil {
		return nil, "", fmt.Errorf("unsupported cloud type: %s", cloudType)
	}

	return prov, cloudResID, nil
}

func createProvider(cloudType string, creds map[string]string) types.Provider {
	switch cloudType {
	case "azure":
		return providers.NewAzureProvider(creds)
	case "tencent":
		return providers.NewTencentProvider(creds)
	case "oracle":
		return providers.NewOracleProvider(creds)
	case "render":
		return providers.NewRenderProvider(creds)
	default:
		return nil
	}
}

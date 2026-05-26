package cloud

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"multicloud-manager/internal/cloud/providers"
)

type Syncer struct {
	DB         Database
	lastSyncAt time.Time
	mu         sync.RWMutex
	bgCtx      context.Context
	bgCancel   context.CancelFunc
	started    bool
}

type Database interface {
	Query(query string, args ...interface{}) (*sql.Rows, error)
	QueryRow(query string, args ...interface{}) *sql.Row
	Exec(query string, args ...interface{}) (sql.Result, error)
}

// Start begins periodic background sync
func (s *Syncer) Start(ctx context.Context, interval time.Duration) {
	if s.DB == nil || s.started {
		return
	}
	s.bgCtx, s.bgCancel = context.WithCancel(ctx)
	s.started = true
	go func() {
		log.Printf("syncer: background sync started every %v", interval)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		s.syncOnce(s.bgCtx)
		for {
			select {
			case <-ticker.C:
				s.syncOnce(s.bgCtx)
			case <-s.bgCtx.Done():
				log.Println("syncer: background sync stopped")
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

// GetLastSync returns the last successful sync time
func (s *Syncer) GetLastSync() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastSyncAt
}

// SyncAll triggers an immediate full sync
func (s *Syncer) SyncAll(ctx context.Context) error {
	if s.DB == nil {
		return nil
	}
	return s.syncOnce(ctx)
}

func (s *Syncer) syncOnce(ctx context.Context) error {
	rows, err := s.DB.Query(`SELECT id, cloud_type, encrypted_credentials FROM cloud_accounts WHERE is_active = true`)
	if err != nil {
		return fmt.Errorf("syncer: query accounts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, cloudType string
		var credBytes []byte
		if err := rows.Scan(&id, &cloudType, &credBytes); err != nil {
			log.Printf("syncer: scan row: %v", err)
			continue
		}
		if err := s.syncAccount(ctx, id, cloudType, string(credBytes)); err != nil {
			log.Printf("syncer: sync account %s (%s): %v", id, cloudType, err)
		}
	}

	s.mu.Lock()
	s.lastSyncAt = time.Now()
	s.mu.Unlock()
	return nil
}

func (s *Syncer) syncAccount(ctx context.Context, accountID, cloudType, credJSON string) error {
	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return fmt.Errorf("parse credentials: %w", err)
	}

	prov := createProvider(cloudType, creds)
	if prov == nil {
		return nil
	}

	instances, err := prov.ListInstances(ctx, ListOptions{Limit: 100})
	if err != nil {
		return fmt.Errorf("list instances: %w", err)
	}

	// Build set of cloud_resource_ids from API response
	liveIDs := make(map[string]bool, len(instances))
	for _, inst := range instances {
		liveIDs[inst.ID] = true
		specJSON, _ := json.Marshal(inst.Spec)
		tagsJSON, _ := json.Marshal(inst.Tags)

		_, err := s.DB.Exec(`
			INSERT INTO resources_cache (id, account_id, resource_type, cloud_resource_id, cloud_region, name, status, spec, tags)
			VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
			ON CONFLICT (account_id, cloud_resource_id)
			DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, spec = EXCLUDED.spec, tags = EXCLUDED.tags, last_synced_at = CURRENT_TIMESTAMP
		`, accountID, inst.InstanceType, inst.ID, inst.Region, inst.Name, inst.Status, string(specJSON), string(tagsJSON))
		if err != nil {
			log.Printf("syncer: upsert resource %s: %v", inst.Name, err)
		}
	}

	// Detect resources deleted externally (in cache but not in API response)
	s.detectDeletedResources(ctx, accountID, cloudType, liveIDs)

	_, err = s.DB.Exec(`UPDATE cloud_accounts SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1`, accountID)
	return err
}

func (s *Syncer) detectDeletedResources(ctx context.Context, accountID, cloudType string, liveIDs map[string]bool) {
	rows, err := s.DB.Query(
		`SELECT id, cloud_resource_id, name, resource_type FROM resources_cache WHERE account_id = $1`,
		accountID,
	)
	if err != nil {
		log.Printf("syncer: query cache for deletion detection: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var cacheID, cloudResID string
		var name, resType sql.NullString
		if err := rows.Scan(&cacheID, &cloudResID, &name, &resType); err != nil {
			log.Printf("syncer: scan cache row: %v", err)
			continue
		}
		if !liveIDs[cloudResID] {
			_, err := s.DB.Exec(`
				INSERT INTO resource_deletions (resource_cache_id, account_id, cloud_resource_id, cloud_type, resource_name, resource_type, deletion_type, metadata)
				VALUES ($1, $2, $3, $4, $5, $6, 'external', '{"detected_by":"background_sync"}')
			`, cacheID, accountID, cloudResID, cloudType, name.String, resType.String)
			if err != nil {
				log.Printf("syncer: log deletion: %v", err)
			}
			s.DB.Exec(`DELETE FROM resources_cache WHERE id = $1`, cacheID)
			log.Printf("syncer: detected externally deleted resource %s (%s)", cloudResID, name.String)
		}
	}
}

// GetResources reads synced resources from cache
func (s *Syncer) GetResources(ctx context.Context) ([]map[string]interface{}, error) {
	if s.DB == nil {
		return nil, nil
	}

	rows, err := s.DB.Query(`
		SELECT rc.id, rc.name, rc.resource_type, rc.cloud_region, rc.status,
			rc.spec, ca.cloud_type, ca.name as account_name
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		ORDER BY rc.last_synced_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query resources: %w", err)
	}
	defer rows.Close()

	var resources []map[string]interface{}
	for rows.Next() {
		var id, name, resourceType, region, status, cloudType, accountName string
		var specJSON []byte
		if err := rows.Scan(&id, &name, &resourceType, &region, &status, &specJSON, &cloudType, &accountName); err != nil {
			log.Printf("scan resource row: %v", err)
			continue
		}

		var spec map[string]interface{}
		if len(specJSON) > 0 {
			json.Unmarshal(specJSON, &spec)
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
		resources = append(resources, r)
	}
	if resources == nil {
		resources = []map[string]interface{}{}
	}
	return resources, nil
}

// LogDeletion records a resource deletion performed via the app (UI or AI Agent)
func (s *Syncer) LogDeletion(ctx context.Context, resourceID, userID, username string) error {
	if s.DB == nil {
		return nil
	}

	var cacheID, cloudResID, cloudType, name string
	err := s.DB.QueryRow(`SELECT id, cloud_resource_id, cloud_type, name FROM resources_cache WHERE id = $1`, resourceID).Scan(&cacheID, &cloudResID, &cloudType, &name)
	if err != nil {
		return fmt.Errorf("query deleted resource: %w", err)
	}
	if err != nil {
		return fmt.Errorf("query deleted resource: %w", err)
	}

	meta, _ := json.Marshal(map[string]string{
		"deleted_by":   userID,
		"deleted_by_username": username,
	})

	_, err = s.DB.Exec(`
		INSERT INTO resource_deletions (resource_cache_id, account_id, cloud_resource_id, cloud_type, resource_name, deletion_type, deleted_by, deleted_by_username, metadata)
		VALUES ($1, (SELECT account_id FROM resources_cache WHERE id = $1), $2, $3, $4, 'manual', $5, $6, $7::jsonb)
	`, cacheID, cloudResID, cloudType, name, userID, username, string(meta))
	if err != nil {
		return fmt.Errorf("log deletion: %w", err)
	}

	_, err = s.DB.Exec(`DELETE FROM resources_cache WHERE id = $1`, cacheID)
	return err
}

// GetDeletions returns the resource deletion audit log
func (s *Syncer) GetDeletions(ctx context.Context) ([]map[string]interface{}, error) {
	if s.DB == nil {
		return nil, nil
	}

	rows, err := s.DB.Query(`
		SELECT id, cloud_resource_id, cloud_type, resource_name, resource_type,
			deletion_type, deleted_by_username, detected_at
		FROM resource_deletions
		ORDER BY detected_at DESC
		LIMIT 100
	`)
	if err != nil {
		return nil, fmt.Errorf("query deletions: %w", err)
	}
	defer rows.Close()

	var deletions []map[string]interface{}
	for rows.Next() {
		var id, cloudResID, cloudType, delType, detectedAt string
		var name, resType, deletedBy sql.NullString
		if err := rows.Scan(&id, &cloudResID, &cloudType, &name, &resType, &delType, &deletedBy, &detectedAt); err != nil {
			log.Printf("scan deletion row: %v", err)
			continue
		}
		deletions = append(deletions, map[string]interface{}{
			"id":               id,
			"cloud_resource_id": cloudResID,
			"cloud_type":        cloudType,
			"resource_name":     name.String,
			"resource_type":     resType.String,
			"deletion_type":     delType,
			"deleted_by":        deletedBy.String,
			"detected_at":       detectedAt,
		})
	}
	return deletions, nil
}

func createProvider(cloudType string, creds map[string]string) Provider {
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

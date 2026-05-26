package cloud

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"multicloud-manager/internal/cloud/providers"
)

type Syncer struct {
	DB Database
}

type Database interface {
	Query(query string, args ...interface{}) (*sql.Rows, error)
	Exec(query string, args ...interface{}) (sql.Result, error)
}

// SyncAll syncs resources for all active cloud accounts
func (s *Syncer) SyncAll(ctx context.Context) error {
	if s.DB == nil {
		log.Println("syncer: no database configured, skipping sync")
		return nil
	}

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

		if err := s.SyncAccount(ctx, id, cloudType, string(credBytes)); err != nil {
			log.Printf("syncer: sync account %s (%s): %v", id, cloudType, err)
		}
	}

	return nil
}

// SyncAccount syncs a single cloud account
func (s *Syncer) SyncAccount(ctx context.Context, accountID, cloudType, credJSON string) error {
	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return fmt.Errorf("parse credentials: %w", err)
	}

	prov := createProvider(cloudType, creds)
	if prov == nil {
		log.Printf("syncer: no provider for %s (account %s)", cloudType, accountID)
		return nil
	}

	instances, err := prov.ListInstances(ctx, ListOptions{Limit: 100})
	if err != nil {
		return fmt.Errorf("list instances: %w", err)
	}

	for _, inst := range instances {
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

	_, err = s.DB.Exec(`UPDATE cloud_accounts SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1`, accountID)
	return err
}

type accountWithCreds struct {
	ID        string
	CloudType string
	Creds     map[string]string
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

// SyncAndGetResources syncs then returns resources
func (s *Syncer) SyncAndGetResources(ctx context.Context) ([]map[string]interface{}, error) {
	if err := s.SyncAll(ctx); err != nil {
		log.Printf("sync error: %v", err)
	}
	return s.GetResources(ctx)
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



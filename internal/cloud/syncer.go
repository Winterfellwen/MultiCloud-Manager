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

type SyncResult struct {
	AccountID    string
	CloudType    string
	Status       string // "success" or "error"
	Message      string
	ResourceCount int
}

func (s *Syncer) SyncAll(ctx context.Context) ([]SyncResult, error) {
	if s.db == nil {
		return nil, nil
	}

	rows, err := s.db.QueryContext(ctx, `SELECT id, cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE is_active = true`)
	if err != nil {
		return nil, fmt.Errorf("syncer: query accounts: %w", err)
	}
	defer rows.Close()

	var results []SyncResult
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

		count, err := s.syncAccount(ctx, id, cloudType, credJSON)
		var res SyncResult
		res.AccountID = id
		res.CloudType = cloudType
		res.ResourceCount = count
		if err != nil {
			res.Status = "error"
			res.Message = err.Error()
			log.Printf("syncer: sync account %s (%s): %v", id, cloudType, err)
			syncErrors = append(syncErrors, fmt.Sprintf("%s: %v", cloudType, err))
		} else {
			res.Status = "success"
			res.Message = "OK"
		}
		results = append(results, res)
		
		// Log to database
		s.logSyncResult(ctx, res)
	}
	if err := rows.Err(); err != nil {
		log.Printf("syncer: error iterating accounts: %v", err)
	}

	s.mu.Lock()
	s.lastSyncAt = time.Now()
	s.lastErrors = syncErrors
	s.mu.Unlock()

	// Return results instead of error for partial failures
	// Only return error if ALL accounts failed (critical failure)
	if len(results) > 0 && len(syncErrors) == len(results) {
		return results, fmt.Errorf("all accounts failed: %s", strings.Join(syncErrors, "; "))
	}
	return results, nil
}

func (s *Syncer) logSyncResult(ctx context.Context, res SyncResult) {
	if s.db == nil {
		return
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sync_logs (account_id, cloud_type, status, message, resource_count) VALUES ($1, $2, $3, $4, $5)`,
		res.AccountID, res.CloudType, res.Status, res.Message, res.ResourceCount)
	if err != nil {
		log.Printf("syncer: failed to log sync result: %v", err)
	}
}

// tencentRegions is the list of Tencent Cloud regions to query when no specific region is set.
var tencentRegions = []string{
	"ap-guangzhou", "ap-shanghai", "ap-beijing", "ap-hongkong",
	"ap-singapore", "ap-mumbai", "ap-seoul", "ap-tokyo",
	"na-siliconvalley", "na-ashburn", "eu-frankfurt",
}

func (s *Syncer) syncAccount(ctx context.Context, accountID, cloudType, credJSON string) (int, error) {
	log.Printf("syncer: starting sync for account %s (%s)", accountID, cloudType)
	var creds map[string]string

	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return 0, fmt.Errorf("parse credentials: %w", err)
	}

	prov := NewProvider(cloudType, creds)
	if prov == nil {
		log.Printf("syncer: no provider for %s", cloudType)
		return 0, nil
	}

	opts := types.ListOptions{Limit: 100}
	totalCount := 0
	allLiveIDs := make(map[string]bool)

	type syncJob struct {
		name     string
		listFn   func() ([]map[string]interface{}, error)
	}

	jobs := []syncJob{
		{"instance", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListInstances(ctx, opts)) }},
		{"volume", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListVolumes(ctx, opts)) }},
		{"network", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListNetworks(ctx, opts)) }},
		{"database", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListDatabases(ctx, opts)) }},
		{"loadbalancer", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListLoadBalancers(ctx, opts)) }},
		{"bucket", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListBuckets(ctx, opts)) }},
		{"cluster", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListClusters(ctx, opts)) }},
		{"function", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListFunctions(ctx, opts)) }},
		{"dns_zone", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListDNSZones(ctx, opts)) }},
		{"certificate", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListCertificates(ctx, opts)) }},
		// —— 新增资源类型 ——
		{"redis", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListRedis(ctx, opts)) }},
		{"mq", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListMQ(ctx, opts)) }},
		{"cdn", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListCDN(ctx, opts)) }},
		{"waf", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListWAF(ctx, opts)) }},
		{"nat_gateway", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListNATGateways(ctx, opts)) }},
		{"image", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListImages(ctx, opts)) }},
		{"api_gateway", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListAPIGateways(ctx, opts)) }},
		{"log_service", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListLogServices(ctx, opts)) }},
		{"security_group", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListSecurityGroups(ctx, opts)) }},
		{"registry", func() ([]map[string]interface{}, error) { return s.listToMaps(prov.ListRegistries(ctx, opts)) }},
	}

	for _, j := range jobs {
		log.Printf("syncer: syncing %s for %s", j.name, cloudType)
		// For Tencent Cloud, query all regions when no region is specified
		if cloudType == "tencent" && opts.Region == "" {
			for _, region := range tencentRegions {
				regionalOpts := types.ListOptions{Limit: 100, Region: region}
				var resources []map[string]interface{}
				var err error
				switch j.name {
				case "instance":
					resources, err = s.listToMaps(prov.ListInstances(ctx, regionalOpts))
				case "volume":
					resources, err = s.listToMaps(prov.ListVolumes(ctx, regionalOpts))
				case "network":
					resources, err = s.listToMaps(prov.ListNetworks(ctx, regionalOpts))
				case "database":
					resources, err = s.listToMaps(prov.ListDatabases(ctx, regionalOpts))
				case "loadbalancer":
					resources, err = s.listToMaps(prov.ListLoadBalancers(ctx, regionalOpts))
				case "bucket":
					resources, err = s.listToMaps(prov.ListBuckets(ctx, regionalOpts))
				case "cluster":
					resources, err = s.listToMaps(prov.ListClusters(ctx, regionalOpts))
				case "function":
					resources, err = s.listToMaps(prov.ListFunctions(ctx, regionalOpts))
				case "dns_zone":
					resources, err = s.listToMaps(prov.ListDNSZones(ctx, regionalOpts))
				case "certificate":
					resources, err = s.listToMaps(prov.ListCertificates(ctx, regionalOpts))
				case "redis":
					resources, err = s.listToMaps(prov.ListRedis(ctx, regionalOpts))
				case "mq":
					resources, err = s.listToMaps(prov.ListMQ(ctx, regionalOpts))
				case "cdn":
					resources, err = s.listToMaps(prov.ListCDN(ctx, regionalOpts))
				case "waf":
					resources, err = s.listToMaps(prov.ListWAF(ctx, regionalOpts))
				case "nat_gateway":
					resources, err = s.listToMaps(prov.ListNATGateways(ctx, regionalOpts))
				case "image":
					resources, err = s.listToMaps(prov.ListImages(ctx, regionalOpts))
				case "api_gateway":
					resources, err = s.listToMaps(prov.ListAPIGateways(ctx, regionalOpts))
				case "log_service":
					resources, err = s.listToMaps(prov.ListLogServices(ctx, regionalOpts))
				case "security_group":
					resources, err = s.listToMaps(prov.ListSecurityGroups(ctx, regionalOpts))
				case "registry":
					resources, err = s.listToMaps(prov.ListRegistries(ctx, regionalOpts))
				}
				if err != nil {
					log.Printf("syncer: list %s for %s (%s) in %s: %v", j.name, cloudType, accountID, region, err)
					continue
				}
				for _, res := range resources {
					id, _ := res["id"].(string)
					if id == "" {
						continue
					}
					allLiveIDs[id+"|"+j.name] = true
					name, _ := res["name"].(string)
					region, _ := res["region"].(string)
					status, _ := res["status"].(string)

					spec, _ := res["spec"].(map[string]interface{})
					specJSON, _ := json.Marshal(spec)
					if len(specJSON) == 0 {
						specJSON = []byte("{}")
					}

					tagsRaw, _ := res["tags"].(map[string]interface{})
					tagsJSON, _ := json.Marshal(tagsRaw)
					if len(tagsJSON) == 0 {
						tagsJSON = []byte("{}")
					}

					_, err := s.db.Exec(`
						INSERT INTO resources_cache (account_id, cloud_resource_id, resource_type, cloud_region, name, status, spec, tags)
						VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
						ON CONFLICT (account_id, cloud_resource_id, resource_type)
						DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, spec = EXCLUDED.spec, tags = EXCLUDED.tags, last_synced_at = CURRENT_TIMESTAMP
					`, accountID, id, j.name, region, name, status, string(specJSON), string(tagsJSON))
					if err != nil {
						log.Printf("syncer: upsert %s %s: %v", j.name, name, err)
					}
					totalCount++
				}
			}
		} else {
			resources, err := j.listFn()
			if err != nil {
				log.Printf("syncer: list %s for %s (%s): %v", j.name, cloudType, accountID, err)
				// Don't delete resources on API failure — mark existing ones as live
				s.markExistingAsLive(ctx, accountID, j.name, allLiveIDs)
				continue
			}
			for _, res := range resources {
				id, _ := res["id"].(string)
				if id == "" {
					continue
				}
				allLiveIDs[id+"|"+j.name] = true
				name, _ := res["name"].(string)
				region, _ := res["region"].(string)
				status, _ := res["status"].(string)

				spec, _ := res["spec"].(map[string]interface{})
				specJSON, _ := json.Marshal(spec)
				if len(specJSON) == 0 {
					specJSON = []byte("{}")
				}

				tagsRaw, _ := res["tags"].(map[string]interface{})
				tagsJSON, _ := json.Marshal(tagsRaw)
				if len(tagsJSON) == 0 {
					tagsJSON = []byte("{}")
				}

				_, err := s.db.Exec(`
					INSERT INTO resources_cache (account_id, cloud_resource_id, resource_type, cloud_region, name, status, spec, tags)
					VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
					ON CONFLICT (account_id, cloud_resource_id, resource_type)
					DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, spec = EXCLUDED.spec, tags = EXCLUDED.tags, last_synced_at = CURRENT_TIMESTAMP
				`, accountID, id, j.name, region, name, status, string(specJSON), string(tagsJSON))
				if err != nil {
					log.Printf("syncer: upsert %s %s: %v", j.name, name, err)
				}
				totalCount++
			}
		}
	}

	s.detectDeletedResources(ctx, accountID, allLiveIDs)

	_, err := s.db.Exec(`UPDATE cloud_accounts SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1`, accountID)
	if err != nil {
		log.Printf("syncer: update last_sync_at for %s: %v", accountID, err)
	}
	return totalCount, nil
}

// listToMaps converts any List* result to []map[string]interface{} via JSON.
func (s *Syncer) listToMaps(data interface{}, err error) ([]map[string]interface{}, error) {
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(data)
	var result []map[string]interface{}
	json.Unmarshal(raw, &result)
	if result == nil {
		result = []map[string]interface{}{}
	}
	return result, nil
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
		// Use composite key: cloud_resource_id + resource_type
		compositeKey := cloudResID + "|" + resType.String
		if !liveIDs[compositeKey] {
			_, delErr := s.db.Exec(`DELETE FROM resources_cache WHERE id = $1`, cacheID)
			if delErr != nil {
				log.Printf("syncer: delete resource %s: %v", cacheID, delErr)
			} else {
				log.Printf("syncer: removed deleted resource %s (%s)", cloudResID, name.String)
			}
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("syncer: error iterating deleted resources: %v", err)
	}
}

// markExistingAsLive prevents deletion of resources when an API call fails.
// It queries existing resources of the given type and marks them as live.
func (s *Syncer) markExistingAsLive(ctx context.Context, accountID, resourceType string, liveIDs map[string]bool) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT cloud_resource_id FROM resources_cache WHERE account_id = $1 AND resource_type = $2`, accountID, resourceType)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var cloudResID string
		if err := rows.Scan(&cloudResID); err != nil {
			continue
		}
		liveIDs[cloudResID+"|"+resourceType] = true
	}
	if err := rows.Err(); err != nil {
		log.Printf("syncer: error marking existing as live: %v", err)
	}
}

func (s *Syncer) GetResources(ctx context.Context) ([]map[string]interface{}, error) {
	if s.db == nil {
		return nil, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT rc.id, rc.cloud_resource_id, rc.name, rc.resource_type, rc.cloud_region, rc.status,
			rc.spec, rc.tags, ca.cloud_type, ca.name as account_name,
			ca.id as account_id, COALESCE(ca.vault_path, '')
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		ORDER BY ca.cloud_type, rc.resource_type, rc.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query resources: %w", err)
	}
	defer rows.Close()

	// Cache providers per account to avoid repeated credential parsing
	providerCache := make(map[string]types.Provider)

	var resources []map[string]interface{}
	for rows.Next() {
		var id, cloudResID, name, resourceType, region, status, cloudType, accountName string
		var accountID, vaultPath string
		var specJSON, tagsJSON []byte
		if err := rows.Scan(&id, &cloudResID, &name, &resourceType, &region, &status, &specJSON, &tagsJSON, &cloudType, &accountName, &accountID, &vaultPath); err != nil {
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
			"id":            id,
			"name":          name,
			"resource_type": resourceType,
			"cloud_type":    cloudType,
			"region":        region,
			"status":        status,
			"account":       accountName,
		}
		if spec != nil {
			for k, v := range spec {
				r[k] = v
			}
		}
		if tags != nil && len(tags) > 0 {
			r["tags"] = tags
		}

		// Generate console_url using cached provider
		prov, ok := providerCache[accountID]
		if !ok && vaultPath != "" && s.vault != nil {
			// Only use vault credentials for security
			if secretData, err := s.vault.GetSecret(vaultPath); err == nil {
				creds := make(map[string]string, len(secretData))
				for k, v := range secretData {
					if s, ok := v.(string); ok {
						creds[k] = s
					}
				}
				prov = NewProvider(cloudType, creds)
				providerCache[accountID] = prov
			}
		}
		if prov != nil {
			consoleURL := prov.GetConsoleURL(types.ResourceType(resourceType), cloudResID, region)
			if consoleURL != "" {
				r["console_url"] = consoleURL
			} else if spec != nil {
				// Fallback: use dashboard_url or url from spec (e.g., Render)
				if du, ok := spec["dashboard_url"].(string); ok && du != "" {
					r["console_url"] = du
				} else if u, ok := spec["url"].(string); ok && u != "" {
					r["console_url"] = u
				}
			}
		}

		resources = append(resources, r)
	}
	if err := rows.Err(); err != nil {
		log.Printf("syncer: error iterating resources: %v", err)
	}
	if resources == nil {
		resources = []map[string]interface{}{}
	}
	return resources, nil
}

func (s *Syncer) SyncAccount(ctx context.Context, accountID, cloudType, credJSON string) error {
	_, err := s.syncAccount(ctx, accountID, cloudType, credJSON)
	return err
}

func (s *Syncer) SyncAccountByID(ctx context.Context, accountID string) error {
	if s.db == nil {
		return fmt.Errorf("no database")
	}
	var cloudType, credJSON, vaultPath string
	err := s.db.QueryRowContext(ctx, `SELECT cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1 AND is_active = true`, accountID).
		Scan(&cloudType, &credJSON, &vaultPath)
	if err != nil {
		return fmt.Errorf("account not found: %w", err)
	}
	
	// Prefer vault credentials
	if vaultPath != "" && s.vault != nil {
		if secretData, err := s.vault.GetSecret(vaultPath); err == nil {
			if dataBytes, err := json.Marshal(secretData); err == nil {
				credJSON = string(dataBytes)
			}
		}
	}
	
	_, err = s.syncAccount(ctx, accountID, cloudType, credJSON)
	return err
}

func (s *Syncer) GetProviderForResource(ctx context.Context, resourceID string) (types.Provider, string, string, error) {
	if s.db == nil {
		return nil, "", "", fmt.Errorf("no database")
	}

	var accountID, cloudType, credJSON, cloudResID, resourceType string
	var vaultPath string
	err := s.db.QueryRowContext(ctx, `
		SELECT rc.account_id, rc.cloud_resource_id, ca.cloud_type, ca.credentials, COALESCE(ca.vault_path, ''), rc.resource_type
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		WHERE rc.id = $1
	`, resourceID).Scan(&accountID, &cloudResID, &cloudType, &credJSON, &vaultPath, &resourceType)
	if err != nil {
		return nil, "", "", fmt.Errorf("resource lookup: %w", err)
	}

	// Prefer vault credentials over plaintext
	if vaultPath != "" && s.vault != nil {
		if secretData, err := s.vault.GetSecret(vaultPath); err == nil {
			if dataBytes, err := json.Marshal(secretData); err == nil {
				credJSON = string(dataBytes)
			}
		} else {
			log.Printf("syncer: vault read %s for resource action: %v, falling back to DB", vaultPath, err)
		}
	}

	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return nil, "", "", fmt.Errorf("parse credentials: %w", err)
	}

	prov := NewProvider(cloudType, creds)
	if prov == nil {
		return nil, "", "", fmt.Errorf("unsupported cloud type: %s", cloudType)
	}

	return prov, cloudResID, resourceType, nil
}

func NewProvider(cloudType string, creds map[string]string) types.Provider {
	switch cloudType {
	case "azure":
		return providers.NewAzureProvider(creds)
	case "tencent":
		return providers.NewTencentProvider(creds)
	case "oracle":
		return providers.NewOracleProvider(creds)
	case "render":
		return providers.NewRenderProvider(creds)
	case "aws":
		return providers.NewAWSProvider(creds)
	case "alicloud":
		return providers.NewAlicloudProvider(creds)
	default:
		return nil
	}
}

// GetResourceDetail returns live, detailed information about a resource by delegating
// to the provider's GetResourceDetail method, combined with cached information.
func (s *Syncer) GetResourceDetail(ctx context.Context, resourceID string) (map[string]interface{}, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no database")
	}

	var accountID, cloudType, credJSON, cloudResID, resourceType, region, name, status, specJSON, tagsJSON string
	var vaultPath string
	err := s.db.QueryRowContext(ctx, `
		SELECT rc.account_id, rc.cloud_resource_id, rc.resource_type, rc.cloud_region, rc.name, rc.status,
		       rc.spec, rc.tags, ca.cloud_type, ca.credentials, COALESCE(ca.vault_path, '')
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		WHERE rc.id = $1
	`, resourceID).Scan(&accountID, &cloudResID, &resourceType, &region, &name, &status, &specJSON, &tagsJSON, &cloudType, &credJSON, &vaultPath)
	if err != nil {
		return nil, fmt.Errorf("resource lookup: %w", err)
	}

	result := map[string]interface{}{
		"id":             resourceID,
		"cloud_resource_id": cloudResID,
		"resource_type":  resourceType,
		"cloud_type":     cloudType,
		"region":         region,
		"name":           name,
		"status":         status,
		"account_id":     accountID,
	}

	if specJSON != "" {
		var spec map[string]interface{}
		if json.Unmarshal([]byte(specJSON), &spec) == nil && spec != nil {
			result["spec"] = spec
		}
	}
	if tagsJSON != "" {
		var tags map[string]interface{}
		if json.Unmarshal([]byte(tagsJSON), &tags) == nil && tags != nil && len(tags) > 0 {
			result["tags"] = tags
		}
	}

	// Prefer vault credentials over plaintext
	if vaultPath != "" && s.vault != nil {
		if secretData, err := s.vault.GetSecret(vaultPath); err == nil {
			if dataBytes, err := json.Marshal(secretData); err == nil {
				credJSON = string(dataBytes)
			}
		}
	}

	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return result, nil // fallback: return only cached data
	}

	prov := NewProvider(cloudType, creds)
	if prov == nil {
		return result, nil
	}
	consoleURL := prov.GetConsoleURL(types.ResourceType(resourceType), cloudResID, region)
	if consoleURL != "" {
		result["console_url"] = consoleURL
	}

	live, err := prov.GetResourceDetail(ctx, types.ResourceType(resourceType), cloudResID, region)
	if err == nil && live != nil {
		for k, v := range live {
			if _, exists := result[k]; !exists {
				result[k] = v
			} else {
				// live takes precedence for known "live" fields
				if k == "spec" || k == "live" {
					result[k] = v
				}
			}
		}
		result["live_fetched"] = true
	} else {
		result["live_fetched"] = false
		if err != nil {
			result["live_error"] = err.Error()
		}
	}

	return result, nil
}

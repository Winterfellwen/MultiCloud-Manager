package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"multicloud/internal/cloud"
	"multicloud/internal/vault"
)

// Executor handles tool call execution by dispatching to cloud providers.
type Executor struct {
	syncer *cloud.Syncer
	db     *sql.DB
	vault  vault.Service
}

// NewExecutor creates a new tool executor.
func NewExecutor(syncer *cloud.Syncer, db *sql.DB, v vault.Service) *Executor {
	return &Executor{
		syncer: syncer,
		db:     db,
		vault:  v,
	}
}

// ExecuteTool runs a tool by name with the given arguments and returns the result as JSON.
func (e *Executor) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (string, error) {
	switch toolName {
	case "list_cloud_resources":
		return e.listResources(ctx, args)
	case "start_instance":
		return e.instanceAction(ctx, args, "start")
	case "stop_instance":
		return e.instanceAction(ctx, args, "stop")
	case "restart_instance":
		return e.instanceAction(ctx, args, "restart")
	case "sync_cloud_resources":
		return e.syncResources(ctx)
	case "get_cloud_stats":
		return e.getStats(ctx)
	case "list_cloud_accounts":
		return e.listAccounts(ctx)
	default:
		return "", fmt.Errorf("unknown tool: %s", toolName)
	}
}

func (e *Executor) listResources(ctx context.Context, args map[string]interface{}) (string, error) {
	resources, err := e.syncer.GetResources(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to list resources: %w", err)
	}

	// Apply filters
	filtered := resources
	if cloudType, ok := args["cloud_type"].(string); ok && cloudType != "" {
		filtered = filterSlice(filtered, func(r map[string]interface{}) bool {
			if ct, ok := r["cloud_type"].(string); ok {
				return ct == cloudType
			}
			return false
		})
	}
	if region, ok := args["region"].(string); ok && region != "" {
		filtered = filterSlice(filtered, func(r map[string]interface{}) bool {
			if rg, ok := r["region"].(string); ok {
				return rg == region
			}
			return false
		})
	}
	if status, ok := args["status"].(string); ok && status != "" {
		filtered = filterSlice(filtered, func(r map[string]interface{}) bool {
			if s, ok := r["status"].(string); ok {
				return s == status
			}
			return false
		})
	}

	result := map[string]interface{}{
		"resources": filtered,
		"count":     len(filtered),
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) instanceAction(ctx context.Context, args map[string]interface{}, action string) (string, error) {
	resourceID, ok := args["resource_id"].(string)
	if !ok || resourceID == "" {
		return "", fmt.Errorf("resource_id is required")
	}

	prov, cloudResID, err := e.syncer.GetProviderForResource(ctx, resourceID)
	if err != nil {
		return "", fmt.Errorf("resource lookup failed: %w", err)
	}

	switch action {
	case "start":
		err = prov.StartInstance(ctx, cloudResID)
	case "stop":
		err = prov.StopInstance(ctx, cloudResID)
	case "restart":
		err = prov.RestartInstance(ctx, cloudResID)
	}

	if err != nil {
		return "", fmt.Errorf("failed to %s instance %s: %w", action, resourceID, err)
	}

	result := map[string]interface{}{
		"success":     true,
		"action":      action,
		"resource_id": resourceID,
		"message":     fmt.Sprintf("Successfully executed %s on resource %s", action, resourceID),
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) syncResources(ctx context.Context) (string, error) {
	err := e.syncer.SyncAll(ctx)
	if err != nil {
		return "", fmt.Errorf("sync failed: %w", err)
	}

	resources, _ := e.syncer.GetResources(ctx)
	count := 0
	if resources != nil {
		count = len(resources)
	}

	result := map[string]interface{}{
		"success":        true,
		"message":        "Resource sync completed",
		"resource_count": count,
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) getStats(ctx context.Context) (string, error) {
	var resourceCount, accountCount int
	e.db.QueryRow("SELECT COUNT(*) FROM resources_cache").Scan(&resourceCount)
	e.db.QueryRow("SELECT COUNT(*) FROM cloud_accounts").Scan(&accountCount)

	result := map[string]interface{}{
		"resources": resourceCount,
		"accounts":  accountCount,
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) listAccounts(ctx context.Context) (string, error) {
	rows, err := e.db.Query(`SELECT id, name, cloud_type, is_active, last_sync_at FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		return "", fmt.Errorf("query accounts: %w", err)
	}
	defer rows.Close()

	var accounts []map[string]interface{}
	for rows.Next() {
		var id, name, cloudType string
		var isActive bool
		var lastSync sql.NullTime
		if err := rows.Scan(&id, &name, &cloudType, &isActive, &lastSync); err != nil {
			continue
		}
		acc := map[string]interface{}{
			"id":         id,
			"name":       name,
			"cloud_type": cloudType,
			"is_active":  isActive,
		}
		if lastSync.Valid {
			acc["last_sync_at"] = lastSync.Time.Format("2006-01-02 15:04:05")
		}
		accounts = append(accounts, acc)
	}
	if accounts == nil {
		accounts = []map[string]interface{}{}
	}

	result := map[string]interface{}{
		"accounts": accounts,
		"count":    len(accounts),
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) getCredentials(ctx context.Context, args map[string]interface{}) (string, error) {
	cloudType, ok := args["cloud_type"].(string)
	if !ok || cloudType == "" {
		return "", fmt.Errorf("cloud_type is required")
	}

	// Read from vault (never expose raw credentials to the AI)
	rows, err := e.db.Query(`SELECT id, name, COALESCE(vault_path, '') FROM cloud_accounts WHERE cloud_type = $1 AND is_active = true`, cloudType)
	if err != nil {
		return "", fmt.Errorf("query credentials: %w", err)
	}
	defer rows.Close()

	var accounts []map[string]interface{}
	for rows.Next() {
		var id, name, vaultPath string
		if err := rows.Scan(&id, &name, &vaultPath); err != nil {
			continue
		}

		// Only return metadata, never raw credentials
		accountInfo := map[string]interface{}{
			"id":   id,
			"name": name,
		}

		// Verify vault has credentials (without returning them)
		if vaultPath != "" && e.vault != nil {
			if _, err := e.vault.GetSecret(vaultPath); err == nil {
				accountInfo["vault_status"] = "secured"
			} else {
				accountInfo["vault_status"] = "error"
			}
		} else {
			accountInfo["vault_status"] = "not_migrated"
		}

		accounts = append(accounts, accountInfo)
	}

	result := map[string]interface{}{
		"cloud_type": cloudType,
		"accounts":   accounts,
		"count":      len(accounts),
		"note":       "Credentials are stored securely in the vault. Use start_instance/stop_instance/restart_instance tools to manage resources - credentials are injected server-side.",
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func filterSlice(ss []map[string]interface{}, test func(map[string]interface{}) bool) []map[string]interface{} {
	var filtered []map[string]interface{}
	for _, s := range ss {
		if test(s) {
			filtered = append(filtered, s)
		}
	}
	return filtered
}

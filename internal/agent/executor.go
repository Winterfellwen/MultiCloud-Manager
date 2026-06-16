package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"multicloud/internal/cloud"
	"multicloud/internal/cloud/providers"
	"multicloud/internal/cost"
	"multicloud/internal/vault"
)

// Executor handles tool call execution by dispatching to cloud providers.
type Executor struct {
	syncer      *cloud.Syncer
	db          *sql.DB
	vault       vault.Service
	costEngine  *cost.CostEngine
	docIndex    *DocIndex
}

func (e *Executor) SetCostEngine(ce *cost.CostEngine) {
	e.costEngine = ce
}

// SetDocIndex sets the document index for cloud API doc lookups.
func (e *Executor) SetDocIndex(di *DocIndex) {
	e.docIndex = di
}

// lookupCloudAPIDoc handles the lookup_cloud_api_doc tool call.
func (e *Executor) lookupCloudAPIDoc(ctx context.Context, args map[string]interface{}) (string, error) {
	provider, _ := args["provider"].(string)
	if provider == "" {
		return `{"error": "provider is required", "available": ["azure","aws","alicloud","tencent","oracle","render"]}`, nil
	}
	if e.docIndex == nil {
		return `{"error": "document index not initialized"}`, nil
	}
	section, _ := args["section"].(string)
	if section != "" {
		content := e.docIndex.GetSection(provider, section)
		if content == "" {
			sections := e.docIndex.ListSections(provider)
			return fmt.Sprintf(`{"error": "section '%s' not found", "available_sections": %q}`, section, sections), nil
		}
		return fmt.Sprintf(`{"provider": %q, "section": %q, "content": %q}`, provider, section, content), nil
	}
	doc := e.docIndex.GetFullDoc(provider)
	if doc == "" {
		return fmt.Sprintf(`{"error": "no documentation for provider '%s'", "available": %q}`, provider, e.docIndex.ListProviders()), nil
	}
	return fmt.Sprintf(`{"provider": %q, "content": %q}`, provider, doc), nil
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

	prov, cloudResID, _, err := e.syncer.GetProviderForResource(ctx, resourceID)
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
	_, err := e.syncer.SyncAll(ctx)
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
	if err := e.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM resources_cache").Scan(&resourceCount); err != nil {
		return "", fmt.Errorf("count resources: %w", err)
	}
	if err := e.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM cloud_accounts").Scan(&accountCount); err != nil {
		return "", fmt.Errorf("count accounts: %w", err)
	}

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
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("iterate accounts: %w", err)
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

// cloudAPIRequest handles the cloud_api_request tool call.
// It loads credentials from vault, creates a provider, makes an authenticated
// HTTP request, and returns a filtered response (secrets removed).
func (e *Executor) cloudAPIRequest(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	method, _ := args["method"].(string)
	reqURL, _ := args["url"].(string)

	if accountID == "" || method == "" || reqURL == "" {
		return "", fmt.Errorf("account_id, method, and url are required")
	}

	// Strip markdown formatting characters that LLMs may wrap around URLs
	reqURL = strings.TrimFunc(reqURL, func(r rune) bool {
		return r == '`' || r == '\'' || r == '"' || r == ' ' || r == '\n' || r == '\t'
	})
	method = strings.TrimSpace(strings.ToUpper(method))

	// Load account from DB
	var cloudType, credJSON, vaultPath string
	err := e.db.QueryRowContext(ctx,
		`SELECT cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1 AND is_active = true`,
		accountID).Scan(&cloudType, &credJSON, &vaultPath)
	if err != nil {
		return "", fmt.Errorf("account not found: %w", err)
	}

	var creds map[string]string

	// Load credentials from vault (preferred) or DB fallback
	if vaultPath != "" && e.vault != nil {
		if secretData, err := e.vault.GetSecret(vaultPath); err == nil {
			// Convert map[string]interface{} to map[string]string safely
			creds = make(map[string]string, len(secretData))
			for k, v := range secretData {
				if s, ok := v.(string); ok {
					creds[k] = s
				} else if v != nil {
					creds[k] = fmt.Sprintf("%v", v)
				}
			}
		} else {
			// Vault failed, try DB fallback
			if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
				return "", fmt.Errorf("parse credentials: %w", err)
			}
		}
	} else {
		// No vault path, use DB credentials
		if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
			return "", fmt.Errorf("parse credentials: %w", err)
		}
	}

	// Create provider
	prov := cloud.NewProvider(cloudType, creds)
	if prov == nil {
		return "", fmt.Errorf("unsupported cloud type: %s", cloudType)
	}

	// Parse optional headers
	var headers map[string]string
	if h, ok := args["headers"].(map[string]interface{}); ok {
		headers = make(map[string]string, len(h))
		for k, v := range h {
			headers[k] = fmt.Sprintf("%v", v)
		}
	}

	// Parse optional body
	var body []byte
	if b, ok := args["body"].(string); ok && b != "" {
		body = []byte(b)
	}

	// Execute raw request
	resp, err := prov.DoRawRequest(ctx, method, reqURL, headers, body)
	if err != nil {
		// Oracle fallback: DoRawRequest on OracleProvider already signs
		// internally, but if for any reason the provider doesn't support
		// a particular request, surface a helpful error pointing at the
		// dedicated OCI high-level tools.
		if cloudType == "oracle" && strings.Contains(err.Error(), "private key not loaded") {
			return "", fmt.Errorf("oracle private key not loaded — verify cloud_accounts.credentials has user_ocid, tenancy_ocid, fingerprint, region, private_key, or use the dedicated oci_create_* tools which handle signing automatically: %w", err)
		}
		return "", err
	}

	// Filter sensitive fields and truncate
	filteredBody := filterSensitiveResponse(resp.Body)
	truncated := false
	if len(filteredBody) > 50*1024 {
		filteredBody = filteredBody[:50*1024]
		truncated = true
	}

	result := map[string]interface{}{
		"status_code": resp.StatusCode,
		"headers":     resp.Headers,
		"body":        string(filteredBody),
		"truncated":   truncated,
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

// sensitiveFieldNames are JSON keys whose values should be redacted.
var sensitiveFieldNames = []string{
	"client_secret", "clientSecret",
	"api_key", "apiKey", "api_keys",
	"secret_key", "secretKey", "secret_access_key", "secretAccessKey",
	"access_key_secret", "accessKeySecret",
	"password", "passwd",
	"token", "access_token", "accessToken", "refresh_token", "refreshToken",
	"authorization", "Authorization",
	"credential", "credentials",
	"private_key", "privateKey",
	"connection_string", "connectionString",
}

// filterSensitiveResponse removes or redacts sensitive fields from a JSON response body.
func filterSensitiveResponse(body []byte) []byte {
	var data interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		// Not JSON — return as-is
		return body
	}
	filterValue(data)
	out, _ := json.Marshal(data)
	return out
}

func filterValue(v interface{}) {
	switch val := v.(type) {
	case map[string]interface{}:
		for k, v2 := range val {
			if isSensitiveField(k) {
				val[k] = "[REDACTED]"
			} else {
				filterValue(v2)
			}
		}
	case []interface{}:
		for _, item := range val {
			filterValue(item)
		}
	}
}

func isSensitiveField(name string) bool {
	lower := strings.ToLower(name)
	for _, s := range sensitiveFieldNames {
		if strings.ToLower(s) == lower {
			return true
		}
	}
	return false
}

// --- Cost tool handlers ---

func (e *Executor) getCostOverview(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	providers := parseStringArray(args["providers"])
	start := parseTimeArg(args["start"], time.Now().AddDate(0, -1, 0))
	end := parseTimeArg(args["end"], time.Now())
	overview, err := e.costEngine.Aggregator().Overview(ctx, providers, start, end)
	if err != nil {
		return "", fmt.Errorf("get_cost_overview failed: %w", err)
	}
	b, _ := json.Marshal(overview)
	return string(b), nil
}

func (e *Executor) getCostBreakdown(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	providers := parseStringArray(args["providers"])
	start := parseTimeArg(args["start"], time.Now().AddDate(0, -1, 0))
	end := parseTimeArg(args["end"], time.Now())
	breakdown, err := e.costEngine.Aggregator().Breakdown(ctx, providers, start, end)
	if err != nil {
		return "", fmt.Errorf("get_cost_breakdown failed: %w", err)
	}
	b, _ := json.Marshal(breakdown)
	return string(b), nil
}

func (e *Executor) getCostTrend(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	providers := parseStringArray(args["providers"])
	start := parseTimeArg(args["start"], time.Now().AddDate(0, -30, 0))
	end := parseTimeArg(args["end"], time.Now())
	interval, _ := args["interval"].(string)
	if interval == "" {
		interval = "day"
	}
	trend, err := e.costEngine.Aggregator().Trend(ctx, providers, start, end, interval)
	if err != nil {
		return "", fmt.Errorf("get_cost_trend failed: %w", err)
	}
	b, _ := json.Marshal(trend)
	return string(b), nil
}

func (e *Executor) compareCrossCloud(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	tier, _ := args["tier"].(string)
	region, _ := args["region"].(string)
	result, err := e.costEngine.Aggregator().CompareCrossCloud(ctx, tier, region)
	if err != nil {
		return "", fmt.Errorf("compare_cross_cloud_costs failed: %w", err)
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

func (e *Executor) getOptimizationSuggestions(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	status, _ := args["status"].(string)
	suggestions, err := e.costEngine.Optimizer().ListSuggestions(ctx, status)
	if err != nil {
		return "", fmt.Errorf("get_optimization_suggestions failed: %w", err)
	}
	b, _ := json.Marshal(suggestions)
	return string(b), nil
}

func (e *Executor) applyOptimization(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	suggestionID, _ := args["suggestion_id"].(string)
	if suggestionID == "" {
		return "", fmt.Errorf("suggestion_id is required")
	}
	if err := e.costEngine.Optimizer().ApplySuggestion(ctx, suggestionID, ""); err != nil {
		return "", fmt.Errorf("apply_optimization failed: %w", err)
	}
	return `{"success": true, "message": "optimization applied"}`, nil
}

func (e *Executor) createOptimizationRule(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	enabled, _ := args["enabled"].(bool)
	requiresConfirm := true
	if v, ok := args["requires_confirm"].(bool); ok {
		requiresConfirm = v
	}

	conditionJSON, err := json.Marshal(args["condition"])
	if err != nil {
		return "", fmt.Errorf("invalid condition: %w", err)
	}
	actionJSON, err := json.Marshal(args["action"])
	if err != nil {
		return "", fmt.Errorf("invalid action: %w", err)
	}

	rule, err := e.costEngine.Optimizer().CreateRule(ctx, name, description, enabled, requiresConfirm, conditionJSON, actionJSON, "")
	if err != nil {
		return "", fmt.Errorf("create_optimization_rule failed: %w", err)
	}
	b, _ := json.Marshal(rule)
	return string(b), nil
}

func (e *Executor) forecastCost(ctx context.Context, args map[string]interface{}) (string, error) {
	if e.costEngine == nil {
		return `{"error": "cost engine not initialized"}`, nil
	}
	providers := parseStringArray(args["providers"])
	forecast, err := e.costEngine.Aggregator().Forecast(ctx, providers)
	if err != nil {
		return "", fmt.Errorf("forecast_cost failed: %w", err)
	}
	b, _ := json.Marshal(forecast)
	return string(b), nil
}

func parseStringArray(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch arr := v.(type) {
	case []interface{}:
		out := make([]string, len(arr))
		for i, item := range arr {
			out[i], _ = item.(string)
		}
		return out
	case []string:
		return arr
	default:
		return nil
	}
}

func parseTimeArg(v interface{}, fallback time.Time) time.Time {
	if v == nil {
		return fallback
	}
	s, ok := v.(string)
	if !ok || s == "" {
		return fallback
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return fallback
	}
	return t
}

// =========================================================================
// Oracle Cloud (OCI) AI tool implementations
// These wrap the high-level OCI methods on *providers.OracleProvider, so the
// AI only passes simple parameters and we handle OCI body construction and
// request signing.
// =========================================================================

// loadOracleProvider loads credentials from the vault/DB and constructs an
// OracleProvider.  Returns nil with a friendly error message on failure.
func (e *Executor) loadOracleProvider(ctx context.Context, accountID string) (*providers.OracleProvider, error) {
	if accountID == "" {
		// Fall back to the first active Oracle account
		var firstID string
		err := e.db.QueryRowContext(ctx,
			`SELECT id FROM cloud_accounts WHERE cloud_type = 'oracle' AND is_active = true ORDER BY created_at LIMIT 1`).Scan(&firstID)
		if err != nil {
			return nil, fmt.Errorf("no account_id provided and no active Oracle account configured: %w", err)
		}
		accountID = firstID
	}

	var cloudType, credJSON, vaultPath string
	if err := e.db.QueryRowContext(ctx,
		`SELECT cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1 AND is_active = true`,
		accountID).Scan(&cloudType, &credJSON, &vaultPath); err != nil {
		return nil, fmt.Errorf("oracle account %s not found: %w", accountID, err)
	}
	if cloudType != "oracle" {
		return nil, fmt.Errorf("account %s is %q, not oracle", accountID, cloudType)
	}

	var creds map[string]string
	if vaultPath != "" && e.vault != nil {
		if secretData, err := e.vault.GetSecret(vaultPath); err == nil {
			creds = make(map[string]string, len(secretData))
			for k, v := range secretData {
				if s, ok := v.(string); ok {
					creds[k] = s
				} else if v != nil {
					creds[k] = fmt.Sprintf("%v", v)
				}
			}
		}
	}
	if creds == nil {
		if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
			return nil, fmt.Errorf("parse oracle credentials: %w", err)
		}
	}
	prov := providers.NewOracleProvider(creds)
	if prov == nil {
		return nil, fmt.Errorf("failed to construct OracleProvider")
	}
	return prov, nil
}

func (e *Executor) ociListImages(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	osFilter, _ := args["operating_system"].(string)
	shapeFilter, _ := args["shape"].(string)

	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	items, err := prov.ListImageOCIDs(ctx, osFilter, shapeFilter)
	if err != nil {
		return "", err
	}
	if len(items) > 20 {
		items = items[:20]
	}
	b, _ := json.Marshal(map[string]interface{}{
		"count":  len(items),
		"images": items,
		"hint":   "Pick an image OCID and use it in oci_create_instance. To filter by shape, pass it in the shape parameter.",
	})
	return string(b), nil
}

func (e *Executor) ociGetObjectStorageNamespace(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	ns, err := prov.GetObjectStorageNamespace(ctx)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(map[string]interface{}{
		"namespace":  ns,
		"usage_hint": "Pass this namespace to oci_create_object_bucket.",
	})
	return string(b), nil
}

func (e *Executor) ociCreateBlockVolume(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	displayName, _ := args["display_name"].(string)
	ad, _ := args["availability_domain"].(string)
	compartment, _ := args["compartment_id"].(string)
	sizeGB := 0
	if v, ok := args["size_gb"].(float64); ok {
		sizeGB = int(v)
	} else if v, ok := args["size_gb"].(int); ok {
		sizeGB = v
	}
	if displayName == "" {
		return "", fmt.Errorf("display_name is required")
	}
	if sizeGB == 0 {
		return "", fmt.Errorf("size_gb is required")
	}

	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	result, err := prov.CreateBlockVolume(ctx, displayName, ad, compartment, sizeGB)
	if err != nil {
		return "", err
	}
	return marshalOCICreateResult("block_volume", result, displayName, ad)
}

func (e *Executor) ociCreateInstance(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	displayName, _ := args["display_name"].(string)
	shape, _ := args["shape"].(string)
	imageOCID, _ := args["image_ocid"].(string)
	subnetOCID, _ := args["subnet_ocid"].(string)
	ad, _ := args["availability_domain"].(string)
	sshKey, _ := args["ssh_key"].(string)
	compartment, _ := args["compartment_id"].(string)
	assignPublicIP := false
	if v, ok := args["assign_public_ip"].(bool); ok {
		assignPublicIP = v
	}

	if displayName == "" || shape == "" || imageOCID == "" || subnetOCID == "" {
		return "", fmt.Errorf("display_name, shape, image_ocid and subnet_ocid are all required")
	}
	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	result, err := prov.CreateInstance(ctx, displayName, shape, imageOCID, subnetOCID, compartment, ad, sshKey, assignPublicIP)
	if err != nil {
		return "", err
	}
	return marshalOCICreateResult("instance", result, displayName, ad)
}

func (e *Executor) ociCreateVCN(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	displayName, _ := args["display_name"].(string)
	cidr, _ := args["cidr_block"].(string)
	dnsLabel, _ := args["dns_label"].(string)
	compartment, _ := args["compartment_id"].(string)
	if displayName == "" {
		return "", fmt.Errorf("display_name is required")
	}
	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	result, err := prov.CreateVCN(ctx, displayName, cidr, compartment, dnsLabel)
	if err != nil {
		return "", err
	}
	return marshalOCICreateResult("vcn", result, displayName, cidr)
}

func (e *Executor) ociCreateSubnet(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	displayName, _ := args["display_name"].(string)
	vcnOCID, _ := args["vcn_ocid"].(string)
	cidr, _ := args["cidr_block"].(string)
	ad, _ := args["availability_domain"].(string)
	dnsLabel, _ := args["dns_label"].(string)
	compartment, _ := args["compartment_id"].(string)
	prohibitPublicIP := false
	if v, ok := args["prohibit_public_ip"].(bool); ok {
		prohibitPublicIP = v
	}
	if vcnOCID == "" {
		return "", fmt.Errorf("vcn_ocid is required")
	}
	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	result, err := prov.CreateSubnet(ctx, displayName, cidr, vcnOCID, compartment, dnsLabel, ad, prohibitPublicIP)
	if err != nil {
		return "", err
	}
	return marshalOCICreateResult("subnet", result, displayName, cidr)
}

func (e *Executor) ociCreateObjectBucket(ctx context.Context, args map[string]interface{}) (string, error) {
	accountID, _ := args["account_id"].(string)
	name, _ := args["name"].(string)
	namespace, _ := args["namespace"].(string)
	compartment, _ := args["compartment_id"].(string)
	if name == "" || namespace == "" {
		return "", fmt.Errorf("name and namespace are required (use oci_get_object_storage_namespace to discover namespace)")
	}
	prov, err := e.loadOracleProvider(ctx, accountID)
	if err != nil {
		return "", err
	}
	result, err := prov.CreateObjectBucket(ctx, name, compartment, namespace)
	if err != nil {
		return "", err
	}
	return marshalOCICreateResult("object_bucket", result, name, namespace)
}

// marshalOCICreateResult wraps a successful OCI create response with helpful
// hints for the AI.
func marshalOCICreateResult(kind string, payload map[string]interface{}, displayName, extra string) (string, error) {
	ocid, _ := payload["id"].(string)
	lifeCycleState, _ := payload["lifecycleState"].(string)
	out := map[string]interface{}{
		"ok":             true,
		"kind":           kind,
		"display_name":   displayName,
		"ocid":           ocid,
		"lifecycleState": lifeCycleState,
		"raw":            payload,
		"next_steps":     nextStepsForKind(kind, ocid, displayName, extra),
	}
	b, _ := json.Marshal(out)
	return string(b), nil
}

func nextStepsForKind(kind, ocid, name, extra string) string {
	switch kind {
	case "block_volume":
		return fmt.Sprintf("Block volume %q (OCID: %s) creation submitted. Use list_cloud_resources to check status. Once AVAILABLE, attach via the OCI console (Compute → Instance → Attached Block Volumes → Attach).", name, ocid)
	case "instance":
		return fmt.Sprintf("Instance %q (OCID: %s) is being provisioned. Status starts at PROVISIONING and moves to RUNNING. You can poll list_cloud_resources to wait for RUNNING.", name, ocid)
	case "vcn":
		return fmt.Sprintf("VCN %q created with CIDR %s. Now call oci_create_subnet to add at least one subnet, then oci_create_instance.", name, extra)
	case "subnet":
		return fmt.Sprintf("Subnet %q (OCID: %s) created in VCN. Use this subnet OCID in oci_create_instance.", name, ocid)
	case "object_bucket":
		return fmt.Sprintf("Object bucket %q created in namespace %s. OCID: %s. Upload objects via OCI Console → Object Storage → Buckets → %s.", name, extra, ocid, name)
	}
	return ""
}

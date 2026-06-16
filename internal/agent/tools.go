package agent

import (
	"context"
	"encoding/json"
)

// ReadOnlyTools defines the set of tools that are safe for viewer/read-only users.
var ReadOnlyTools = map[string]bool{
	"list_cloud_resources":             true,
	"get_cloud_stats":                  true,
	"list_cloud_accounts":              true,
	"get_cloud_credentials":            true,
	"lookup_cloud_api_doc":             true,
	"oci_list_images":                  true,
	"oci_get_object_storage_namespace": true,
}

// BuiltInTool is a convenience implementation of Tool backed by a function.
type BuiltInTool struct {
	name        string
	description string
	params      map[string]interface{}
	fn          func(ctx context.Context, args map[string]interface{}) (string, error)
}

func (t *BuiltInTool) Name() string        { return t.name }
func (t *BuiltInTool) Description() string  { return t.description }
func (t *BuiltInTool) Parameters() map[string]interface{} { return t.params }

func (t *BuiltInTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return t.fn(ctx, args)
}

// NewBuiltInTool creates a new BuiltInTool.
func NewBuiltInTool(name, description string, params map[string]interface{},
	fn func(ctx context.Context, args map[string]interface{}) (string, error)) *BuiltInTool {
	return &BuiltInTool{
		name:        name,
		description: description,
		params:      params,
		fn:          fn,
	}
}

// RegisterBuiltInTools registers all cloud management tools into the given registry.
func RegisterBuiltInTools(registry *ToolRegistry, executor *Executor) {
	registry.Register(NewBuiltInTool(
		"list_cloud_resources",
		"List all cloud resources. Can filter by cloud type (azure/tencent/oracle/render) and region.",
		map[string]interface{}{
			"cloud_type": map[string]interface{}{
				"type":        "string",
				"description": "Cloud platform type",
				"enum":        []string{"azure", "tencent", "oracle", "render", "aws", "alicloud"},
			},
			"region": map[string]interface{}{
				"type":        "string",
				"description": "Cloud region, e.g. eastus, ap-shanghai",
			},
			"status": map[string]interface{}{
				"type":        "string",
				"description": "Resource status filter, e.g. running, stopped",
			},
		},
		executor.listResources,
	))

	registry.Register(NewBuiltInTool(
		"start_instance",
		"Start a cloud instance/VM. Requires a resource ID.",
		map[string]interface{}{
			"resource_id": map[string]interface{}{
				"type":        "string",
				"description": "Internal resource ID (from list_cloud_resources id field)",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "start")
		},
	))

	registry.Register(NewBuiltInTool(
		"stop_instance",
		"Stop a cloud instance/VM. Requires a resource ID. Warning: services will be unavailable after stop.",
		map[string]interface{}{
			"resource_id": map[string]interface{}{
				"type":        "string",
				"description": "Internal resource ID (from list_cloud_resources id field)",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "stop")
		},
	))

	registry.Register(NewBuiltInTool(
		"restart_instance",
		"Restart a cloud instance/VM. Requires a resource ID.",
		map[string]interface{}{
			"resource_id": map[string]interface{}{
				"type":        "string",
				"description": "Internal resource ID (from list_cloud_resources id field)",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "restart")
		},
	))

	registry.Register(NewBuiltInTool(
		"sync_cloud_resources",
		"Manually trigger cloud resource sync from all connected cloud platforms.",
		map[string]interface{}{},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.syncResources(ctx)
		},
	))

	registry.Register(NewBuiltInTool(
		"get_cloud_stats",
		"Get cloud resource statistics including total resource count and account count.",
		map[string]interface{}{},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.getStats(ctx)
		},
	))

	registry.Register(NewBuiltInTool(
		"list_cloud_accounts",
		"List all configured cloud account information.",
		map[string]interface{}{},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.listAccounts(ctx)
		},
	))

	registry.Register(NewBuiltInTool(
		"get_cloud_credentials",
		"Get credentials for a cloud account. Use this to discover account IDs for cloud_api_request.",
		map[string]interface{}{
			"cloud_type": map[string]interface{}{
				"type":        "string",
				"description": "Cloud type: azure, oracle, tencent, render",
				"enum":        []string{"azure", "oracle", "tencent", "render"},
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.getCredentials(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"cloud_api_request",
		`Make an authenticated HTTP request to a cloud provider API. Credentials are injected server-side — never exposed to the AI.
Use get_cloud_credentials first to discover the account_id.
Supports: Azure (management.azure.com), Tencent (*.tencentcloudapi.com), Oracle (*.oraclecloud.com), Render (api.render.com).
For Tencent, pass X-TC-Action in headers (required), X-TC-Version and X-TC-Region (optional).
For Oracle, the full service URL must be provided.
Response is automatically filtered — sensitive fields (secrets, tokens) are redacted.`,
		map[string]interface{}{
			"account_id": map[string]interface{}{
				"type":        "string",
				"description": "Cloud account ID from get_cloud_credentials",
			},
			"method": map[string]interface{}{
				"type":        "string",
				"description": "HTTP method: GET, POST, PUT, DELETE",
				"enum":        []string{"GET", "POST", "PUT", "DELETE", "PATCH"},
			},
			"url": map[string]interface{}{
				"type":        "string",
				"description": "Full API URL (must match the provider's allowed domains)",
			},
			"headers": map[string]interface{}{
				"type":        "object",
				"description": "Additional HTTP headers as key-value pairs. For Tencent: X-TC-Action is required.",
			},
			"body": map[string]interface{}{
				"type":        "string",
				"description": "Request body as JSON string (for POST/PUT/PATCH). Omit for GET.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.cloudAPIRequest(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"lookup_cloud_api_doc",
		`Look up cloud provider API documentation. Returns reference docs for the specified provider, optionally filtered to a specific section. Use this instead of reading docs files directly with shell_exec or cat.
Available providers: azure, aws, alicloud, tencent, oracle, render.`,
		map[string]interface{}{
			"provider": map[string]interface{}{
				"type":        "string",
				"description": "Cloud provider name",
				"enum":        []string{"azure", "aws", "alicloud", "tencent", "oracle", "render"},
			},
			"section": map[string]interface{}{
				"type":        "string",
				"description": "Optional section name to retrieve (e.g. 'EC2', 'Authentication'). If omitted, returns the full doc.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.lookupCloudAPIDoc(ctx, args)
		},
	))

	// =====================================================================
	// Oracle Cloud (OCI) high-level tools
	// These wrap OCI REST API calls with proper request signing so the AI
	// doesn't have to construct signed headers itself.  Use these instead of
	// cloud_api_request whenever possible — the bodies are built server-side
	// from simple parameters, eliminating LLM-side mistakes on OCI's strict
	// request body schemas.
	// =====================================================================

	registry.Register(NewBuiltInTool(
		"oci_list_images",
		`List OCI Compute platform images in the current tenancy/region, optionally filtered by operating system and shape compatibility.
Use this to discover an image OCID before creating an instance.`,
		map[string]interface{}{
			"operating_system": map[string]interface{}{
				"type":        "string",
				"description": "Filter by OS, e.g. 'Oracle Linux', 'Canonical Ubuntu', 'Windows Server'",
			},
			"shape": map[string]interface{}{
				"type":        "string",
				"description": "Filter by shape compatibility, e.g. 'VM.Standard.E2.1.Micro'",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociListImages(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_get_object_storage_namespace",
		`Get the Oracle Cloud Object Storage namespace for the current tenancy. Required before creating an Object Storage bucket.`,
		map[string]interface{}{},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociGetObjectStorageNamespace(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_create_block_volume",
		`Create an Oracle Cloud Infrastructure (OCI) Block Volume. Use this to expand storage on Oracle Free Tier or add a new persistent volume.
The request body and OCI Request Signature are constructed server-side — you only need to pass simple parameters.`,
		map[string]interface{}{
			"display_name": map[string]interface{}{
				"type":        "string",
				"description": "Display name for the new volume, e.g. 'data-volume-1'",
			},
			"size_gb": map[string]interface{}{
				"type":        "integer",
				"description": "Size in GB (50-32768; Oracle Free Tier caps at 200GB total across all volumes)",
			},
			"availability_domain": map[string]interface{}{
				"type":        "string",
				"description": "OCI availability domain, e.g. 'Uocm:US-ASHBURN-AD-1'. Required.",
			},
			"compartment_id": map[string]interface{}{
				"type":        "string",
				"description": "OCI compartment OCID. Defaults to the account's configured compartment if omitted.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociCreateBlockVolume(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_create_instance",
		`Create an Oracle Cloud Infrastructure (OCI) compute instance (VM). Supports Oracle Cloud Free Tier shapes such as VM.Standard.E2.1.Micro / VM.Standard.A1.Flex.
The image_ocid and subnet_ocid must be obtained from oci_list_images and oci_create_subnet respectively.`,
		map[string]interface{}{
			"display_name": map[string]interface{}{
				"type":        "string",
				"description": "Display name for the new instance",
			},
			"shape": map[string]interface{}{
				"type":        "string",
				"description": "Compute shape, e.g. 'VM.Standard.E2.1.Micro' or 'VM.Standard.A1.Flex'",
			},
			"image_ocid": map[string]interface{}{
				"type":        "string",
				"description": "OCID of the OS image to boot (from oci_list_images)",
			},
			"subnet_ocid": map[string]interface{}{
				"type":        "string",
				"description": "OCID of the subnet to attach the VNIC to (from oci_create_subnet)",
			},
			"availability_domain": map[string]interface{}{
				"type":        "string",
				"description": "OCI availability domain, e.g. 'Uocm:US-ASHBURN-AD-1'",
			},
			"ssh_key": map[string]interface{}{
				"type":        "string",
				"description": "Public SSH key (authorized_keys format) to inject into the default user",
			},
			"assign_public_ip": map[string]interface{}{
				"type":        "boolean",
				"description": "Whether to assign an ephemeral public IP. Defaults to false.",
			},
			"compartment_id": map[string]interface{}{
				"type":        "string",
				"description": "OCI compartment OCID. Defaults to the account's configured compartment if omitted.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociCreateInstance(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_create_vcn",
		`Create a Virtual Cloud Network (VCN) in OCI. After creation, use oci_create_subnet to add at least one subnet before creating instances.`,
		map[string]interface{}{
			"display_name": map[string]interface{}{
				"type":        "string",
				"description": "Display name for the VCN, e.g. 'vcn-main'",
			},
			"cidr_block": map[string]interface{}{
				"type":        "string",
				"description": "CIDR block for the VCN, e.g. '10.0.0.0/16'. Defaults to 10.0.0.0/16.",
			},
			"dns_label": map[string]interface{}{
				"type":        "string",
				"description": "DNS label (max 15 chars, alphanumeric). Optional but recommended.",
			},
			"compartment_id": map[string]interface{}{
				"type":        "string",
				"description": "OCI compartment OCID. Defaults to the account's configured compartment if omitted.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociCreateVCN(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_create_subnet",
		`Create a subnet in an existing OCI VCN. Returns the subnet OCID which is required to launch instances.`,
		map[string]interface{}{
			"display_name": map[string]interface{}{
				"type":        "string",
				"description": "Display name for the subnet, e.g. 'subnet-public-1'",
			},
			"vcn_ocid": map[string]interface{}{
				"type":        "string",
				"description": "OCID of the parent VCN (from oci_create_vcn)",
			},
			"cidr_block": map[string]interface{}{
				"type":        "string",
				"description": "Subnet CIDR block, e.g. '10.0.1.0/24'. Must overlap with the VCN CIDR.",
			},
			"availability_domain": map[string]interface{}{
				"type":        "string",
				"description": "Optional OCI availability domain. Required for AD-specific subnets; omit for regional subnets.",
			},
			"dns_label": map[string]interface{}{
				"type":        "string",
				"description": "DNS label (max 15 chars, alphanumeric)",
			},
			"prohibit_public_ip": map[string]interface{}{
				"type":        "boolean",
				"description": "If true, VNICs in this subnet cannot have public IPs. Defaults to false.",
			},
			"compartment_id": map[string]interface{}{
				"type":        "string",
				"description": "OCI compartment OCID. Defaults to the account's configured compartment if omitted.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociCreateSubnet(ctx, args)
		},
	))

	registry.Register(NewBuiltInTool(
		"oci_create_object_bucket",
		`Create an OCI Object Storage bucket. Requires the tenancy's Object Storage namespace (call oci_get_object_storage_namespace first).`,
		map[string]interface{}{
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Bucket name (must be unique within namespace, 1-256 chars)",
			},
			"namespace": map[string]interface{}{
				"type":        "string",
				"description": "Object Storage namespace (from oci_get_object_storage_namespace)",
			},
			"compartment_id": map[string]interface{}{
				"type":        "string",
				"description": "OCI compartment OCID. Defaults to the account's configured compartment if omitted.",
			},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.ociCreateObjectBucket(ctx, args)
		},
	))
}

// RegisterCostTools registers all cost management tools into the given registry.
func RegisterCostTools(registry *ToolRegistry, executor *Executor) {
	registry.Register(NewBuiltInTool(
		"get_cost_overview",
		"Get cost overview for one or more cloud providers. Returns total, per-provider breakdown, and month-over-month change.",
		map[string]interface{}{
			"providers": map[string]interface{}{
				"type":        "array",
				"description": "Cloud providers to filter",
				"items":       map[string]interface{}{"type": "string", "enum": []string{"azure", "aws", "tencent", "alicloud", "oracle", "render"}},
			},
			"start": map[string]interface{}{
				"type":        "string",
				"description": "Start date YYYY-MM-DD",
			},
			"end": map[string]interface{}{
				"type":        "string",
				"description": "End date YYYY-MM-DD",
			},
		},
		executor.getCostOverview,
	))

	registry.Register(NewBuiltInTool(
		"get_cost_breakdown",
		"Get detailed cost breakdown per resource.",
		map[string]interface{}{
			"providers": map[string]interface{}{
				"type":        "array",
				"description": "Cloud providers to filter",
				"items":       map[string]interface{}{"type": "string"},
			},
			"start": map[string]interface{}{"type": "string", "description": "Start date YYYY-MM-DD"},
			"end":   map[string]interface{}{"type": "string", "description": "End date YYYY-MM-DD"},
		},
		executor.getCostBreakdown,
	))

	registry.Register(NewBuiltInTool(
		"get_cost_trend",
		"Get cost trend data over time, grouped by day/week/month.",
		map[string]interface{}{
			"providers": map[string]interface{}{
				"type":        "array",
				"description": "Cloud providers to filter",
				"items":       map[string]interface{}{"type": "string"},
			},
			"start":    map[string]interface{}{"type": "string", "description": "Start date YYYY-MM-DD"},
			"end":      map[string]interface{}{"type": "string", "description": "End date YYYY-MM-DD"},
			"interval": map[string]interface{}{"type": "string", "description": "Grouping interval: day, week, or month"},
		},
		executor.getCostTrend,
	))

	registry.Register(NewBuiltInTool(
		"compare_cross_cloud_costs",
		"Compare pricing across cloud providers for the same instance tier.",
		map[string]interface{}{
			"tier":   map[string]interface{}{"type": "string", "description": "Instance tier e.g. Standard_B2s, t3.micro"},
			"region": map[string]interface{}{"type": "string", "description": "Cloud region e.g. eastus, us-east-1"},
		},
		executor.compareCrossCloud,
	))

	registry.Register(NewBuiltInTool(
		"get_optimization_suggestions",
		"List cost optimization suggestions. Filter by status (pending, applied, dismissed).",
		map[string]interface{}{
			"status": map[string]interface{}{"type": "string", "description": "Filter by status: pending, applied, dismissed"},
		},
		executor.getOptimizationSuggestions,
	))

	registry.Register(NewBuiltInTool(
		"apply_optimization",
		"Apply a cost optimization suggestion. Requires admin role.",
		map[string]interface{}{
			"suggestion_id": map[string]interface{}{"type": "string", "description": "ID of the optimization suggestion to apply"},
		},
		executor.applyOptimization,
	))

	registry.Register(NewBuiltInTool(
		"create_optimization_rule",
		"Create an auto-optimization rule. The rule evaluates conditions against cost data and triggers actions.",
		map[string]interface{}{
			"name":             map[string]interface{}{"type": "string", "description": "Rule name"},
			"description":      map[string]interface{}{"type": "string", "description": "Rule description"},
			"enabled":          map[string]interface{}{"type": "boolean", "description": "Whether the rule is enabled on creation"},
			"requires_confirm": map[string]interface{}{"type": "boolean", "description": "Whether admin confirmation is required before execution"},
			"condition": map[string]interface{}{
				"type":        "object",
				"description": "Rule condition as JSON object e.g. {\"spend_threshold\": 500}",
			},
			"action": map[string]interface{}{
				"type":        "object",
				"description": "Action to take when condition matches e.g. {\"type\": \"notify\"}",
			},
		},
		executor.createOptimizationRule,
	))

	registry.Register(NewBuiltInTool(
		"forecast_cost",
		"Forecast future costs based on historical data (next 30 days).",
		map[string]interface{}{
			"providers": map[string]interface{}{
				"type":        "array",
				"description": "Cloud providers to include in forecast",
				"items":       map[string]interface{}{"type": "string"},
			},
		},
		executor.forecastCost,
	))
}

// MarshalJSON returns a JSON representation of a tool's definition in OpenAI format.
func toolDefinition(t Tool) map[string]interface{} {
	params := t.Parameters()
	if params == nil {
		params = map[string]interface{}{}
	}
	return map[string]interface{}{
		"type": "function",
		"function": map[string]interface{}{
			"name":        t.Name(),
			"description": t.Description(),
			"parameters": map[string]interface{}{
				"type":       "object",
				"properties": params,
			},
		},
	}
}

// MarshalToolDefinitionsJSON returns all tool definitions as JSON bytes.
func MarshalToolDefinitionsJSON(tools []Tool) ([]byte, error) {
	defs := make([]map[string]interface{}, len(tools))
	for i, t := range tools {
		defs[i] = toolDefinition(t)
	}
	return json.Marshal(defs)
}

// GetToolDefinitions returns the OpenAI function-calling tool definitions
// that allow the LLM to control cloud resources. This is a backward-compatible
// wrapper that returns static definitions without requiring a Registry.
func GetToolDefinitions() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "list_cloud_resources",
				"description": "List all cloud resources. Can filter by cloud type (azure/tencent/oracle/render) and region.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"cloud_type": map[string]interface{}{
							"type":        "string",
							"description": "Cloud platform type",
							"enum":        []string{"azure", "tencent", "oracle", "render", "aws", "alicloud"},
						},
						"region": map[string]interface{}{
							"type":        "string",
							"description": "Cloud region, e.g. eastus, ap-shanghai",
						},
						"status": map[string]interface{}{
							"type":        "string",
							"description": "Resource status filter, e.g. running, stopped",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "start_instance",
				"description": "Start a cloud instance/VM. Requires a resource ID.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "Internal resource ID (from list_cloud_resources id field)",
						},
					},
					"required": []string{"resource_id"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "stop_instance",
				"description": "Stop a cloud instance/VM. Requires a resource ID. Warning: services will be unavailable after stop.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "Internal resource ID (from list_cloud_resources id field)",
						},
					},
					"required": []string{"resource_id"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "restart_instance",
				"description": "Restart a cloud instance/VM. Requires a resource ID.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "Internal resource ID (from list_cloud_resources id field)",
						},
					},
					"required": []string{"resource_id"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "sync_cloud_resources",
				"description": "Manually trigger cloud resource sync from all connected cloud platforms.",
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "get_cloud_stats",
				"description": "Get cloud resource statistics including total resource count and account count.",
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "list_cloud_accounts",
				"description": "List all configured cloud account information.",
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "shell_exec",
				"description": "Execute a shell command on the server. Use this for single commands.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"command": map[string]interface{}{
							"type":        "string",
							"description": "The shell command to execute",
						},
						"workdir": map[string]interface{}{
							"type":        "string",
							"description": "Optional working directory",
						},
					},
					"required": []string{"command"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "run_script",
				"description": "Execute a multi-line shell script. USE THIS for multi-step operations needing shared state (e.g., get auth token then use it). Variables persist across the entire script.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"script": map[string]interface{}{
							"type":        "string",
							"description": "The multi-line shell script to execute. Use \\n for newlines. All commands share the same environment - variables persist.",
						},
						"workdir": map[string]interface{}{
							"type":        "string",
							"description": "Optional working directory",
						},
					},
					"required": []string{"script"},
				},
			},
		},
		// ===== Oracle Cloud (OCI) high-level creation tools =====
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_list_images",
				"description": "List OCI platform images (with their OCIDs) so the AI can pick an image before creating an instance.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":       map[string]interface{}{"type": "string"},
						"operating_system": map[string]interface{}{"type": "string"},
						"shape":            map[string]interface{}{"type": "string"},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_get_object_storage_namespace",
				"description": "Get the Oracle Cloud Object Storage namespace (required before creating a bucket).",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id": map[string]interface{}{"type": "string"},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_create_block_volume",
				"description": "Create an OCI Block Volume. Server-side constructs the request body and applies OCI Request Signature. size_gb must be 50-32768 (Oracle Free Tier caps at 200GB total).",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":          map[string]interface{}{"type": "string"},
						"display_name":        map[string]interface{}{"type": "string"},
						"size_gb":             map[string]interface{}{"type": "integer"},
						"availability_domain": map[string]interface{}{"type": "string"},
						"compartment_id":      map[string]interface{}{"type": "string"},
					},
					"required": []string{"display_name", "size_gb", "availability_domain"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_create_instance",
				"description": "Create an OCI compute instance. Server-side builds the LaunchInstanceDetails and applies OCI Request Signature. Supports Free Tier shapes like VM.Standard.E2.1.Micro and VM.Standard.A1.Flex.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":          map[string]interface{}{"type": "string"},
						"display_name":        map[string]interface{}{"type": "string"},
						"shape":               map[string]interface{}{"type": "string"},
						"image_ocid":          map[string]interface{}{"type": "string"},
						"subnet_ocid":         map[string]interface{}{"type": "string"},
						"availability_domain": map[string]interface{}{"type": "string"},
						"ssh_key":             map[string]interface{}{"type": "string"},
						"assign_public_ip":    map[string]interface{}{"type": "boolean"},
						"compartment_id":      map[string]interface{}{"type": "string"},
					},
					"required": []string{"display_name", "shape", "image_ocid", "subnet_ocid", "availability_domain"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_create_vcn",
				"description": "Create an OCI VCN (Virtual Cloud Network). Default CIDR 10.0.0.0/16.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":     map[string]interface{}{"type": "string"},
						"display_name":   map[string]interface{}{"type": "string"},
						"cidr_block":     map[string]interface{}{"type": "string"},
						"dns_label":      map[string]interface{}{"type": "string"},
						"compartment_id": map[string]interface{}{"type": "string"},
					},
					"required": []string{"display_name"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_create_subnet",
				"description": "Create a subnet in an OCI VCN. Returns the subnet OCID needed to launch instances.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":          map[string]interface{}{"type": "string"},
						"display_name":        map[string]interface{}{"type": "string"},
						"vcn_ocid":            map[string]interface{}{"type": "string"},
						"cidr_block":          map[string]interface{}{"type": "string"},
						"availability_domain": map[string]interface{}{"type": "string"},
						"dns_label":           map[string]interface{}{"type": "string"},
						"prohibit_public_ip":  map[string]interface{}{"type": "boolean"},
						"compartment_id":      map[string]interface{}{"type": "string"},
					},
					"required": []string{"display_name", "vcn_ocid"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "oci_create_object_bucket",
				"description": "Create an OCI Object Storage bucket. Requires the namespace from oci_get_object_storage_namespace.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"account_id":     map[string]interface{}{"type": "string"},
						"name":           map[string]interface{}{"type": "string"},
						"namespace":      map[string]interface{}{"type": "string"},
						"compartment_id": map[string]interface{}{"type": "string"},
					},
					"required": []string{"name", "namespace"},
				},
			},
		},
	}
}
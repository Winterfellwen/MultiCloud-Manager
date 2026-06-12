package agent

import (
	"context"
	"encoding/json"
)

// ReadOnlyTools defines the set of tools that are safe for viewer/read-only users.
var ReadOnlyTools = map[string]bool{
	"list_cloud_resources":  true,
	"get_cloud_stats":       true,
	"list_cloud_accounts":   true,
	"get_cloud_credentials": true,
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
	}
}

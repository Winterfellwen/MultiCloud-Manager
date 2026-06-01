package agent

import (
	"context"
	"encoding/json"
)

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
				"enum":        []string{"azure", "tencent", "oracle", "render"},
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
		"Get credentials for a cloud account. Use this to get API keys, tokens, subscription IDs for REST API calls.",
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
							"enum":        []string{"azure", "tencent", "oracle", "render"},
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

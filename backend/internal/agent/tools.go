package agent

// GetToolDefinitions returns the OpenAI function-calling tool definitions
// that allow the LLM to control cloud resources.
func GetToolDefinitions() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "list_cloud_resources",
				"description": "列出所有云资源。可以按云类型（azure/tencent/oracle/render）和区域筛选。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"cloud_type": map[string]interface{}{
							"type":        "string",
							"description": "云平台类型",
							"enum":        []string{"azure", "tencent", "oracle", "render"},
						},
						"region": map[string]interface{}{
							"type":        "string",
							"description": "云区域，如 eastus、ap-shanghai 等",
						},
						"status": map[string]interface{}{
							"type":        "string",
							"description": "资源状态筛选，如 running、stopped",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "start_instance",
				"description": "启动一个云实例/虚拟机。需要提供资源ID。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
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
				"description": "停止一个云实例/虚拟机。需要提供资源ID。注意：停止后服务将不可用。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
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
				"description": "重启一个云实例/虚拟机。需要提供资源ID。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resource_id": map[string]interface{}{
							"type":        "string",
							"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
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
				"description": "手动触发云资源同步，从所有云平台拉取最新资源状态。",
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
				"description": "获取云资源统计信息，包括资源总数和云账户数。",
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
				"description": "列出所有已配置的云账户信息。",
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
	}
}

package agent

import (
	"context"
	"encoding/json"
	"sort"
)

// Tool is the interface that all agent tools must implement.
type Tool interface {
	Name() string
	Description() string
	Parameters() map[string]interface{}
	Execute(ctx context.Context, args map[string]interface{}) (string, error)
}

// ToolRegistry holds all registered tools and provides lookup/definition generation.
type ToolRegistry struct {
	tools map[string]Tool
}

// NewToolRegistry creates an empty ToolRegistry.
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{tools: make(map[string]Tool)}
}

// Register adds a tool to the registry. If a tool with the same name exists, it is replaced.
func (r *ToolRegistry) Register(tool Tool) {
	r.tools[tool.Name()] = tool
}

// Get returns a tool by name and a boolean indicating whether it was found.
func (r *ToolRegistry) Get(name string) (Tool, bool) {
	t, ok := r.tools[name]
	return t, ok
}

// GetAll returns all registered tools in sorted order by name.
func (r *ToolRegistry) GetAll() []Tool {
	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	sort.Strings(names)

	tools := make([]Tool, 0, len(names))
	for _, name := range names {
		tools = append(tools, r.tools[name])
	}
	return tools
}

// GetDefinitions returns tool definitions in OpenAI function-calling format.
func (r *ToolRegistry) GetDefinitions() []map[string]interface{} {
	defs := make([]map[string]interface{}, 0, len(r.tools))

	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		tool := r.tools[name]
		params := tool.Parameters()
		if params == nil {
			params = map[string]interface{}{}
		}
		defs = append(defs, map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        tool.Name(),
				"description": tool.Description(),
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": params,
				},
			},
		})
	}
	return defs
}

// Remove deletes a tool from the registry by name.
func (r *ToolRegistry) Remove(name string) {
	delete(r.tools, name)
}

// Names returns all registered tool names in sorted order.
func (r *ToolRegistry) Names() []string {
	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// DefinitionsJSON returns the tool definitions marshalled as JSON bytes.
func (r *ToolRegistry) DefinitionsJSON() ([]byte, error) {
	return json.Marshal(r.GetDefinitions())
}

// Count returns the number of registered tools.
func (r *ToolRegistry) Count() int {
	return len(r.tools)
}

package shell

import (
	"context"
	"encoding/json"
	"fmt"
)

// ShellTool wraps a shell Executor as a callable tool.
type ShellTool struct {
	executor *Executor
}

// NewShellTool creates a new shell tool backed by the given executor.
func NewShellTool(executor *Executor) *ShellTool {
	return &ShellTool{executor: executor}
}

func (t *ShellTool) Name() string {
	return "shell_exec"
}

func (t *ShellTool) Description() string {
	return "Execute a shell command on the server. THIS IS YOUR PRIMARY TOOL. Use it for ALL operations including: running Azure CLI (az), Render API, cloud resource creation, deployment, configuration, checking service status, installing packages, and any other server-side task. Always use this tool instead of providing text-only instructions."
}

func (t *ShellTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "The shell command to execute",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "Optional working directory (defaults to workspace root)",
			},
		},
		"required": []string{"command"},
	}
}

func (t *ShellTool) Execute(ctx context.Context, args map[string]interface{}, onOutput func(chunk string)) (string, error) {
	command, ok := args["command"].(string)
	if !ok || command == "" {
		return "", fmt.Errorf("command parameter is required and must be a non-empty string")
	}

	workdir, _ := args["workdir"].(string)

	result, err := t.executor.Execute(ctx, command, workdir, onOutput)
	if err != nil {
		return "", fmt.Errorf("shell execution failed: %w", err)
	}

	return resultToJSON(result), nil
}

// ScriptTool wraps a shell Executor for running multi-line scripts.
// Unlike ShellTool which runs a single command, ScriptTool writes the
// script to a temporary file so that variable assignments and complex
// quoting work correctly across multiple lines.
type ScriptTool struct {
	executor *Executor
}

// NewScriptTool creates a new script tool backed by the given executor.
func NewScriptTool(executor *Executor) *ScriptTool {
	return &ScriptTool{executor: executor}
}

func (t *ScriptTool) Name() string {
	return "run_script"
}

func (t *ScriptTool) Description() string {
	return `Execute a multi-line shell script on the server. USE THIS for any operation that requires MULTIPLE STEPS with shared state (e.g., getting an auth token then using it to call APIs). ALL commands in the script share the same shell environment so variables persist. Write ` + "`\\n`" + ` for newlines or use proper indentation. The script is written to a temp file and executed in one shot.`
}

func (t *ScriptTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"script": map[string]interface{}{
				"type":        "string",
				"description": "The multi-line shell script to execute. Use \\n for newlines or just write natural multi-line content. All commands share the same shell environment - variables persist across lines.",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "Optional working directory (defaults to /tmp)",
			},
		},
		"required": []string{"script"},
	}
}

func (t *ScriptTool) Execute(ctx context.Context, args map[string]interface{}, onOutput func(chunk string)) (string, error) {
	script, ok := args["script"].(string)
	if !ok || script == "" {
		return "", fmt.Errorf("script parameter is required and must be a non-empty string")
	}

	workdir, _ := args["workdir"].(string)

	result, err := t.executor.ExecuteScript(ctx, script, workdir, onOutput)
	if err != nil {
		return "", fmt.Errorf("script execution failed: %w", err)
	}

	return resultToJSON(result), nil
}

// resultToJSON converts a Result to a JSON string.
func resultToJSON(result *Result) string {
	output := map[string]interface{}{
		"stdout":      result.Stdout,
		"stderr":      result.Stderr,
		"exit_code":   result.ExitCode,
		"duration_ms": result.Duration,
	}
	b, _ := json.Marshal(output)
	return string(b)
}


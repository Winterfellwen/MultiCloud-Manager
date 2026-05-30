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
	return "Execute a shell command on the server. Use this to run cloud CLI tools (az, oci, tccli, render), install packages, deploy applications, run scripts, check logs, and perform system administration tasks."
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

func (t *ShellTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	command, ok := args["command"].(string)
	if !ok || command == "" {
		return "", fmt.Errorf("command parameter is required and must be a non-empty string")
	}

	workdir, _ := args["workdir"].(string)

	result, err := t.executor.Execute(ctx, command, workdir)
	if err != nil {
		return "", fmt.Errorf("shell execution failed: %w", err)
	}

	output := map[string]interface{}{
		"stdout":     result.Stdout,
		"stderr":     result.Stderr,
		"exit_code":  result.ExitCode,
		"duration_ms": result.Duration,
	}
	b, err := json.Marshal(output)
	if err != nil {
		return "", fmt.Errorf("marshaling result: %w", err)
	}
	return string(b), nil
}

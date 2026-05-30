package shell

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Executor runs shell commands in a sandboxed workspace.
type Executor struct {
	workspaceDir string
	timeout      time.Duration
}

// Config holds configuration for the shell executor.
type Config struct {
	WorkspaceDir   string `json:"workspace_dir"`
	TimeoutSeconds int    `json:"timeout_seconds"`
}

// Result holds the output of a shell command execution.
type Result struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Duration int64  `json:"duration_ms"`
}

// NewExecutor creates a shell executor from the given configuration.
func NewExecutor(cfg Config) *Executor {
	timeout := 30 * time.Second
	if cfg.TimeoutSeconds > 0 {
		timeout = time.Duration(cfg.TimeoutSeconds) * time.Second
	}

	workspaceDir := cfg.WorkspaceDir
	if workspaceDir == "" {
		workspaceDir = "."
	}

	return &Executor{
		workspaceDir: workspaceDir,
		timeout:      timeout,
	}
}

// Execute runs a shell command and returns the result.
func (e *Executor) Execute(ctx context.Context, command string, workdir string) (*Result, error) {
	if command == "" {
		return nil, fmt.Errorf("command cannot be empty")
	}

	dir := e.workspaceDir
	if workdir != "" {
		dir = workdir
	}

	cmdCtx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "sh", "-c", command)
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start).Milliseconds()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return nil, fmt.Errorf("failed to execute command: %w", err)
		}
	}

	return &Result{
		Stdout:   strings.TrimSpace(stdout.String()),
		Stderr:   strings.TrimSpace(stderr.String()),
		ExitCode: exitCode,
		Duration: duration,
	}, nil
}

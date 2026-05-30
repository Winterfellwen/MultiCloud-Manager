package shell

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"mvdan.cc/sh/v3/expand"
	"mvdan.cc/sh/v3/interp"
	"mvdan.cc/sh/v3/syntax"
)

type Executor struct {
	workspaceDir string
	timeout      time.Duration
}

type Config struct {
	WorkspaceDir  string `json:"workspace_dir"`
	TimeoutSeconds int   `json:"timeout_seconds"`
}

type Result struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Duration int64  `json:"duration_ms"`
}

func NewExecutor(cfg Config) *Executor {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 300 * time.Second
	}
	workspace := cfg.WorkspaceDir
	if workspace == "" {
		workspace = "/tmp"
	}
	return &Executor{workspaceDir: workspace, timeout: timeout}
}

func (e *Executor) Execute(ctx context.Context, command string, workdir string) (*Result, error) {
	if command == "" {
		return nil, fmt.Errorf("empty command")
	}

	dir := e.workspaceDir
	if workdir != "" {
		dir = workdir
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		dir = "/tmp"
	}

	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	parser := syntax.NewParser()
	file, err := parser.Parse(strings.NewReader(command), "")
	if err != nil {
		return nil, fmt.Errorf("parse command: %w", err)
	}

	var stdout, stderr bytes.Buffer
	runner, err := interp.New(
	(interp.StdIO)(nil, &stdout, &stderr),
		interp.Dir(dir),
		interp.Env(expand.ListEnviron(os.Environ()...)),
	)
	if err != nil {
		return nil, fmt.Errorf("create runner: %w", err)
	}

	start := time.Now()
	err = runner.Run(ctx, file)
	duration := time.Since(start).Milliseconds()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(interp.ExitStatus); ok {
			exitCode = int(exitErr)
		} else {
			return nil, fmt.Errorf("execute: %w", err)
		}
	}

	return &Result{
		Stdout:   strings.TrimSpace(stdout.String()),
		Stderr:   strings.TrimSpace(stderr.String()),
		ExitCode: exitCode,
		Duration: duration,
	}, nil
}

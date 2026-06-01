package shell

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
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
		timeout = 30 * time.Second
	}
	workspace := cfg.WorkspaceDir
	if workspace == "" {
		workspace = "/tmp"
	}
	return &Executor{workspaceDir: workspace, timeout: timeout}
}

// Execute runs a single shell command string.
func (e *Executor) Execute(ctx context.Context, command string, workdir string) (*Result, error) {
	if command == "" {
		return nil, fmt.Errorf("empty command")
	}

	dir := e.resolveDir(workdir)
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	parser := syntax.NewParser()
	file, err := parser.Parse(strings.NewReader(command), "")
	if err != nil {
		return nil, fmt.Errorf("parse command: %w", err)
	}

	return e.run(ctx, file, dir)
}

// ExecuteScript writes a multi-line script to a temporary file and executes it.
// This solves two problems:
//  1. Variable persistence - all variables defined in the script are available throughout
//  2. Complex quoting - script content is written to file, not parsed from JSON string
//
// The temporary file is cleaned up after execution.
func (e *Executor) ExecuteScript(ctx context.Context, script string, workdir string) (*Result, error) {
	if script == "" {
		return nil, fmt.Errorf("empty script")
	}

	dir := e.resolveDir(workdir)
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	// Write script to temp file
	tmpFile, err := os.CreateTemp("/tmp", "run_script_*.sh")
	if err != nil {
		return nil, fmt.Errorf("create temp script: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.WriteString("#!/bin/bash\n" + script); err != nil {
		tmpFile.Close()
		return nil, fmt.Errorf("write temp script: %w", err)
	}
	tmpFile.Close()

	// Parse the file as a shell script
	parser := syntax.NewParser()
	f, err := parser.Parse(strings.NewReader("#!/bin/bash\n"+script), tmpPath)
	if err != nil {
		return nil, fmt.Errorf("parse script: %w", err)
	}

	return e.run(ctx, f, dir)
}

// resolveDir determines the working directory, falling back to /tmp if invalid.
func (e *Executor) resolveDir(workdir string) string {
	dir := e.workspaceDir
	if workdir != "" {
		dir = workdir
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		dir = "/tmp"
	}
	return dir
}

// run executes a parsed shell AST and returns the result.
func (e *Executor) run(ctx context.Context, file *syntax.File, dir string) (*Result, error) {
	var stdout, stderr bytes.Buffer
	runner, err := interp.New(
		interp.StdIO(nil, &stdout, &stderr),
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

// cleanPath ensures a path is safe and absolute.
func cleanPath(p string) string {
	cleaned := filepath.Clean(p)
	if !filepath.IsAbs(cleaned) {
		cleaned = "/" + cleaned
	}
	return cleaned
}

package tool

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type Tool interface {
	ID() string
	Description() string
	Schema() interface{}
	Execute(ctx context.Context, input json.RawMessage) (*Result, error)
}

type Result struct {
	Output    string `json:"output"`
	ExitCode  int    `json:"exitCode,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
}

// Bash Tool
type BashTool struct{}

func (t *BashTool) ID() string          { return "bash" }
func (t *BashTool) Description() string { return "Execute a shell command" }
func (t *BashTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "The command to execute",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "Working directory",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "Timeout in milliseconds",
			},
			"description": map[string]interface{}{
				"type":        "string",
				"description": "Description of what this command does",
			},
		},
		"required": []string{"command", "description"},
	}
}

func (t *BashTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		Command     string `json:"command"`
		Workdir     string `json:"workdir"`
		Timeout     int    `json:"timeout"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	workdir := params.Workdir
	if workdir == "" {
		workdir, _ = os.Getwd()
	}

	var cmd *exec.Cmd
	if isWindows() {
		cmd = exec.CommandContext(ctx, "cmd", "/C", params.Command)
	} else {
		cmd = exec.CommandContext(ctx, "bash", "-c", params.Command)
	}
	cmd.Dir = workdir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	output := stdout.String()
	if stderr.Len() > 0 {
		if output != "" {
			output += "\n"
		}
		output += stderr.String()
	}

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	const maxOutput = 50000
	if len(output) > maxOutput {
		output = output[:maxOutput] + "\n... (output truncated)"
	}

	return &Result{
		Output:   output,
		ExitCode: exitCode,
	}, nil
}

// Read Tool
type ReadTool struct {
	WorkDir string
}

func (t *ReadTool) ID() string          { return "read" }
func (t *ReadTool) Description() string { return "Read a file or directory" }
func (t *ReadTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"filePath": map[string]interface{}{
				"type":        "string",
				"description": "Absolute path to file or directory",
			},
			"offset": map[string]interface{}{
				"type":        "integer",
				"description": "Line number to start from (1-indexed)",
			},
			"limit": map[string]interface{}{
				"type":        "integer",
				"description": "Maximum number of lines to read",
			},
		},
		"required": []string{"filePath"},
	}
}

func (t *ReadTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		FilePath string `json:"filePath"`
		Offset   int    `json:"offset"`
		Limit    int    `json:"limit"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	path := params.FilePath
	if !filepath.IsAbs(path) {
		path = filepath.Join(t.WorkDir, path)
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("path not found: %s", path)
	}

	if info.IsDir() {
		return t.readDir(path, params.Offset, params.Limit)
	}
	return t.readFile(path, params.Offset, params.Limit)
}

func (t *ReadTool) readDir(path string, offset, limit int) (*Result, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 2000
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	var output strings.Builder
	output.WriteString(fmt.Sprintf("<path>%s</path>\n<type>directory</type>\n<content>\n", path))

	count := 0
	for i, name := range names {
		if i < offset {
			continue
		}
		if count >= limit {
			output.WriteString(fmt.Sprintf("\n... (%d more entries)", len(names)-i))
			break
		}
		output.WriteString(fmt.Sprintf("%d: %s\n", count+1, name))
		count++
	}
	output.WriteString("</content>")

	return &Result{Output: output.String()}, nil
}

func (t *ReadTool) readFile(path string, offset, limit int) (*Result, error) {
	if limit <= 0 {
		limit = 2000
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	content := string(data)
	lines := strings.Split(content, "\n")

	var output strings.Builder
	output.WriteString(fmt.Sprintf("<path>%s</path>\n<type>file</type>\n<content>\n", path))

	count := 0
	for i, line := range lines {
		lineNum := i + 1
		if lineNum < offset {
			continue
		}
		if count >= limit {
			output.WriteString(fmt.Sprintf("\n... (%d more lines)", len(lines)-i))
			break
		}
		output.WriteString(fmt.Sprintf("%d: %s\n", lineNum, line))
		count++
	}
	output.WriteString("</content>")

	return &Result{Output: output.String()}, nil
}

// Write Tool
type WriteTool struct {
	WorkDir string
}

func (t *WriteTool) ID() string          { return "write" }
func (t *WriteTool) Description() string { return "Write content to a file" }
func (t *WriteTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"filePath": map[string]interface{}{
				"type":        "string",
				"description": "Absolute path to the file",
			},
			"content": map[string]interface{}{
				"type":        "string",
				"description": "Content to write",
			},
		},
		"required": []string{"filePath", "content"},
	}
}

func (t *WriteTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	path := params.FilePath
	if !filepath.IsAbs(path) {
		path = filepath.Join(t.WorkDir, path)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	if err := os.WriteFile(path, []byte(params.Content), 0644); err != nil {
		return nil, err
	}

	return &Result{Output: fmt.Sprintf("File written: %s (%d bytes)", path, len(params.Content))}, nil
}

// Edit Tool
type EditTool struct {
	WorkDir string
}

func (t *EditTool) ID() string          { return "edit" }
func (t *EditTool) Description() string { return "Edit a file by replacing text" }
func (t *EditTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"filePath": map[string]interface{}{
				"type":        "string",
				"description": "Absolute path to the file",
			},
			"oldString": map[string]interface{}{
				"type":        "string",
				"description": "Text to replace",
			},
			"newString": map[string]interface{}{
				"type":        "string",
				"description": "Replacement text",
			},
			"replaceAll": map[string]interface{}{
				"type":        "boolean",
				"description": "Replace all occurrences",
			},
		},
		"required": []string{"filePath", "oldString", "newString"},
	}
}

func (t *EditTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		FilePath  string `json:"filePath"`
		OldString string `json:"oldString"`
		NewString string `json:"newString"`
		ReplaceAll bool  `json:"replaceAll"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	if params.OldString == params.NewString {
		return nil, fmt.Errorf("oldString and newString must be different")
	}

	path := params.FilePath
	if !filepath.IsAbs(path) {
		path = filepath.Join(t.WorkDir, path)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	content := string(data)

	if !strings.Contains(content, params.OldString) {
		return nil, fmt.Errorf("oldString not found in file")
	}

	var newContent string
	count := strings.Count(content, params.OldString)

	if params.ReplaceAll {
		newContent = strings.ReplaceAll(content, params.OldString, params.NewString)
	} else {
		if count > 1 {
			return nil, fmt.Errorf("found multiple matches for oldString; use replaceAll or provide more context")
		}
		newContent = strings.Replace(content, params.OldString, params.NewString, 1)
	}

	if err := os.WriteFile(path, []byte(newContent), 0644); err != nil {
		return nil, err
	}

	return &Result{
		Output: fmt.Sprintf("Edit applied: %s (replaced %d occurrence(s))", path, count),
	}, nil
}

// Glob Tool
type GlobTool struct {
	WorkDir string
}

func (t *GlobTool) ID() string          { return "glob" }
func (t *GlobTool) Description() string { return "Find files matching a pattern" }
func (t *GlobTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"pattern": map[string]interface{}{
				"type":        "string",
				"description": "Glob pattern (e.g. **/*.go)",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Directory to search in",
			},
		},
		"required": []string{"pattern"},
	}
}

func (t *GlobTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	searchDir := params.Path
	if searchDir == "" {
		searchDir = t.WorkDir
	}
	if !filepath.IsAbs(searchDir) {
		searchDir = filepath.Join(t.WorkDir, searchDir)
	}

	pattern := filepath.Join(searchDir, params.Pattern)
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}

	const maxResults = 100
	if len(matches) > maxResults {
		matches = matches[:maxResults]
	}

	output := strings.Join(matches, "\n")
	if output == "" {
		output = "No files found"
	}

	return &Result{Output: output}, nil
}

// Grep Tool
type GrepTool struct {
	WorkDir string
}

func (t *GrepTool) ID() string          { return "grep" }
func (t *GrepTool) Description() string { return "Search file contents with regex" }
func (t *GrepTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"pattern": map[string]interface{}{
				"type":        "string",
				"description": "Regex pattern",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Directory to search",
			},
			"include": map[string]interface{}{
				"type":        "string",
				"description": "File pattern to include",
			},
		},
		"required": []string{"pattern"},
	}
}

func (t *GrepTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
		Include string `json:"include"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	re, err := regexp.Compile(params.Pattern)
	if err != nil {
		return nil, err
	}

	searchDir := params.Path
	if searchDir == "" {
		searchDir = t.WorkDir
	}
	if !filepath.IsAbs(searchDir) {
		searchDir = filepath.Join(t.WorkDir, searchDir)
	}

	var output strings.Builder
	count := 0
	const maxResults = 100

	filepath.Walk(searchDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		if params.Include != "" {
			matched, _ := filepath.Match(params.Include, filepath.Base(path))
			if !matched {
				return nil
			}
		}

		if info.Size() > 1024*1024 {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if re.MatchString(line) {
				if count >= maxResults {
					return nil
				}
				output.WriteString(fmt.Sprintf("%s:%d: %s\n", path, i+1, line))
				count++
			}
		}

		return nil
	})

	if output.Len() == 0 {
		return &Result{Output: "No matches found"}, nil
	}

	return &Result{Output: output.String()}, nil
}

// WebFetch Tool
type WebFetchTool struct{}

func (t *WebFetchTool) ID() string          { return "webfetch" }
func (t *WebFetchTool) Description() string { return "Fetch content from a URL" }
func (t *WebFetchTool) Schema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"url": map[string]interface{}{
				"type":        "string",
				"description": "URL to fetch",
			},
		},
		"required": []string{"url"},
	}
}

func (t *WebFetchTool) Execute(ctx context.Context, input json.RawMessage) (*Result, error) {
	var params struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(input, &params); err != nil {
		return nil, err
	}

	// Use Go's http client
	req, err := http.NewRequestWithContext(ctx, "GET", params.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "OpenCode/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return nil, err
	}

	output := string(data)
	const maxLength = 50000
	if len(output) > maxLength {
		output = output[:maxLength] + "\n... (truncated)"
	}

	return &Result{
		Output: fmt.Sprintf("Status: %d\nContent-Type: %s\n\n%s", resp.StatusCode, resp.Header.Get("Content-Type"), output),
	}, nil
}

func isWindows() bool {
	return os.PathSeparator == '\\'
}

// Registry
type Registry struct {
	tools map[string]Tool
}

func NewRegistry(workDir string) *Registry {
	r := &Registry{
		tools: make(map[string]Tool),
	}

	r.Register(&BashTool{})
	r.Register(&ReadTool{WorkDir: workDir})
	r.Register(&WriteTool{WorkDir: workDir})
	r.Register(&EditTool{WorkDir: workDir})
	r.Register(&GlobTool{WorkDir: workDir})
	r.Register(&GrepTool{WorkDir: workDir})
	r.Register(&WebFetchTool{})

	return r
}

func (r *Registry) Register(tool Tool) {
	r.tools[tool.ID()] = tool
}

func (r *Registry) Get(id string) (Tool, bool) {
	t, ok := r.tools[id]
	return t, ok
}

func (r *Registry) List() []Tool {
	var list []Tool
	for _, t := range r.tools {
		list = append(list, t)
	}
	return list
}

func (r *Registry) Definitions() []ToolDef {
	defs := make([]ToolDef, 0)
	for _, t := range r.tools {
		defs = append(defs, ToolDef{
			Name:        t.ID(),
			Description: t.Description(),
			Parameters:  t.Schema(),
		})
	}
	return defs
}

type ToolDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

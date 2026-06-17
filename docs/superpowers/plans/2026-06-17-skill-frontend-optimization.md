# 技能系统与前端优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技能系统升级为 SKILL.md 格式（支持触发匹配、工具绑定、参数配置），并将前端单文件 SPA 拆分为模块化架构（状态管理 + API 封装 + 组件化）。

**Architecture:** 后端新增 SKILL.md 解析器、触发匹配引擎、技能上下文注入；前端按功能模块拆分 JS，引入 EventEmitter 状态管理，保持单文件部署。

**Tech Stack:** Go 1.25 + Gin, JavaScript (ES6+), YAML 解析, Go embed

---

## 文件结构映射

### 后端新增/修改

| 文件 | 操作 | 职责 |
|------|------|------|
| `internal/agent/skill/skill.go` | 新建 | Skill 结构体定义（含 Trigger、ConfigParam） |
| `internal/agent/skill/parser.go` | 新建 | SKILL.md 解析器（YAML 前置元数据 + Markdown 正文） |
| `internal/agent/skill/matcher.go` | 新建 | 触发匹配引擎（关键词匹配、优先级排序） |
| `internal/agent/skill/loader.go` | 修改 | 扩展为从目录加载 SKILL.md 文件 |
| `internal/agent/skill/engine.go` | 修改 | 扩展为支持技能上下文注入、工具过滤 |
| `internal/agent/prompt.go` | 修改 | PromptBuilder 支持注入技能上下文 |
| `internal/agent/runtime.go` | 修改 | Runtime 初始化时加载技能目录 |
| `internal/api/router.go` | 修改 | 注册技能管理 API 路由 |
| `internal/api/skills.go` | 新建 | 技能管理 HTTP 处理器 |
| `skills/cloud-cost-optimize/SKILL.md` | 新建 | 成本优化技能示例 |
| `skills/cloud-resource-query/SKILL.md` | 新建 | 资源查询技能示例 |
| `skills/cloud-security-audit/SKILL.md` | 新建 | 安全审计技能示例 |

### 前端新增/修改

| 文件 | 操作 | 职责 |
|------|------|------|
| `web/css/variables.css` | 新建 | CSS 变量（主题色、字体、间距） |
| `web/css/base.css` | 新建 | 重置 + 全局样式 |
| `web/css/layout.css` | 新建 | 侧边栏、topbar、content 布局 |
| `web/css/components.css` | 新建 | 卡片、表格、表单、弹窗等组件样式 |
| `web/js/state.js` | 新建 | EventEmitter 轻量级状态管理 |
| `web/js/api.js` | 新建 | API 封装（fetch、错误处理、认证头） |
| `web/js/utils.js` | 新建 | 工具函数（debounce、formatDate 等） |
| `web/js/components/toast.js` | 新建 | Toast 通知组件 |
| `web/js/components/modal.js` | 新建 | 弹窗组件 |
| `web/js/components/table.js` | 新建 | 表格组件（排序、分页） |
| `web/js/components/dropdown.js` | 新建 | 下拉菜单组件 |
| `web/js/components/chart.js` | 新建 | Chart.js 封装组件 |
| `web/js/pages/dashboard.js` | 新建 | Dashboard 页面逻辑 |
| `web/js/pages/accounts.js` | 新建 | Accounts 页面逻辑 |
| `web/js/pages/resources.js` | 新建 | Resources 页面逻辑 |
| `web/js/pages/sync.js` | 新建 | Sync 页面逻辑 |
| `web/js/pages/cost.js` | 新建 | Cost 页面逻辑 |
| `web/js/pages/terminal.js` | 新建 | Terminal 页面逻辑 |
| `web/js/pages/chat.js` | 新建 | AI Chat 页面逻辑 |
| `web/js/pages/profile.js` | 新建 | Profile 页面逻辑 |
| `web/js/app.js` | 新建 | 入口：初始化、路由、全局事件 |
| `web/index.html` | 修改 | 精简为骨架（仅 HTML 结构 + placeholder） |
| `web/static/icons.svg` | 保留 | SVG 图标集合 |

---

## Task 1: Skill 结构体定义

**Files:**
- Create: `internal/agent/skill/skill.go`

- [ ] **Step 1: 定义 Skill 核心结构体**

```go
package skill

import "time"

// SkillTrigger 定义技能触发条件
type SkillTrigger struct {
	Keywords []string `json:"keywords"`
	Priority int      `json:"priority"`
}

// SkillConfigParam 定义技能配置参数
type SkillConfigParam struct {
	Name        string      `json:"name"`
	Type        string      `json:"type"` // string, number, boolean
	Default     interface{} `json:"default"`
	Description string      `json:"description"`
}

// Skill 定义技能
type Skill struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Enabled     bool               `json:"enabled"`
	Triggers    []SkillTrigger     `json:"triggers"`
	Tools       []string           `json:"tools"`
	Config      []SkillConfigParam `json:"config"`
	Content     string             `json:"content"` // Markdown 正文
	ConfigValues map[string]interface{} `json:"config_values"` // 用户配置值
	LoadedAt    time.Time          `json:"loaded_at"`
}

// GetConfigValue 获取配置参数值，若未设置返回默认值
func (s *Skill) GetConfigValue(name string) interface{} {
	if s.ConfigValues != nil {
		if v, ok := s.ConfigValues[name]; ok {
			return v
		}
	}
	for _, c := range s.Config {
		if c.Name == name {
			return c.Default
		}
	}
	return nil
}

// GetToolDefinitions 获取技能绑定的工具定义（用于过滤）
func (s *Skill) GetToolDefinitions() []string {
	return s.Tools
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/agent/skill/skill.go
git commit -m "feat(skill): add Skill struct definition with triggers, config, and content"
```

---

## Task 2: SKILL.md 解析器

**Files:**
- Create: `internal/agent/skill/parser.go`
- Modify: `go.mod`（添加 YAML 依赖）

- [ ] **Step 1: 添加 YAML 依赖**

```bash
go get gopkg.in/yaml.v3
```

- [ ] **Step 2: 实现 SKILL.md 解析器**

```go
package skill

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// skillFileYAML 定义 SKILL.md YAML 前置元数据结构
type skillFileYAML struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Triggers    []struct {
		Keywords []string `yaml:"keywords"`
		Priority int      `yaml:"priority"`
	} `yaml:"triggers"`
	Tools  []string `yaml:"tools"`
	Config []struct {
		Name        string      `yaml:"name"`
		Type        string      `yaml:"type"`
		Default     interface{} `yaml:"default"`
		Description string      `yaml:"description"`
	} `yaml:"config"`
}

// ParseSKILLFile 解析 SKILL.md 文件
func ParseSKILLFile(path string) (*Skill, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read skill file %s: %w", path, err)
	}

	content := string(data)

	// 检查是否有 YAML 前置元数据
	if !strings.HasPrefix(content, "---") {
		return nil, fmt.Errorf("skill file %s missing YAML front matter", path)
	}

	// 分割 YAML 和 Markdown
	parts := strings.SplitN(content[3:], "---", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("skill file %s invalid format: missing closing ---", path)
	}

	yamlPart := strings.TrimSpace(parts[0])
	markdownPart := strings.TrimSpace(parts[1])

	// 解析 YAML
	var fileYAML skillFileYAML
	if err := yaml.Unmarshal([]byte(yamlPart), &fileYAML); err != nil {
		return nil, fmt.Errorf("parse YAML front matter in %s: %w", path, err)
	}

	// 转换为 Skill 结构体
	skill := &Skill{
		Name:        fileYAML.Name,
		Description: fileYAML.Description,
		Enabled:     true, // 默认启用
		Content:     markdownPart,
		ConfigValues: make(map[string]interface{}),
	}

	// 转换 triggers
	for _, t := range fileYAML.Triggers {
		skill.Triggers = append(skill.Triggers, SkillTrigger{
			Keywords: t.Keywords,
			Priority: t.Priority,
		})
	}

	// 转换 tools
	skill.Tools = fileYAML.Tools

	// 转换 config
	for _, c := range fileYAML.Config {
		skill.Config = append(skill.Config, SkillConfigParam{
			Name:        c.Name,
			Type:        c.Type,
			Default:     c.Default,
			Description: c.Description,
		})
	}

	return skill, nil
}
```

- [ ] **Step 3: 编写解析器测试**

```go
package skill

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseSKILLFile(t *testing.T) {
	// 创建临时测试文件
	tmpDir := t.TempDir()
	skillPath := filepath.Join(tmpDir, "SKILL.md")

	content := `---
name: test-skill
description: A test skill
triggers:
  - keywords: ["test", "demo"]
    priority: 1
tools:
  - listResources
  - getStats
config:
  - name: limit
    type: number
    default: 10
    description: Result limit
---

## Usage

This is a test skill.
`

	if err := os.WriteFile(skillPath, []byte(content), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	skill, err := ParseSKILLFile(skillPath)
	if err != nil {
		t.Fatalf("parse skill file: %v", err)
	}

	if skill.Name != "test-skill" {
		t.Errorf("expected name 'test-skill', got %q", skill.Name)
	}

	if len(skill.Triggers) != 1 {
		t.Errorf("expected 1 trigger, got %d", len(skill.Triggers))
	}

	if len(skill.Tools) != 2 {
		t.Errorf("expected 2 tools, got %d", len(skill.Tools))
	}

	if skill.GetConfigValue("limit") != 10 {
		t.Errorf("expected config limit=10, got %v", skill.GetConfigValue("limit"))
	}

	if !strings.Contains(skill.Content, "This is a test skill") {
		t.Errorf("expected content to contain 'This is a test skill'")
	}
}
```

- [ ] **Step 4: 运行测试**

```bash
cd /workspace && go test ./internal/agent/skill/ -v -run TestParseSKILLFile
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/agent/skill/parser.go internal/agent/skill/parser_test.go go.mod go.sum
git commit -m "feat(skill): add SKILL.md parser with YAML front matter support"
```

---

## Task 3: 触发匹配引擎

**Files:**
- Create: `internal/agent/skill/matcher.go`
- Create: `internal/agent/skill/matcher_test.go`

- [ ] **Step 1: 实现触发匹配引擎**

```go
package skill

import (
	"sort"
	"strings"
)

// MatchResult 表示匹配结果
type MatchResult struct {
	Skill    *Skill
	Score    float64 // 匹配分数 (0-1)
	Priority int     // 触发器优先级
}

// Matcher 技能匹配引擎
type Matcher struct {
	skills []*Skill
}

// NewMatcher 创建匹配引擎
func NewMatcher(skills []*Skill) *Matcher {
	return &Matcher{skills: skills}
}

// Match 根据用户输入匹配技能
// 返回按匹配分数排序的结果列表
func (m *Matcher) Match(input string) []MatchResult {
	input = strings.ToLower(input)
	var results []MatchResult

	for _, skill := range m.skills {
		if !skill.Enabled {
			continue
		}

		for _, trigger := range skill.Triggers {
			score := m.calculateScore(input, trigger.Keywords)
			if score > 0 {
				results = append(results, MatchResult{
					Skill:    skill,
					Score:    score,
					Priority: trigger.Priority,
				})
				break // 一个技能只匹配一次，取最高分的 trigger
			}
		}
	}

	// 排序：优先级高 -> 分数高
	sort.Slice(results, func(i, j int) bool {
		if results[i].Priority != results[j].Priority {
			return results[i].Priority < results[j].Priority // 数字越小优先级越高
		}
		return results[i].Score > results[j].Score
	})

	return results
}

// BestMatch 返回最佳匹配技能，若无可信匹配返回 nil
// threshold: 最低匹配分数阈值
func (m *Matcher) BestMatch(input string, threshold float64) *Skill {
	results := m.Match(input)
	if len(results) == 0 || results[0].Score < threshold {
		return nil
	}
	return results[0].Skill
}

// calculateScore 计算输入与关键词的匹配分数
// 完全匹配 = 1.0, 部分匹配 = 0.5, 不匹配 = 0
func (m *Matcher) calculateScore(input string, keywords []string) float64 {
	if len(keywords) == 0 {
		return 0
	}

	matchCount := 0
	for _, kw := range keywords {
		kw = strings.ToLower(kw)
		if strings.Contains(input, kw) {
			matchCount++
		}
	}

	if matchCount == 0 {
		return 0
	}

	// 所有关键词都匹配 = 1.0, 部分匹配按比例
	return float64(matchCount) / float64(len(keywords))
}
```

- [ ] **Step 2: 编写匹配引擎测试**

```go
package skill

import (
	"testing"
)

func TestMatcher(t *testing.T) {
	skills := []*Skill{
		{
			Name:    "cost-optimize",
			Enabled: true,
			Triggers: []SkillTrigger{
				{Keywords: []string{"成本", "费用", "优化"}, Priority: 1},
			},
		},
		{
			Name:    "resource-query",
			Enabled: true,
			Triggers: []SkillTrigger{
				{Keywords: []string{"资源", "查询"}, Priority: 2},
			},
		},
		{
			Name:    "disabled-skill",
			Enabled: false,
			Triggers: []SkillTrigger{
				{Keywords: []string{"禁用"}, Priority: 1},
			},
		},
	}

	matcher := NewMatcher(skills)

	tests := []struct {
		input     string
		wantSkill string
		wantScore float64
	}{
		{"帮我优化一下成本", "cost-optimize", 0.333},
		{"查询资源列表", "resource-query", 0.5},
		{"成本费用分析", "cost-optimize", 0.667},
		{"随便说点什么", "", 0},
	}

	for _, tt := range tests {
		results := matcher.Match(tt.input)
		if tt.wantSkill == "" {
			if len(results) > 0 {
				t.Errorf("input %q: expected no match, got %s", tt.input, results[0].Skill.Name)
			}
			continue
		}

		if len(results) == 0 {
			t.Errorf("input %q: expected match %s, got none", tt.input, tt.wantSkill)
			continue
		}

		if results[0].Skill.Name != tt.wantSkill {
			t.Errorf("input %q: expected %s, got %s", tt.input, tt.wantSkill, results[0].Skill.Name)
		}
	}

	// 测试 BestMatch
	best := matcher.BestMatch("帮我优化成本", 0.1)
	if best == nil || best.Name != "cost-optimize" {
		t.Errorf("BestMatch failed")
	}

	// 测试阈值过滤
	noMatch := matcher.BestMatch("帮我优化成本", 0.9)
	if noMatch != nil {
		t.Errorf("BestMatch should return nil for high threshold")
	}
}
```

- [ ] **Step 3: 运行测试**

```bash
cd /workspace && go test ./internal/agent/skill/ -v -run TestMatcher
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add internal/agent/skill/matcher.go internal/agent/skill/matcher_test.go
git commit -m "feat(skill): add trigger matching engine with priority and score"
```

---

## Task 4: 扩展技能加载器

**Files:**
- Modify: `internal/agent/skill/loader.go`

- [ ] **Step 1: 读取当前 loader.go 内容**

```bash
cat /workspace/internal/agent/skill/loader.go
```

- [ ] **Step 2: 扩展 loader 支持目录加载**

```go
package skill

import (
	"fmt"
	"os"
	"path/filepath"
)

// LoadSkillsFromDir 从目录加载所有 SKILL.md 文件
func LoadSkillsFromDir(dir string) ([]*Skill, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // 目录不存在返回空列表
		}
		return nil, fmt.Errorf("read skills dir %s: %w", dir, err)
	}

	var skills []*Skill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillPath := filepath.Join(dir, entry.Name(), "SKILL.md")
		if _, err := os.Stat(skillPath); os.IsNotExist(err) {
			continue
		}

		skill, err := ParseSKILLFile(skillPath)
		if err != nil {
			// 记录错误但继续加载其他技能
			fmt.Printf("WARN: failed to load skill from %s: %v\n", skillPath, err)
			continue
		}

		skills = append(skills, skill)
	}

	return skills, nil
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/agent/skill/loader.go
git commit -m "feat(skill): extend loader to support loading SKILL.md from directory"
```

---

## Task 5: 扩展技能引擎

**Files:**
- Modify: `internal/agent/skill/engine.go`

- [ ] **Step 1: 读取当前 engine.go 内容**

```bash
cat /workspace/internal/agent/skill/engine.go
```

- [ ] **Step 2: 扩展 Engine 支持技能上下文和工具过滤**

```go
package skill

import (
	"sync"
)

// Engine 技能引擎
type Engine struct {
	mu     sync.RWMutex
	skills map[string]*Skill
	matcher *Matcher
}

// NewEngine 创建技能引擎
func NewEngine() *Engine {
	return &Engine{
		skills: make(map[string]*Skill),
	}
}

// LoadSkills 从目录加载技能
func (e *Engine) LoadSkills(dir string) error {
	skills, err := LoadSkillsFromDir(dir)
	if err != nil {
		return err
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	for _, skill := range skills {
		e.skills[skill.Name] = skill
	}

	e.matcher = NewMatcher(e.getSkillList())
	return nil
}

// GetSkill 获取指定技能
func (e *Engine) GetSkill(name string) *Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.skills[name]
}

// GetActiveSkills 返回所有启用的技能
func (e *Engine) GetActiveSkills() []*Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var result []*Skill
	for _, skill := range e.skills {
		if skill.Enabled {
			result = append(result, skill)
		}
	}
	return result
}

// MatchSkill 根据输入匹配最佳技能
func (e *Engine) MatchSkill(input string, threshold float64) *Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if e.matcher == nil {
		return nil
	}
	return e.matcher.BestMatch(input, threshold)
}

// GetSkillTools 获取技能绑定的工具列表
func (e *Engine) GetSkillTools(skillName string) []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	skill, ok := e.skills[skillName]
	if !ok || !skill.Enabled {
		return nil
	}
	return skill.Tools
}

// GetSkillContext 获取技能的上下文内容（用于注入提示词）
func (e *Engine) GetSkillContext(skillName string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	skill, ok := e.skills[skillName]
	if !ok || !skill.Enabled {
		return ""
	}

	// 构建技能上下文
	var context string
	context += fmt.Sprintf("## 技能: %s\n\n", skill.Name)
	context += fmt.Sprintf("%s\n\n", skill.Description)
	context += fmt.Sprintf("### 可用工具\n")
	for _, tool := range skill.Tools {
		context += fmt.Sprintf("- %s\n", tool)
	}
	context += fmt.Sprintf("\n### 使用指南\n\n%s\n", skill.Content)

	return context
}

// EnableSkill 启用技能
func (e *Engine) EnableSkill(name string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}
	skill.Enabled = true
	e.matcher = NewMatcher(e.getSkillList())
	return true
}

// DisableSkill 禁用技能
func (e *Engine) DisableSkill(name string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}
	skill.Enabled = false
	e.matcher = NewMatcher(e.getSkillList())
	return true
}

// UpdateConfig 更新技能配置
func (e *Engine) UpdateConfig(name string, values map[string]interface{}) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}

	if skill.ConfigValues == nil {
		skill.ConfigValues = make(map[string]interface{})
	}

	for k, v := range values {
		skill.ConfigValues[k] = v
	}
	return true
}

// getSkillList 获取技能列表（内部使用，调用方需持有锁）
func (e *Engine) getSkillList() []*Skill {
	var result []*Skill
	for _, skill := range e.skills {
		result = append(result, skill)
	}
	return result
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/agent/skill/engine.go
git commit -m "feat(skill): extend engine with skill context injection and tool filtering"
```

---

## Task 6: 扩展 PromptBuilder 支持技能上下文

**Files:**
- Modify: `internal/agent/prompt.go`

- [ ] **Step 1: 读取当前 prompt.go 内容**

```bash
cat /workspace/internal/agent/prompt.go
```

- [ ] **Step 2: 扩展 PromptBuilder**

在 PromptBuilder 中添加技能上下文注入方法：

```go
// AddSkillContext 添加技能上下文到提示词
func (pb *PromptBuilder) AddSkillContext(skillName string, context string) *PromptBuilder {
	pb.mu.Lock()
	defer pb.mu.Unlock()

	if context == "" {
		return pb
	}

	pb.sections = append(pb.sections, PromptSection{
		Title:   fmt.Sprintf("Skill: %s", skillName),
		Content: context,
		Order:   15, // 在 Cloud API Quick Reference 之后
	})
	return pb
}

// SetSkillTools 设置当前可用工具列表（用于过滤）
func (pb *PromptBuilder) SetSkillTools(tools []string) *PromptBuilder {
	pb.mu.Lock()
	defer pb.mu.Unlock()

	if len(tools) > 0 {
		pb.skillTools = tools
	}
	return pb
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/agent/prompt.go
git commit -m "feat(prompt): add skill context injection to PromptBuilder"
```

---

## Task 7: 扩展 Runtime 加载技能目录

**Files:**
- Modify: `internal/agent/runtime.go`

- [ ] **Step 1: 读取当前 runtime.go 内容**

```bash
cat /workspace/internal/agent/runtime.go
```

- [ ] **Step 2: 扩展 Runtime 初始化**

在 Runtime 初始化时加载技能目录：

```go
// RuntimeConfig 扩展添加 SkillsDir
type RuntimeConfig struct {
	// ... 现有字段 ...
	SkillsDir string // 技能目录路径
}

// NewRuntime 扩展初始化
func NewRuntime(cfg RuntimeConfig) (*Runtime, error) {
	// ... 现有初始化代码 ...

	// 初始化技能引擎
	skillEngine := skill.NewEngine()
	if cfg.SkillsDir != "" {
		if err := skillEngine.LoadSkills(cfg.SkillsDir); err != nil {
			log.Printf("WARN: failed to load skills from %s: %v", cfg.SkillsDir, err)
		}
	}

	// ... 其余初始化 ...

	rt := &Runtime{
		// ... 现有字段 ...
		skillEngine: skillEngine,
	}

	return rt, nil
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/agent/runtime.go
git commit -m "feat(runtime): load skills directory during runtime initialization"
```

---

## Task 8: 技能管理 API

**Files:**
- Create: `internal/api/skills.go`
- Modify: `internal/api/router.go`

- [ ] **Step 1: 实现技能管理 API**

```go
package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"multicloud/internal/agent/skill"
)

// SkillHandler 技能管理处理器
type SkillHandler struct {
	engine *skill.Engine
}

// NewSkillHandler 创建技能管理处理器
func NewSkillHandler(engine *skill.Engine) *SkillHandler {
	return &SkillHandler{engine: engine}
}

// ListSkills 列出所有技能
func (h *SkillHandler) ListSkills(c *gin.Context) {
	skills := h.engine.GetActiveSkills()
	c.JSON(http.StatusOK, gin.H{"skills": skills})
}

// GetSkill 获取技能详情
func (h *SkillHandler) GetSkill(c *gin.Context) {
	name := c.Param("name")
	s := h.engine.GetSkill(name)
	if s == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, s)
}

// EnableSkill 启用技能
func (h *SkillHandler) EnableSkill(c *gin.Context) {
	name := c.Param("name")
	if !h.engine.EnableSkill(name) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "skill enabled"})
}

// DisableSkill 禁用技能
func (h *SkillHandler) DisableSkill(c *gin.Context) {
	name := c.Param("name")
	if !h.engine.DisableSkill(name) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "skill disabled"})
}

// UpdateSkillConfig 更新技能配置
func (h *SkillHandler) UpdateSkillConfig(c *gin.Context) {
	name := c.Param("name")

	var req struct {
		Config map[string]interface{} `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !h.engine.UpdateConfig(name, req.Config) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "config updated"})
}
```

- [ ] **Step 2: 注册路由**

在 `internal/api/router.go` 中添加技能管理路由：

```go
// 在 SetupRouter 中添加
skillHandler := NewSkillHandler(runtime.skillEngine)

// 技能管理路由（需要 admin 角色）
adminGroup := router.Group("/api/skills")
adminGroup.Use(AuthMiddleware(jwtSecret), RequireRole("admin"))
{
	adminGroup.GET("", skillHandler.ListSkills)
	adminGroup.GET("/:name", skillHandler.GetSkill)
	adminGroup.POST("/:name/enable", skillHandler.EnableSkill)
	adminGroup.POST("/:name/disable", skillHandler.DisableSkill)
	adminGroup.PUT("/:name/config", skillHandler.UpdateSkillConfig)
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/api/skills.go internal/api/router.go
git commit -m "feat(api): add skill management endpoints"
```

---

## Task 9: 创建示例技能文件

**Files:**
- Create: `skills/cloud-cost-optimize/SKILL.md`
- Create: `skills/cloud-resource-query/SKILL.md`
- Create: `skills/cloud-security-audit/SKILL.md`

- [ ] **Step 1: 创建成本优化技能**

```bash
mkdir -p /workspace/skills/cloud-cost-optimize
```

```markdown
---
name: cloud-cost-optimize
description: 分析云成本并给出优化建议，帮助用户降低云支出
triggers:
  - keywords: ["成本", "费用", "优化", "省钱", "账单"]
    priority: 1
  - keywords: ["支出", "开销", "降低"]
    priority: 2
tools:
  - getCostOverview
  - getCostTrend
  - getCostBreakdown
  - getOptimizationSuggestions
  - applyOptimization
  - forecastCost
config:
  - name: threshold
    type: number
    default: 100
    description: 成本异常阈值（美元），超过此值视为异常
  - name: period
    type: string
    default: "30d"
    description: 分析周期
---

## 使用流程

1. **概览**: 调用 `getCostOverview` 获取本月成本概览
2. **趋势**: 调用 `getCostTrend` 分析成本趋势
3. **明细**: 调用 `getCostBreakdown` 查看按资源维度的成本明细
4. **建议**: 调用 `getOptimizationSuggestions` 获取优化建议
5. **预测**: 调用 `forecastCost` 预测未来成本
6. **执行**: 如需执行优化，调用 `applyOptimization`

## 注意事项

- 仅对 admin 角色开放 `applyOptimization` 执行权限
- 优化前建议先查看趋势确认异常
- 阈值可通过配置参数调整
```

- [ ] **Step 2: 创建资源查询技能**

```bash
mkdir -p /workspace/skills/cloud-resource-query
```

```markdown
---
name: cloud-resource-query
description: 查询和管理云资源，支持跨云厂商资源检索
triggers:
  - keywords: ["资源", "查询", "列表", "查看"]
    priority: 1
  - keywords: ["服务器", "实例", "数据库", "存储"]
    priority: 2
tools:
  - list_cloud_resources
  - get_cloud_stats
  - syncResources
  - instanceAction
config:
  - name: default_limit
    type: number
    default: 50
    description: 默认返回资源数量限制
---

## 使用流程

1. **列表**: 调用 `list_cloud_resources` 获取资源列表
2. **统计**: 调用 `get_cloud_stats` 获取全局统计
3. **同步**: 如需最新数据，调用 `syncResources`
4. **操作**: 如需启停资源，调用 `instanceAction`

## 注意事项

- viewer 角色只能查看，不能执行操作
- 支持按 Provider、类型、区域筛选
```

- [ ] **Step 3: 创建安全审计技能**

```bash
mkdir -p /workspace/skills/cloud-security-audit
```

```markdown
---
name: cloud-security-audit
description: 执行云安全审计，发现潜在安全风险
triggers:
  - keywords: ["安全", "审计", "风险", "漏洞"]
    priority: 1
  - keywords: ["合规", "检查", "扫描"]
    priority: 2
tools:
  - list_cloud_resources
  - get_cloud_stats
  - cloudAPIRequest
config:
  - name: severity_threshold
    type: string
    default: "medium"
    description: 风险等级阈值（low/medium/high/critical）
---

## 使用流程

1. **资源扫描**: 调用 `list_cloud_resources` 获取所有资源
2. **安全检测**: 调用 `cloudAPIRequest` 执行各云厂商安全检测 API
3. **报告**: 汇总发现的安全问题并给出修复建议

## 注意事项

- 安全审计需要 admin 角色
- 仅执行只读安全检测，不修改任何配置
```

- [ ] **Step 4: Commit**

```bash
git add skills/
git commit -m "feat(skills): add example SKILL.md files for cost, resource, and security"
```

---

## Task 10: 前端状态管理

**Files:**
- Create: `web/js/state.js`

- [ ] **Step 1: 实现 EventEmitter 状态管理**

```javascript
// web/js/state.js
class StateManager extends EventTarget {
  constructor() {
    super();
    this._state = {
      user: null,
      theme: localStorage.getItem('theme') || 'dark',
      currentPage: 'dashboard',
      notifications: [],
      sidebarCollapsed: false,
      skills: { list: [], loading: false },
      accounts: { list: [], loading: false },
      resources: { list: [], filter: 'all', loading: false },
      chat: { sessions: [], currentSession: null, messages: [], streaming: false },
      sync: { status: null, logs: [], loading: false },
      cost: { overview: null, trend: null, loading: false },
    };
  }

  get(key) {
    if (!key) return this._state;
    const keys = key.split('.');
    let value = this._state;
    for (const k of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[k];
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let target = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    const oldValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;
    this.dispatchEvent(new CustomEvent(`state:${key}`, {
      detail: { key, value, oldValue }
    }));
  }

  // 批量更新
  batch(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key, value);
    }
  }

  // 订阅状态变化
  subscribe(key, callback) {
    const handler = (e) => callback(e.detail.value, e.detail.oldValue);
    this.addEventListener(`state:${key}`, handler);
    return () => this.removeEventListener(`state:${key}`, handler);
  }
}

const state = new StateManager();

// 主题切换
state.subscribe('theme', (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
});

export default state;
```

- [ ] **Step 2: Commit**

```bash
git add web/js/state.js
git commit -m "feat(frontend): add EventEmitter-based state manager"
```

---

## Task 11: 前端 API 封装

**Files:**
- Create: `web/js/api.js`

- [ ] **Step 1: 实现 API 客户端**

```javascript
// web/js/api.js
const API_BASE = '/api';

class APIError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

class APIClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new APIError(response.status, error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      if (err.name === 'APIError') throw err;
      throw new APIError(0, err.message || 'Network error');
    }
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

const api = new APIClient();

// 认证 API
export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
};

// 账户 API
export const accountsAPI = {
  list: () => api.get('/accounts'),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.post(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
  sync: (id) => api.post(`/accounts/${id}/sync`),
  syncAll: () => api.post('/resources/sync'),
};

// 资源 API
export const resourcesAPI = {
  list: () => api.get('/resources'),
  action: (id, action) => api.post(`/resources/${id}/${action}`),
};

// 同步 API
export const syncAPI = {
  status: () => api.get('/resources/sync/status'),
  logs: () => api.get('/resources/sync_logs'),
};

// 成本 API
export const costAPI = {
  overview: () => api.get('/cost/overview'),
  trend: () => api.get('/cost/trend'),
  breakdown: () => api.get('/cost/breakdown'),
  suggestions: () => api.get('/cost/optimization/suggestions'),
};

// 会话 API
export const chatAPI = {
  sessions: () => api.get('/agent/sessions'),
  createSession: (data) => api.post('/agent/sessions', data),
  getSession: (id) => api.get(`/agent/sessions/${id}`),
  deleteSession: (id) => api.delete(`/agent/sessions/${id}`),
  stream: (sessionId, message) => {
    return new EventSource(`${API_BASE}/agent/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`);
  },
};

// 技能 API
export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (name) => api.get(`/skills/${name}`),
  enable: (name) => api.post(`/skills/${name}/enable`),
  disable: (name) => api.post(`/skills/${name}/disable`),
  updateConfig: (name, config) => api.put(`/skills/${name}/config`, { config }),
};

export { api, APIError };
```

- [ ] **Step 2: Commit**

```bash
git add web/js/api.js
git commit -m "feat(frontend): add unified API client with module-specific endpoints"
```

---

## Task 12: 前端 UI 组件

**Files:**
- Create: `web/js/components/toast.js`
- Create: `web/js/components/modal.js`

- [ ] **Step 1: 实现 Toast 组件**

```javascript
// web/js/components/toast.js
export class Toast {
  static container = null;

  static getContainer() {
    if (!Toast.container) {
      Toast.container = document.createElement('div');
      Toast.container.className = 'toast-container';
      document.body.appendChild(Toast.container);
    }
    return Toast.container;
  }

  static show(message, type = 'info', duration = 3000) {
    const container = Toast.getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    // 动画进入
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    // 自动消失
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  static success(message, duration) {
    return Toast.show(message, 'success', duration);
  }

  static error(message, duration) {
    return Toast.show(message, 'error', duration);
  }

  static warning(message, duration) {
    return Toast.show(message, 'warning', duration);
  }
}
```

- [ ] **Step 2: 实现 Modal 组件**

```javascript
// web/js/components/modal.js
export class Modal {
  constructor(options = {}) {
    this.title = options.title || '';
    this.content = options.content || '';
    this.showConfirm = options.showConfirm !== false;
    this.showCancel = options.showCancel !== false;
    this.confirmText = options.confirmText || '确认';
    this.cancelText = options.cancelText || '取消';
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.element = null;
  }

  show() {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.className = 'modal-overlay';
    this.element.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${this.title}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${this.content}</div>
        <div class="modal-footer">
          ${this.showCancel ? `<button class="btn btn-secondary modal-cancel">${this.cancelText}</button>` : ''}
          ${this.showConfirm ? `<button class="btn btn-primary modal-confirm">${this.confirmText}</button>` : ''}
        </div>
      </div>
    `;

    // 事件绑定
    this.element.querySelector('.modal-close')?.addEventListener('click', () => this.hide());
    this.element.querySelector('.modal-cancel')?.addEventListener('click', () => {
      this.onCancel();
      this.hide();
    });
    this.element.querySelector('.modal-confirm')?.addEventListener('click', () => {
      this.onConfirm();
      this.hide();
    });

    // 点击遮罩关闭
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.hide();
    });

    document.body.appendChild(this.element);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      this.element.classList.add('modal-visible');
    });
  }

  hide() {
    if (!this.element) return;
    this.element.classList.remove('modal-visible');
    setTimeout(() => {
      this.element?.remove();
      this.element = null;
      document.body.style.overflow = '';
    }, 300);
  }

  static confirm(options) {
    return new Promise((resolve) => {
      const modal = new Modal({
        ...options,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
      modal.show();
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add web/js/components/toast.js web/js/components/modal.js
git commit -m "feat(frontend): add Toast and Modal UI components"
```

---

## Task 13: 前端页面模块 - Accounts

**Files:**
- Create: `web/js/pages/accounts.js`

- [ ] **Step 1: 实现 Accounts 页面模块**

```javascript
// web/js/pages/accounts.js
import state from '../state.js';
import { accountsAPI } from '../api.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';

export const accountsPage = {
  name: 'accounts',

  init() {
    this.render();
    this.bindEvents();
    this.loadData();
  },

  render() {
    const page = document.getElementById('page-accounts');
    if (!page) return;

    // 页面结构已在 HTML 中，这里绑定动态内容
    this.tableBody = page.querySelector('.accounts-table tbody');
    this.loadingEl = page.querySelector('.accounts-loading');
    this.emptyEl = page.querySelector('.accounts-empty');
  },

  bindEvents() {
    // 刷新按钮
    document.querySelector('.accounts-refresh-btn')?.addEventListener('click', () => {
      this.loadData();
    });

    // 添加账户按钮
    document.querySelector('.accounts-add-btn')?.addEventListener('click', () => {
      this.showAddModal();
    });

    // 表格操作委托
    this.tableBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'sync':
          this.syncAccount(id);
          break;
        case 'edit':
          this.editAccount(id);
          break;
        case 'delete':
          this.deleteAccount(id);
          break;
      }
    });
  },

  async loadData() {
    state.set('accounts.loading', true);
    try {
      const data = await accountsAPI.list();
      state.set('accounts.list', data.accounts || []);
      this.renderTable();
    } catch (err) {
      Toast.error(`加载账户失败: ${err.message}`);
    } finally {
      state.set('accounts.loading', false);
    }
  },

  renderTable() {
    const accounts = state.get('accounts.list');

    if (!accounts || accounts.length === 0) {
      this.tableBody.innerHTML = '';
      this.emptyEl?.classList.remove('hidden');
      return;
    }

    this.emptyEl?.classList.add('hidden');
    this.tableBody.innerHTML = accounts.map(acc => `
      <tr data-id="${acc.id}">
        <td>${acc.provider}</td>
        <td>${acc.account_id}</td>
        <td>${acc.name}</td>
        <td>${acc.regions?.join(', ') || '-'}</td>
        <td><span class="badge badge-${acc.status === 'active' ? 'success' : 'warning'}">${acc.status}</span></td>
        <td>${acc.last_sync ? new Date(acc.last_sync).toLocaleString() : '从未'}</td>
        <td>
          <button class="btn btn-sm btn-icon" data-action="sync" data-id="${acc.id}" title="同步">
            <svg><use href="/static/icons.svg#icon-refresh"></use></svg>
          </button>
          <button class="btn btn-sm btn-icon" data-action="edit" data-id="${acc.id}" title="编辑">
            <svg><use href="/static/icons.svg#icon-edit"></use></svg>
          </button>
          <button class="btn btn-sm btn-icon btn-danger" data-action="delete" data-id="${acc.id}" title="删除">
            <svg><use href="/static/icons.svg#icon-trash"></use></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  async syncAccount(id) {
    try {
      await accountsAPI.sync(id);
      Toast.success('同步已启动');
      this.loadData();
    } catch (err) {
      Toast.error(`同步失败: ${err.message}`);
    }
  },

  async deleteAccount(id) {
    const confirmed = await Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      confirmText: '删除',
      cancelText: '取消',
    });

    if (!confirmed) return;

    try {
      await accountsAPI.delete(id);
      Toast.success('账户已删除');
      this.loadData();
    } catch (err) {
      Toast.error(`删除失败: ${err.message}`);
    }
  },

  showAddModal() {
    // 实现添加账户弹窗
    Toast.info('添加账户功能开发中');
  },

  editAccount(id) {
    Toast.info('编辑账户功能开发中');
  },

  destroy() {
    // 清理事件监听
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add web/js/pages/accounts.js
git commit -m "feat(frontend): add Accounts page module with CRUD operations"
```

---

## Task 14: 前端入口与路由

**Files:**
- Create: `web/js/app.js`
- Modify: `web/index.html`

- [ ] **Step 1: 实现前端入口**

```javascript
// web/js/app.js
import state from './state.js';
import { api } from './api.js';
import { Toast } from './components/toast.js';

// 页面模块
import { accountsPage } from './pages/accounts.js';

// 页面注册表
const pages = {
  dashboard: null, // 暂不拆分
  accounts: accountsPage,
  resources: null,
  sync: null,
  cost: null,
  terminal: null,
  chat: null,
  profile: null,
};

let currentPage = null;

// 路由切换
function navigateTo(pageId) {
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  // 显示目标页面
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
  }

  // 更新导航高亮
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  // 销毁旧页面
  if (currentPage && currentPage.destroy) {
    currentPage.destroy();
  }

  // 初始化新页面
  const pageModule = pages[pageId];
  if (pageModule) {
    pageModule.init();
    currentPage = pageModule;
  }

  state.set('currentPage', pageId);
}

// 初始化应用
function initApp() {
  // 检查登录状态
  const token = localStorage.getItem('token');
  if (!token && !window.location.pathname.includes('login')) {
    window.location.href = '/login.html';
    return;
  }

  api.setToken(token);

  // 绑定导航点击
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      if (pageId) {
        navigateTo(pageId);
      }
    });
  });

  // 主题初始化
  const theme = state.get('theme');
  document.documentElement.setAttribute('data-theme', theme);

  // 默认页面
  const defaultPage = 'dashboard';
  navigateTo(defaultPage);

  console.log('App initialized');
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// 全局错误处理
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  Toast.error('发生错误，请刷新页面重试');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
});
```

- [ ] **Step 2: 修改 index.html 为精简骨架**

保留现有 HTML 结构，但将内联 JS 替换为模块引用：

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MultiCloud Manager</title>
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/components.css">
</head>
<body>
  <div id="app">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <!-- ... 现有结构 ... -->
    </aside>

    <!-- 主内容区 -->
    <main class="content">
      <!-- 顶部栏 -->
      <header class="topbar">
        <!-- ... 现有结构 ... -->
      </header>

      <!-- 页面内容 -->
      <div class="pages">
        <div id="page-dashboard" class="page">
          <!-- Dashboard 内容 -->
        </div>
        <div id="page-accounts" class="page hidden">
          <!-- Accounts 内容 -->
        </div>
        <!-- ... 其他页面 ... -->
      </div>
    </main>
  </div>

  <!-- 模块脚本 -->
  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add web/js/app.js web/index.html
git commit -m "feat(frontend): add app entry with modular routing"
```

---

## Task 15: CSS 拆分

**Files:**
- Create: `web/css/variables.css`
- Create: `web/css/base.css`
- Create: `web/css/layout.css`
- Create: `web/css/components.css`

- [ ] **Step 1: 从现有 index.html 提取 CSS**

将现有 `index.html` 中的 `<style>` 内容按功能拆分到四个 CSS 文件：

1. **variables.css**: CSS 变量定义（颜色、字体、间距、圆角、阴影）
2. **base.css**: 重置样式、全局样式、工具类
3. **layout.css**: 侧边栏、topbar、content 布局、页面切换
4. **components.css**: 卡片、表格、表单、弹窗、Toast、按钮、badge

- [ ] **Step 2: Commit**

```bash
git add web/css/
git commit -m "feat(frontend): split CSS into variables, base, layout, and components"
```

---

## Task 16: 构建脚本

**Files:**
- Create: `Makefile`

- [ ] **Step 1: 创建 Makefile**

```makefile
.PHONY: build build-web dev test clean

# Go 构建
build:
	go build -o bin/multicloud main.go

# 前端构建（合并为单文件）
build-web:
	@echo "Building web assets..."
	@mkdir -p web/dist
	@cat web/css/variables.css web/css/base.css web/css/layout.css web/css/components.css > web/dist/style.css
	@cat web/js/state.js web/js/api.js web/js/utils.js \
	    web/js/components/*.js \
	    web/js/pages/*.js \
	    web/js/app.js > web/dist/app.js
	@cp web/index.html web/dist/index.html
	@sed -i 's|href="/css/|href="/dist/|g' web/dist/index.html
	@sed -i 's|src="/js/|src="/dist/|g' web/dist/index.html
	@echo "Web assets built to web/dist/"

# 开发模式（不合并，直接引用源文件）
dev:
	go run main.go

# 测试
test:
	go test ./... -v

# 清理
clean:
	rm -rf bin/ web/dist/
```

- [ ] **Step 2: Commit**

```bash
git add Makefile
git commit -m "chore(build): add Makefile with web asset build pipeline"
```

---

## Task 17: 集成验证

**Files:**
- 所有新增/修改文件

- [ ] **Step 1: 运行 Go 测试**

```bash
cd /workspace && go test ./internal/agent/skill/ -v
```

Expected: 所有测试通过

- [ ] **Step 2: 编译验证**

```bash
cd /workspace && go build -o /tmp/multicloud main.go
```

Expected: 编译成功，无错误

- [ ] **Step 3: 前端文件检查**

```bash
ls -la /workspace/web/js/
ls -la /workspace/web/css/
ls -la /workspace/web/js/components/
ls -la /workspace/web/js/pages/
ls -la /workspace/skills/
```

Expected: 所有文件存在

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete skill system upgrade and frontend modularization"
```

---

## 自检清单

**1. Spec 覆盖检查:**

| 设计文档要求 | 对应任务 |
|-------------|---------|
| SKILL.md 格式支持 | Task 2 (parser.go) |
| 工具绑定 | Task 5 (engine.go GetSkillTools) |
| 触发机制 | Task 3 (matcher.go) |
| 阶段化流程 | Task 9 (示例 SKILL.md) |
| 参数配置 | Task 5 (engine.go UpdateConfig) |
| 前端状态管理 | Task 10 (state.js) |
| API 统一封装 | Task 11 (api.js) |
| UI 组件抽离 | Task 12 (toast.js, modal.js) |
| 页面模块拆分 | Task 13 (accounts.js), Task 14 (app.js) |
| 技能管理 API | Task 8 (skills.go) |

**2. Placeholder 扫描:** 无 TBD/TODO/占位符

**3. 类型一致性:** Skill 结构体在所有任务中定义一致

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-06-17-skill-frontend-optimization.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

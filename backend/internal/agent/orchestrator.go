package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Orchestrator AI Agent 编排器
// 负责意图解析、方案生成、风险审查、分步执行
type Orchestrator struct {
	llmClient  LLMClient
	riskEngine *RiskEngine
	rules      *RulesEngine
}

// LLMClient LLM API 客户端接口
type LLMClient interface {
	Chat(ctx context.Context, messages []Message) (*ChatResponse, error)
}

// NewOrchestrator 创建 AI Agent 编排器
func NewOrchestrator(llm LLMClient) *Orchestrator {
	return &Orchestrator{
		llmClient:  llm,
		riskEngine: NewRiskEngine(),
		rules:      NewRulesEngine(),
	}
}

// ProcessUserInput 处理用户自然语言输入
// 返回执行计划（经过风险审查）
func (o *Orchestrator) ProcessUserInput(ctx context.Context, input string) (*ExecutionPlan, error) {
	// Step 1: 意图解析
	intent, err := o.parseIntent(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("intent parsing failed: %v", err)
	}

	// Step 2: 方案生成
	plan, err := o.generatePlan(ctx, intent)
	if err != nil {
		return nil, fmt.Errorf("plan generation failed: %v", err)
	}

	// Step 3: 风险审查
	plan = o.riskEngine.Review(plan)

	// Step 4: 规则引擎校验（硬约束）
	if err := o.rules.Validate(plan); err != nil {
		return nil, fmt.Errorf("plan rejected by rules engine: %v", err)
	}

	plan.ID = "plan_" + uuid.New().String()[:12]
	plan.CreatedAt = time.Now()

	return plan, nil
}

// parseIntent 意图解析
func (o *Orchestrator) parseIntent(ctx context.Context, input string) (*Intent, error) {
	systemPrompt := `You are a cloud operations intent parser for MultiCloud Manager.

Parse the user's request and extract structured intent.
Supported clouds: azure, oracle, tencent, render
Supported actions: create, delete, start, stop, restart
Supported resource types: vm, database, storage, network, kubernetes, function

Rules:
1. If the user's input is NOT a cloud operation request (e.g. it's a question, recommendation, or general chat), set action to "query"
2. Translate Chinese cloud names: 微软云/Azure/Azure云 → azure, 腾讯云/tencent → tencent, 甲骨文/Oracle → oracle
3. Translate Chinese resource names: 虚拟机/VM/服务器 → vm, 数据库 → database, 存储/磁盘 → storage, 网络 → network
4. Extract all numeric parameters (cpu count, memory GB, disk size GB, etc.) into params
5. Extract region if specified: 日本/东京/tokyo/ap-northeast-1, 美国/美西/us-west, etc.

Return JSON only, no explanation. Example:
{"action":"create","cloud":"oracle","resource_type":"vm","region":"us-ashburn-1","params":{"cpu":4,"memory_gb":24,"disk_gb":50}}`

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: input},
	}

	resp, err := o.llmClient.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	var intent Intent
	if err := json.Unmarshal([]byte(resp.Content), &intent); err != nil {
		// Try to extract JSON from the response if it contains extra text
		content := resp.Content
		if idx := strings.Index(content, "{"); idx >= 0 {
			content = content[idx:]
		}
		if idx := strings.LastIndex(content, "}"); idx >= 0 {
			content = content[:idx+1]
		}
		if err2 := json.Unmarshal([]byte(content), &intent); err2 != nil {
			return nil, fmt.Errorf("failed to parse LLM intent: %v (raw: %s)", err, resp.Content)
		}
	}

	return &intent, nil
}

// generatePlan 方案生成（LLM驱动，生成详细的执行方案）
func (o *Orchestrator) generatePlan(ctx context.Context, intent *Intent) (*ExecutionPlan, error) {
	systemPrompt := `You are a cloud operations plan generator for MultiCloud Manager.
Given the user's intent, generate a detailed execution plan.

Available clouds and their typical regions:
- azure: eastus, southeastasia, japaneast, westeurope
- oracle: us-ashburn-1, us-phoenix-1, ap-tokyo-1, ap-seoul-1
- tencent: ap-guangzhou, ap-shanghai, ap-beijing, ap-tokyo
- render: ohio, frankfurt, singapore, oregon

Return a JSON object with the following fields:
{
  "title": "concise plan title in Chinese",
  "description": "detailed plan explanation covering what will be done, why, and any important notes",
  "steps": [
    {
      "id": 1,
      "action": "the action to perform",
      "cloud": "target cloud",
      "description": "detailed step description in Chinese with specific parameters",
      "params": {
        "resource_type": "vm|database|storage|network",
        "region": "selected region",
        "specs": "instance size or spec like Standard_B1s / VM.Standard.A1.Flex",
        "os": "operating system if applicable",
        "name": "suggested resource name"
      },
      "credential_ref": "cloud-default"
    }
  ],
  "missing_params": ["list any missing required information the user needs to provide"],
  "estimated_cost": 0.0
}

Rules:
- description must be in Chinese, at least 3 sentences, explaining the plan clearly
- Each step description must include specific recommended configurations
- If region/specs are not specified by user, pick reasonable defaults
- estimated_cost should be a reasonable monthly USD estimate
- If user didn't specify key parameters, list them in missing_params`

	intentJSON, _ := json.Marshal(intent)
	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: fmt.Sprintf("Generate a plan for this intent: %s", string(intentJSON))},
	}

	resp, err := o.llmClient.Chat(ctx, messages)
	if err != nil {
		// 回退到模板方案
		return o.fallbackPlan(intent), nil
	}

	// 解析LLM返回的JSON
	content := resp.Content
	if idx := strings.Index(content, "{"); idx >= 0 {
		content = content[idx:]
	}
	if idx := strings.LastIndex(content, "}"); idx >= 0 {
		content = content[:idx+1]
	}

	var plan ExecutionPlan
	plan.Status = "awaiting_confirmation"
	if err := json.Unmarshal([]byte(content), &plan); err != nil {
		// 回退到模板方案
		return o.fallbackPlan(intent), nil
	}

	plan.ID = "plan_" + uuid.New().String()[:12]
	plan.CreatedAt = time.Now()
	if plan.Title == "" {
		plan.Title = fmt.Sprintf("%s %s on %s", intent.Action, intent.ResourceType, intent.Cloud)
	}

	return &plan, nil
}

// fallbackPlan 模板方案（LLM调用失败时的后备）
func (o *Orchestrator) fallbackPlan(intent *Intent) *ExecutionPlan {
	plan := &ExecutionPlan{
		Title:   fmt.Sprintf("%s %s on %s", intent.Action, intent.ResourceType, intent.Cloud),
		Steps:   make([]ExecutionStep, 0),
		Status:  "awaiting_confirmation",
	}

	step := ExecutionStep{
		ID:     1,
		Action: intent.Action,
		Cloud:  intent.Cloud,
		Params: map[string]interface{}{
			"resource_type": intent.ResourceType,
			"region":        intent.Region,
		},
		CredentialRef: fmt.Sprintf("%s-%s", intent.Cloud, "default"),
	}
	for k, v := range intent.Params {
		step.Params[k] = v
	}
	plan.Steps = append(plan.Steps, step)

	return plan
}

// Intent 意图结构
type Intent struct {
	Action       string                 `json:"action"`
	Cloud        string                 `json:"cloud"`
	ResourceType string                 `json:"resource_type"`
	Region       string                 `json:"region"`
	Params       map[string]interface{} `json:"params"`
}

// ExecutionPlan 执行计划
type ExecutionPlan struct {
	ID              string          `json:"id"`
	Title           string          `json:"title"`
	Description     string          `json:"description,omitempty"`
	Steps           []ExecutionStep `json:"steps"`
	RiskSummary     *RiskSummary    `json:"risk_summary,omitempty"`
	MissingParams   []string        `json:"missing_params,omitempty"`
	EstimatedCost   float64         `json:"estimated_cost,omitempty"`
	Status          string          `json:"status"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ExecutionStep 执行步骤
type ExecutionStep struct {
	ID            int                    `json:"id"`
	Action        string                 `json:"action"`
	Cloud         string                 `json:"cloud"`
	Params        map[string]interface{} `json:"params"`
	CredentialRef string                 `json:"credential_ref"`
	RiskLevel     string                 `json:"risk_level"`
	RiskReason    string                 `json:"risk_reason,omitempty"`
}

// RiskSummary 风险摘要
type RiskSummary struct {
	OverallRisk string       `json:"overall_risk"`
	HighSteps   []int        `json:"high_steps"`
	MediumSteps []int        `json:"medium_steps"`
	LowSteps    []int        `json:"low_steps"`
	Warnings    []string     `json:"warnings"`
}

// RiskEngine 风险引擎
type RiskEngine struct{}

func NewRiskEngine() *RiskEngine {
	return &RiskEngine{}
}

// Review 对执行计划进行风险审查
func (re *RiskEngine) Review(plan *ExecutionPlan) *ExecutionPlan {
	var highSteps, mediumSteps, lowSteps []int
	var warnings []string

	for i, step := range plan.Steps {
		risk := re.assessRisk(step)
		plan.Steps[i].RiskLevel = risk.level
		plan.Steps[i].RiskReason = risk.reason

		switch risk.level {
		case "high":
			highSteps = append(highSteps, step.ID)
			warnings = append(warnings, fmt.Sprintf("Step %d: %s", step.ID, risk.reason))
		case "medium":
			mediumSteps = append(mediumSteps, step.ID)
		case "low":
			lowSteps = append(lowSteps, step.ID)
		}
	}

	overall := "low"
	if len(highSteps) > 0 {
		overall = "high"
	} else if len(mediumSteps) > 0 {
		overall = "medium"
	}

	plan.RiskSummary = &RiskSummary{
		OverallRisk: overall,
		HighSteps:   highSteps,
		MediumSteps: mediumSteps,
		LowSteps:    lowSteps,
		Warnings:    warnings,
	}

	return plan
}

type riskAssessment struct {
	level  string
	reason string
}

func (re *RiskEngine) assessRisk(step ExecutionStep) riskAssessment {
	// 删除操作始终高风险
	if step.Action == "delete" || step.Action == "destroy" {
		return riskAssessment{
			level:  "high",
			reason: "Deletion operations require explicit confirmation due to irreversible data loss risk",
		}
	}

	// 停止生产资源中风险
	if step.Action == "stop" {
		return riskAssessment{
			level:  "medium",
			reason: "Stopping a resource may cause service interruption",
		}
	}

	return riskAssessment{
		level:  "low",
		reason: "Safe operation",
	}
}

// RulesEngine 安全规则引擎（硬编码约束，LLM 无法绕过）
type RulesEngine struct{}

func NewRulesEngine() *RulesEngine {
	return &RulesEngine{}
}

// ForbiddenActions LLM 绝对不能写入 plan 的操作
var ForbiddenActions = []string{
	"modify_iam",
	"change_billing",
	"delete_bucket",
	"format_disk",
	"reset_instance",
}

// Validate 验证执行计划是否违反安全规则
func (re *RulesEngine) Validate(plan *ExecutionPlan) error {
	for _, step := range plan.Steps {
		for _, forbidden := range ForbiddenActions {
			if step.Action == forbidden {
				return fmt.Errorf("action '%s' is forbidden and cannot be executed via AI Agent", step.Action)
			}
		}
	}

	return nil
}

// ExecutionResult 单步执行结果
type ExecutionResult struct {
	StepID    int                    `json:"step_id"`
	Success   bool                   `json:"success"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Duration  time.Duration          `json:"duration"`
	Timestamp time.Time              `json:"timestamp"`
}

// ExecutionMode 执行模式
type ExecutionMode string

const (
	ModePlanOnly     ExecutionMode = "plan_only"     // 仅生成方案
	ModeStepConfirm  ExecutionMode = "step_confirm"  // 分步确认
	ModeRiskReview   ExecutionMode = "risk_review"   // 风险审查模式
	ModeAutoExecute  ExecutionMode = "auto_execute"  // 全自动执行
)
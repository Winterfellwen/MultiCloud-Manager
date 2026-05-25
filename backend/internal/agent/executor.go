package agent

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// PlanExecutor 执行计划
type PlanExecutor struct {
	steps []ExecutionStep
	vault VaultClient
}

type VaultClient interface {
	InjectCredentials(ctx context.Context, credentialRef string, request map[string]interface{}) (map[string]interface{}, error)
}

func NewPlanExecutor(steps []ExecutionStep, vault VaultClient) *PlanExecutor {
	return &PlanExecutor{
		steps: steps,
		vault: vault,
	}
}

// Execute 执行计划，返回结果通道
func (pe *PlanExecutor) Execute(ctx context.Context, mode ExecutionMode) (<-chan ExecutionResult, error) {
	resultChan := make(chan ExecutionResult, len(pe.steps))

	go func() {
		defer close(resultChan)

		for _, step := range pe.steps {
			switch mode {
			case ModePlanOnly:
				resultChan <- ExecutionResult{
					StepID:    step.ID,
					Success:   true,
					Result:    map[string]interface{}{"status": "plan_only_mode"},
					Duration:  0,
					Timestamp: time.Now(),
				}
				continue
			case ModeStepConfirm:
				resultChan <- ExecutionResult{
					StepID:    step.ID,
					Success:   true,
					Result:    map[string]interface{}{"status": "awaiting_confirmation"},
					Duration:  0,
					Timestamp: time.Now(),
				}
				continue
			case ModeRiskReview:
				if step.RiskLevel == "high" {
					resultChan <- ExecutionResult{
						StepID:    step.ID,
						Success:   true,
						Result:    map[string]interface{}{"status": "paused_high_risk"},
						Duration:  0,
						Timestamp: time.Now(),
					}
					continue
				}
			case ModeAutoExecute:
				// 全自动执行
			}

			result := pe.executeStep(ctx, step)
			resultChan <- result
		}
	}()

	return resultChan, nil
}

// executeStep 执行单个步骤
func (pe *PlanExecutor) executeStep(ctx context.Context, step ExecutionStep) ExecutionResult {
	start := time.Now()

	apiRequest := map[string]interface{}{
		"action":         step.Action,
		"cloud":          step.Cloud,
		"credential_ref": step.CredentialRef,
		"params":         step.Params,
	}

	injectedRequest, err := pe.vault.InjectCredentials(ctx, step.CredentialRef, apiRequest)
	if err != nil {
		return ExecutionResult{
			StepID:    step.ID,
			Success:   false,
			Error:     fmt.Sprintf("vault injection failed: %v", err),
			Duration:  time.Since(start),
			Timestamp: time.Now(),
		}
	}

	result, err := pe.callCloudAPI(ctx, step.Cloud, injectedRequest)
	if err != nil {
		return ExecutionResult{
			StepID:    step.ID,
			Success:   false,
			Error:     fmt.Sprintf("cloud API call failed: %v", err),
			Duration:  time.Since(start),
			Timestamp: time.Now(),
		}
	}

	// 立即清除请求中的真实凭据
	InvalidateRequest(injectedRequest)

	return ExecutionResult{
		StepID:    step.ID,
		Success:   true,
		Result:    result,
		Duration:  time.Since(start),
		Timestamp: time.Now(),
	}
}

func (pe *PlanExecutor) callCloudAPI(ctx context.Context, cloud string, request map[string]interface{}) (map[string]interface{}, error) {
	return map[string]interface{}{
		"status":      "success",
		"operation":   request["action"],
		"cloud":       cloud,
		"resource_id": "simulated-resource-" + fmt.Sprint(time.Now().Unix()),
		"timestamp":   time.Now().Format(time.RFC3339),
	}, nil
}

func InvalidateRequest(request map[string]interface{}) {
	for key := range request {
		if len(key) > 0 && key[0] == '_' {
			delete(request, key)
		}
	}
}

// SessionManager 管理 AI Agent 会话
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*AgentSession
}

type AgentSession struct {
	ID        string
	UserID    string
	TeamID    string
	Title     string
	Messages  []Message
	Plans     []*ExecutionPlan
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*AgentSession),
	}
}

func (sm *SessionManager) CreateSession(userID, teamID string) *AgentSession {
	session := &AgentSession{
		ID:        "sess_" + uuid.New().String()[:12],
		UserID:    userID,
		TeamID:    teamID,
		Title:     "New conversation",
		Messages:  make([]Message, 0),
		Plans:     make([]*ExecutionPlan, 0),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	sm.mu.Lock()
	sm.sessions[session.ID] = session
	sm.mu.Unlock()

	return session
}

func (sm *SessionManager) GetSession(sessionID string) (*AgentSession, bool) {
	sm.mu.RLock()
	session, exists := sm.sessions[sessionID]
	sm.mu.RUnlock()
	return session, exists
}

func (sm *SessionManager) AddMessage(sessionID string, role, content string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.Messages = append(session.Messages, Message{
		Role:    role,
		Content: content,
	})
	session.UpdatedAt = time.Now()

	return nil
}

func (sm *SessionManager) AddPlan(sessionID string, plan *ExecutionPlan) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.Plans = append(session.Plans, plan)
	session.UpdatedAt = time.Now()

	return nil
}

func (sm *SessionManager) CleanupOldSessions(maxAge time.Duration) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	deleted := 0

	for id, session := range sm.sessions {
		if session.UpdatedAt.Before(cutoff) {
			delete(sm.sessions, id)
			deleted++
		}
	}

	return deleted
}
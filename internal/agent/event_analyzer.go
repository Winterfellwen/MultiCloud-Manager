package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// AnalyzerAIConfig holds AI configuration for the event analyzer.
type AnalyzerAIConfig struct {
	APIEndpoint string `json:"api_endpoint"`
	Model       string `json:"model"`
	APIKey      string `json:"api_key"`
}

// EventAnalyzer performs AI analysis on cloud events.
type EventAnalyzer struct {
	db *sql.DB
}

// NewEventAnalyzer creates a new EventAnalyzer.
func NewEventAnalyzer(db *sql.DB) *EventAnalyzer {
	return &EventAnalyzer{db: db}
}

// AnalysisResult holds the result of an AI analysis.
type AnalysisResult struct {
	ID           string                 `json:"id"`
	AnalysisType string                 `json:"analysis_type"`
	Summary      string                 `json:"summary"`
	Details      []map[string]interface{} `json:"details"`
	Model        string                 `json:"model"`
	CreatedAt    string                 `json:"created_at"`
}

// Analyze performs AI analysis on cloud events.
func (a *EventAnalyzer) Analyze(ctx context.Context, cfg AnalyzerAIConfig, analysisType string, scope map[string]interface{}) (*AnalysisResult, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("AI not configured")
	}

	// Query events based on scope
	events := a.queryEvents(ctx, analysisType, scope)
	if len(events) == 0 {
		return nil, fmt.Errorf("no events found for analysis")
	}

	// Build prompt
	prompt := a.buildPrompt(analysisType, events)

	// Call LLM (non-streaming)
	result, err := a.callLLM(ctx, cfg, prompt)
	if err != nil {
		return nil, err
	}

	// Save to database
	id := a.saveAnalysis(ctx, analysisType, scope, result, cfg.Model)

	return &AnalysisResult{
		ID:           id,
		AnalysisType: analysisType,
		Summary:      result,
		Details:      nil,
		Model:        cfg.Model,
		CreatedAt:    time.Now().Format(time.RFC3339),
	}, nil
}

func (a *EventAnalyzer) queryEvents(ctx context.Context, analysisType string, scope map[string]interface{}) []map[string]string {
	var timeRange string
	switch analysisType {
	case "anomaly_detection":
		timeRange = "24 hours"
	case "trend", "suggestion":
		timeRange = "7 days"
	default:
		timeRange = "24 hours"
	}

	query := `SELECT cloud_type, event_type, severity, title, description, resource_name, region, event_at::text
               FROM cloud_events WHERE event_at > NOW() - INTERVAL '` + timeRange + `'`

	// Apply scope filters
	if ct, ok := scope["cloud_type"].(string); ok && ct != "" {
		query += fmt.Sprintf(" AND cloud_type = '%s'", ct)
	}
	if et, ok := scope["event_type"].(string); ok && et != "" {
		query += fmt.Sprintf(" AND event_type = '%s'", et)
	}

	query += " ORDER BY event_at DESC LIMIT 100"

	rows, err := a.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("event-analyzer: query events: %v", err)
		return nil
	}
	defer rows.Close()

	var events []map[string]string
	for rows.Next() {
		var ct, et, sev, title string
		var desc, resName, region, eventAt sql.NullString
		if err := rows.Scan(&ct, &et, &sev, &title, &desc, &resName, &region, &eventAt); err != nil {
			continue
		}
		e := map[string]string{
			"cloud_type": ct, "event_type": et, "severity": sev, "title": title,
		}
		if desc.Valid {
			e["description"] = desc.String
		}
		if resName.Valid {
			e["resource_name"] = resName.String
		}
		if region.Valid {
			e["region"] = region.String
		}
		if eventAt.Valid {
			e["event_at"] = eventAt.String
		}
		events = append(events, e)
	}
	return events
}

func (a *EventAnalyzer) buildPrompt(analysisType string, events []map[string]string) string {
	eventsJSON, _ := json.MarshalIndent(events, "", "  ")

	switch analysisType {
	case "anomaly_detection":
		return fmt.Sprintf(`你是一个云基础设施运维专家。请分析以下来自多个云平台的事件日志，识别异常模式。

分析要求：
1. 识别异常事件（频繁失败、异常时间段操作、异常资源变更）
2. 关联跨平台的事件
3. 评估风险等级

事件数据（最近 %d 条）：
%s

请用简洁的中文返回分析结果，包括：
- 总体评估
- 发现的异常（每项包含：类型、严重程度、描述、建议措施）`, len(events), string(eventsJSON))

	case "trend":
		return fmt.Sprintf(`你是一个云基础设施运维专家。请分析以下事件日志的趋势。

事件数据（最近 %d 条）：
%s

请用简洁的中文返回趋势分析，包括：
- 事件数量和类型的变化趋势
- 是否有异常增长或下降
- 潜在原因分析`, len(events), string(eventsJSON))

	case "suggestion":
		return fmt.Sprintf(`你是一个云基础设施运维专家。请基于以下事件日志给出优化建议。

事件数据（最近 %d 条）：
%s

请用简洁的中文返回建议，包括：
- 安全建议
- 成本优化建议
- 运维效率提升建议
- 架构优化建议`, len(events), string(eventsJSON))

	default:
		return fmt.Sprintf("请分析以下云平台事件：\n%s", string(eventsJSON))
	}
}

func (a *EventAnalyzer) callLLM(ctx context.Context, cfg AnalyzerAIConfig, prompt string) (string, error) {
	endpoint := cfg.APIEndpoint
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}
	endpoint = strings.TrimRight(endpoint, "/")

	reqBody := map[string]interface{}{
		"model": cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "你是云基础设施运维专家，擅长分析多云平台的日志和事件。"},
			{"role": "user", "content": prompt},
		},
		"max_tokens":  2000,
		"temperature": 0.3,
	}
	bodyJSON, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM API returned %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from LLM")
	}
	return result.Choices[0].Message.Content, nil
}

func (a *EventAnalyzer) saveAnalysis(ctx context.Context, analysisType string, scope map[string]interface{}, summary, model string) string {
	scopeJSON, _ := json.Marshal(scope)

	var id string
	err := a.db.QueryRowContext(ctx,
		`INSERT INTO cloud_event_analysis (analysis_type, scope_params, summary, model)
		 VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
		analysisType, string(scopeJSON), summary, model).Scan(&id)
	if err != nil {
		log.Printf("event-analyzer: save analysis: %v", err)
	}
	return id
}

// GetRecentAnalysis returns the most recent analysis results.
func (a *EventAnalyzer) GetRecentAnalysis(ctx context.Context, limit int) []map[string]interface{} {
	if limit <= 0 {
		limit = 5
	}
	rows, err := a.db.QueryContext(ctx,
		`SELECT id, analysis_type, summary, model, created_at::text FROM cloud_event_analysis ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, at, summary, model, createdAt string
		if err := rows.Scan(&id, &at, &summary, &model, &createdAt); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"id": id, "analysis_type": at, "summary": summary, "model": model, "created_at": createdAt,
		})
	}
	return results
}

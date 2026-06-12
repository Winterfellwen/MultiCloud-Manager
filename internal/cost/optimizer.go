package cost

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

type Optimizer struct {
	db *sql.DB
}

func NewOptimizer(db *sql.DB) *Optimizer {
	return &Optimizer{db: db}
}

type OptimizationRule struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	Enabled         bool            `json:"enabled"`
	RequiresConfirm bool            `json:"requires_confirm"`
	Condition       json.RawMessage `json:"condition"`
	Action          json.RawMessage `json:"action"`
	CreatedBy       string          `json:"created_by"`
	LastTriggeredAt *time.Time      `json:"last_triggered_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type Suggestion struct {
	ID              string     `json:"id"`
	ResourceCacheID string     `json:"resource_cache_id"`
	SuggestionType  string     `json:"suggestion_type"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	EstimatedSavings float64   `json:"estimated_savings"`
	Currency        string     `json:"currency"`
	Confidence      string     `json:"confidence"`
	Status          string     `json:"status"`
	Source          string     `json:"source"`
	ConfirmedBy     string     `json:"confirmed_by,omitempty"`
	ConfirmedAt     *time.Time `json:"confirmed_at,omitempty"`
	ExecutionResult string     `json:"execution_result,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

func (o *Optimizer) Evaluate(ctx context.Context) error {
	rows, err := o.db.QueryContext(ctx, `
		SELECT id, name, description, enabled, requires_confirm, condition, action,
			COALESCE(created_by::text, ''), last_triggered_at, created_at, updated_at
		FROM cost_optimization_rules WHERE enabled = true`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var rule OptimizationRule
		var lastTriggered sql.NullTime
		if err := rows.Scan(&rule.ID, &rule.Name, &rule.Description, &rule.Enabled,
			&rule.RequiresConfirm, &rule.Condition, &rule.Action, &rule.CreatedBy,
			&lastTriggered, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			log.Printf("cost: scan rule error: %v", err)
			continue
		}
		if lastTriggered.Valid {
			rule.LastTriggeredAt = &lastTriggered.Time
		}
		o.evaluateRule(ctx, &rule)
	}
	return nil
}

func (o *Optimizer) evaluateRule(ctx context.Context, rule *OptimizationRule) {
	// Check condition against current cost_data
	// For simplicity, insert a suggestion based on the rule
	var cond map[string]interface{}
	if err := json.Unmarshal(rule.Condition, &cond); err != nil {
		return
	}

	threshold, _ := cond["spend_threshold"].(float64)
	if threshold <= 0 {
		threshold = 100
	}

	var total float64
	if err := o.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount), 0) FROM cost_data`).Scan(&total); err != nil {
		return
	}

	if total <= threshold {
		return
	}

	actionDesc := "optimize"
	if act, ok := cond["action"].(string); ok {
		actionDesc = act
	}

	title := fmt.Sprintf("Rule '%s' triggered: spend $%.2f exceeds threshold $%.2f", rule.Name, total, threshold)
	_, err := o.db.ExecContext(ctx, `
		INSERT INTO cost_optimization_suggestions (suggestion_type, title, description,
			estimated_savings, currency, confidence, source)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		"rule_triggered", title, fmt.Sprintf("Action: %s. Total spend: $%.2f", actionDesc, total),
		total*0.1, "USD", "medium", "ai")
	if err != nil {
		log.Printf("cost: insert suggestion error: %v", err)
	}
}

func (o *Optimizer) ListSuggestions(ctx context.Context, status string) ([]Suggestion, error) {
	query := `SELECT id, COALESCE(resource_cache_id::text, ''), suggestion_type, title,
		COALESCE(description, ''), estimated_savings, currency, confidence, status, source,
		COALESCE(confirmed_by::text, ''), confirmed_at, COALESCE(execution_result, ''), created_at
		FROM cost_optimization_suggestions`
	args := []interface{}{}
	if status != "" {
		query += " WHERE status = $1"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC"

	rows, err := o.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Suggestion
	for rows.Next() {
		var s Suggestion
		if err := rows.Scan(&s.ID, &s.ResourceCacheID, &s.SuggestionType, &s.Title,
			&s.Description, &s.EstimatedSavings, &s.Currency, &s.Confidence, &s.Status,
			&s.Source, &s.ConfirmedBy, &s.ConfirmedAt, &s.ExecutionResult, &s.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, nil
}

func (o *Optimizer) UpdateSuggestionStatus(ctx context.Context, id, status string) error {
	_, err := o.db.ExecContext(ctx,
		`UPDATE cost_optimization_suggestions SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (o *Optimizer) ApplySuggestion(ctx context.Context, id, confirmedBy string) error {
	_, err := o.db.ExecContext(ctx, `
		UPDATE cost_optimization_suggestions
		SET status = 'applied', confirmed_by = $1::uuid, confirmed_at = NOW()
		WHERE id = $2`, confirmedBy, id)
	return err
}

func (o *Optimizer) ListRules(ctx context.Context) ([]OptimizationRule, error) {
	rows, err := o.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(description, ''), enabled, requires_confirm, condition, action,
			COALESCE(created_by::text, ''), last_triggered_at, created_at, updated_at
		FROM cost_optimization_rules ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []OptimizationRule
	for rows.Next() {
		var rule OptimizationRule
		var lastTriggered sql.NullTime
		if err := rows.Scan(&rule.ID, &rule.Name, &rule.Description, &rule.Enabled,
			&rule.RequiresConfirm, &rule.Condition, &rule.Action, &rule.CreatedBy,
			&lastTriggered, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return nil, err
		}
		if lastTriggered.Valid {
			rule.LastTriggeredAt = &lastTriggered.Time
		}
		result = append(result, rule)
	}
	return result, nil
}

func (o *Optimizer) CreateRule(ctx context.Context, name, description string, enabled, requiresConfirm bool, condition, action json.RawMessage, createdBy string) (*OptimizationRule, error) {
	var id string
	err := o.db.QueryRowContext(ctx, `
		INSERT INTO cost_optimization_rules (name, description, enabled, requires_confirm, condition, action, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
		RETURNING id`,
		name, description, enabled, requiresConfirm, condition, action, createdBy).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &OptimizationRule{
		ID:              id,
		Name:            name,
		Description:     description,
		Enabled:         enabled,
		RequiresConfirm: requiresConfirm,
		Condition:       condition,
		Action:          action,
		CreatedBy:       createdBy,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}, nil
}

func (o *Optimizer) UpdateRule(ctx context.Context, id string, updates map[string]interface{}) error {
	// Build dynamic SET clause
	setClause := ""
	args := []interface{}{id}
	i := 2
	for k, v := range updates {
		if setClause != "" {
			setClause += ", "
		}
		setClause += fmt.Sprintf("%s = $%d", k, i)
		args = append(args, v)
		i++
	}
	if setClause == "" {
		return nil
	}

	_, err := o.db.ExecContext(ctx,
		fmt.Sprintf(`UPDATE cost_optimization_rules SET %s, updated_at = NOW() WHERE id = $1`, setClause), args...)
	return err
}

func (o *Optimizer) DeleteRule(ctx context.Context, id string) error {
	_, err := o.db.ExecContext(ctx, `DELETE FROM cost_optimization_rules WHERE id = $1`, id)
	return err
}

func (o *Optimizer) ToggleRule(ctx context.Context, id string) error {
	_, err := o.db.ExecContext(ctx, `
		UPDATE cost_optimization_rules
		SET enabled = NOT enabled, updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

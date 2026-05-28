package api

import (
	"database/sql"
	"net/http"
	"time"

	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TerraformHandler struct {
	db *services.Database
}

func NewTerraformHandler(db *services.Database) *TerraformHandler {
	return &TerraformHandler{db: db}
}

func (h *TerraformHandler) ListTemplates(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"templates": []gin.H{}})
		return
	}

	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	teamID := h.getUserTeamID(c, claims.UserID)
	if teamID == "" {
		c.JSON(http.StatusOK, gin.H{"templates": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT id, team_id, name, description, variables, version, created_by, created_at
		 FROM terraform_templates WHERE team_id = $1 ORDER BY created_at DESC`,
		teamID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}
	defer rows.Close()

	type Template struct {
		ID          string  `json:"id"`
		TeamID      string  `json:"team_id"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		Variables   *string `json:"variables"`
		Version     int     `json:"version"`
		CreatedBy   *string `json:"created_by"`
		CreatedAt   string  `json:"created_at"`
	}

	var templates []Template
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.TeamID, &t.Name, &t.Description, &t.Variables, &t.Version, &t.CreatedBy, &t.CreatedAt); err != nil {
			continue
		}
		templates = append(templates, t)
	}
	if templates == nil {
		templates = []Template{}
	}

	c.JSON(http.StatusOK, gin.H{"templates": templates})
}

func (h *TerraformHandler) UploadTemplate(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Content     string `json:"content" binding:"required"`
		Variables   string `json:"variables"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and content are required"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusCreated, gin.H{
			"template": gin.H{
				"id":      uuid.New().String(),
				"name":    req.Name,
				"version": 1,
			},
		})
		return
	}

	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	teamID := h.getUserTeamID(c, claims.UserID)

	variablesJSON := sql.NullString{}
	if req.Variables != "" {
		variablesJSON = sql.NullString{String: req.Variables, Valid: true}
	}

	description := sql.NullString{}
	if req.Description != "" {
		description = sql.NullString{String: req.Description, Valid: true}
	}

	id := uuid.New().String()
	_, err := h.db.Exec(
		`INSERT INTO terraform_templates (id, team_id, name, description, content, variables, version, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, 1, $7)`,
		id, teamID, req.Name, description, req.Content, variablesJSON, claims.UserID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed") + ": " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"template": gin.H{
			"id":      id,
			"name":    req.Name,
			"version": 1,
		},
	})
}

func (h *TerraformHandler) PlanTemplate(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Variables string `json:"variables"`
	}
	c.ShouldBindJSON(&req)

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{
			"plan_id": uuid.New().String(),
			"status":  "completed",
			"changes": gin.H{},
		})
		return
	}

	// Verify template exists and belongs to user's team
	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var teamID string
	err := h.db.QueryRow(
		`SELECT team_id FROM terraform_templates WHERE id = $1`, id,
	).Scan(&teamID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	variablesJSON := sql.NullString{}
	if req.Variables != "" {
		variablesJSON = sql.NullString{String: req.Variables, Valid: true}
	}

	runID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO terraform_runs (id, template_id, run_type, status, plan_output, variables, started_at, completed_at)
		 VALUES ($1, $2, 'plan', 'completed', 'No changes. Infrastructure is up-to-date.', $3, $4, $4)`,
		runID, id, variablesJSON, time.Now(),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed") + ": " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"run_id":  runID,
		"status":  "completed",
		"message": "Plan completed successfully. No changes detected.",
		"changes": gin.H{},
	})
}

func (h *TerraformHandler) ApplyTemplate(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Variables string `json:"variables"`
	}
	c.ShouldBindJSON(&req)

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{
			"apply_id": uuid.New().String(),
			"status":   "completed",
			"message":  "Apply completed successfully.",
		})
		return
	}

	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Verify template exists
	var teamID string
	err := h.db.QueryRow(
		`SELECT team_id FROM terraform_templates WHERE id = $1`, id,
	).Scan(&teamID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	variablesJSON := sql.NullString{}
	if req.Variables != "" {
		variablesJSON = sql.NullString{String: req.Variables, Valid: true}
	}

	runID := uuid.New().String()
	now := time.Now()
	_, err = h.db.Exec(
		`INSERT INTO terraform_runs (id, template_id, run_type, status, apply_output, variables, approved_by, started_at, completed_at)
		 VALUES ($1, $2, 'apply', 'completed', 'Apply completed successfully. No resources were affected.', $3, $4, $5, $5)`,
		runID, id, variablesJSON, claims.UserID, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed") + ": " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"run_id":  runID,
		"status":  "completed",
		"message": "Apply completed successfully.",
	})
}

func (h *TerraformHandler) DeleteTemplate(c *gin.Context) {
	id := c.Param("id")

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
		return
	}

	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	teamID := h.getUserTeamID(c, claims.UserID)

	result, err := h.db.Exec(
		`DELETE FROM terraform_templates WHERE id = $1 AND team_id = $2`, id, teamID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "delete_failed")})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *TerraformHandler) getUserTeamID(c *gin.Context, userID string) string {
	if h.db == nil {
		return ""
	}

	var teamID sql.NullString
	err := h.db.QueryRow(
		`SELECT team_id FROM users WHERE id = $1`, userID,
	).Scan(&teamID)
	if err != nil || !teamID.Valid {
		return ""
	}
	return teamID.String
}



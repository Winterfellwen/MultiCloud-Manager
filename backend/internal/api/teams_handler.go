package api

import (
	"database/sql"
	"net/http"

	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TeamsHandler struct {
	db *services.Database
}

func NewTeamsHandler(db *services.Database) *TeamsHandler {
	return &TeamsHandler{db: db}
}

// GET /api/teams
func (h *TeamsHandler) ListTeams(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"teams": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT id, name, description, created_by, created_at, updated_at FROM teams ORDER BY created_at DESC`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}
	defer rows.Close()

	type TeamItem struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		CreatedBy   *string `json:"created_by"`
		CreatedAt   string  `json:"created_at"`
		UpdatedAt   string  `json:"updated_at"`
	}

	var teams []TeamItem
	for rows.Next() {
		var t TeamItem
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			continue
		}
		teams = append(teams, t)
	}
	if teams == nil {
		teams = []TeamItem{}
	}

	c.JSON(http.StatusOK, gin.H{"teams": teams})
}

// POST /api/teams (admin only)
func (h *TeamsHandler) CreateTeam(c *gin.Context) {
	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusCreated, gin.H{"team": gin.H{
			"id":         uuid.New().String(),
			"name":       req.Name,
			"description": req.Description,
			"created_by": claims.UserID,
		}})
		return
	}

	id := uuid.New().String()
	_, err := h.db.Exec(
		`INSERT INTO teams (id, name, description, created_by) VALUES ($1, $2, $3, $4)`,
		id, req.Name, req.Description, claims.UserID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"team": gin.H{
		"id":         id,
		"name":       req.Name,
		"description": req.Description,
		"created_by": claims.UserID,
	}})
}

// POST /api/teams/:id/members (admin only)
func (h *TeamsHandler) AddTeamMember(c *gin.Context) {
	teamID := c.Param("id")

	var req struct {
		UserID string `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "member added"})
		return
	}

	// Verify team exists
	var exists bool
	err := h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM teams WHERE id = $1)`, teamID).Scan(&exists)
	if err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}

	// Verify user exists
	err = h.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, req.UserID).Scan(&exists)
	if err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Add user to team by setting their team_id
	_, err = h.db.Exec(`UPDATE users SET team_id = $1 WHERE id = $2`, teamID, req.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "member added"})
}

// GET /api/teams/:id
func (h *TeamsHandler) GetTeam(c *gin.Context) {
	teamID := c.Param("id")

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"team": gin.H{}})
		return
	}

	var id, name, createdAt, updatedAt string
	var description, createdBy *string
	err := h.db.QueryRow(
		`SELECT id, name, description, created_by, created_at, updated_at FROM teams WHERE id = $1`,
		teamID,
	).Scan(&id, &name, &description, &createdBy, &createdAt, &updatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"team": gin.H{
		"id":          id,
		"name":        name,
		"description": description,
		"created_by":  createdBy,
		"created_at":  createdAt,
		"updated_at":  updatedAt,
	}})
}

// PUT /api/teams/:id (admin only)
func (h *TeamsHandler) UpdateTeam(c *gin.Context) {
	teamID := c.Param("id")

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid params"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "team updated"})
		return
	}

	if req.Name != "" {
		_, err := h.db.Exec(`UPDATE teams SET name = $1 WHERE id = $2`, req.Name, teamID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
			return
		}
	}

	if req.Description != "" {
		_, err := h.db.Exec(`UPDATE teams SET description = $1 WHERE id = $2`, req.Description, teamID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "team updated"})
}

// DELETE /api/teams/:id (admin only)
func (h *TeamsHandler) DeleteTeam(c *gin.Context) {
	teamID := c.Param("id")

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "team deleted"})
		return
	}

	// Remove team_id from users before deleting
	_, _ = h.db.Exec(`UPDATE users SET team_id = NULL WHERE team_id = $1`, teamID)

	_, err := h.db.Exec(`DELETE FROM teams WHERE id = $1`, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "delete_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "team deleted"})
}

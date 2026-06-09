package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type TeamsHandler struct {
	db *sql.DB
}

func NewTeamsHandler(db *sql.DB) *TeamsHandler {
	return &TeamsHandler{db: db}
}

// GetTeams 获取团队概览（成员列表 + 统计）
func (h *TeamsHandler) GetTeams(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, email, role, status, COALESCE(invited_by,''), created_at, updated_at FROM team_members ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var members []map[string]interface{}
	for rows.Next() {
		var id, name, email, role, status, invitedBy string
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&id, &name, &email, &role, &status, &invitedBy, &createdAt, &updatedAt); err != nil {
			continue
		}
		m := map[string]interface{}{
			"id":         id,
			"name":       name,
			"email":      email,
			"role":       role,
			"status":     status,
			"invited_by": invitedBy,
		}
		if createdAt.Valid {
			m["created_at"] = createdAt.Time
		}
		if updatedAt.Valid {
			m["updated_at"] = updatedAt.Time
		}
		members = append(members, m)
	}
	if members == nil {
		members = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"teams": []map[string]interface{}{
			{"id": "default", "name": "Default Team"},
		},
		"members": members,
		"total":   len(members),
	})
}

// GetTeamMembers 获取指定团队的成员列表
func (h *TeamsHandler) GetTeamMembers(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, email, role, status, COALESCE(invited_by,''), created_at, updated_at FROM team_members ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var members []map[string]interface{}
	for rows.Next() {
		var id, name, email, role, status, invitedBy string
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&id, &name, &email, &role, &status, &invitedBy, &createdAt, &updatedAt); err != nil {
			continue
		}
		m := map[string]interface{}{
			"id":         id,
			"name":       name,
			"email":      email,
			"role":       role,
			"status":     status,
			"invited_by": invitedBy,
		}
		if createdAt.Valid {
			m["created_at"] = createdAt.Time
		}
		members = append(members, m)
	}
	if members == nil {
		members = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{"members": members})
}

// AddTeamMember 添加团队成员
func (h *TeamsHandler) AddTeamMember(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要字段"})
		return
	}
	if req.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱不能为空"})
		return
	}
	// Derive name from email if not provided
	if req.Name == "" {
		req.Name = req.Email
	}
	if req.Role == "" {
		req.Role = "member"
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO team_members (name, email, role, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
		req.Name, req.Email, req.Role,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "成员已存在或数据无效: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "成员已添加",
		"member": gin.H{
			"id":     id,
			"name":   req.Name,
			"email":  req.Email,
			"role":   req.Role,
			"status": "active",
		},
	})
}

// UpdateTeamMember 更新团队成员信息
func (h *TeamsHandler) UpdateTeamMember(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少成员ID"})
		return
	}

	var req struct {
		Name   string `json:"name"`
		Email  string `json:"email"`
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	result, err := h.db.Exec(
		`UPDATE team_members SET name = COALESCE(NULLIF($1,''), name), email = COALESCE(NULLIF($2,''), email), role = COALESCE(NULLIF($3,''), role), status = COALESCE(NULLIF($4,''), status), updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
		req.Name, req.Email, req.Role, req.Status, memberID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "成员不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "成员已更新"})
}

// RemoveTeamMember 删除团队成员
func (h *TeamsHandler) RemoveTeamMember(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	memberID := c.Param("id")
	if memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少成员ID"})
		return
	}

	result, err := h.db.Exec(`DELETE FROM team_members WHERE id = $1`, memberID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "成员不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "成员已移除"})
}

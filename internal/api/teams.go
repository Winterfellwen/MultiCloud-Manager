package api

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type TeamsHandler struct {
	db *sql.DB
}

func NewTeamsHandler(db *sql.DB) *TeamsHandler {
	return &TeamsHandler{db: db}
}

// GetTeams 获取团队概览（成员列表 + 统计）
func (h *TeamsHandler) GetTeams(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, email, role, status, COALESCE(invited_by,''), COALESCE(user_id::text,''), created_at, updated_at FROM team_members ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var members []map[string]interface{}
	for rows.Next() {
		var id, name, email, role, status, invitedBy, userID string
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&id, &name, &email, &role, &status, &invitedBy, &userID, &createdAt, &updatedAt); err != nil {
			continue
		}
		m := map[string]interface{}{
			"id":         id,
			"name":       name,
			"email":      email,
			"role":       role,
			"status":     status,
			"invited_by": invitedBy,
			"has_account": userID != "",
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
	rows, err := h.db.Query(`SELECT id, name, email, role, status, COALESCE(invited_by,''), COALESCE(user_id::text,''), created_at, updated_at FROM team_members ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var members []map[string]interface{}
	for rows.Next() {
		var id, name, email, role, status, invitedBy, userID string
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&id, &name, &email, &role, &status, &invitedBy, &userID, &createdAt, &updatedAt); err != nil {
			continue
		}
		m := map[string]interface{}{
			"id":         id,
			"name":       name,
			"email":      email,
			"role":       role,
			"status":     status,
			"invited_by": invitedBy,
			"has_account": userID != "",
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

// AddTeamMember 添加团队成员 — 同时创建可登录的用户账号
func (h *TeamsHandler) AddTeamMember(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}
	if req.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱不能为空"})
		return
	}
	if req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码不能为空"})
		return
	}
	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码长度至少6位"})
		return
	}
	if req.Name == "" {
		req.Name = req.Email
	}
	if req.Role == "" {
		req.Role = "user"
	}
	// Validate role
	validRoles := map[string]bool{"admin": true, "user": true, "viewer": true}
	if !validRoles[req.Role] {
		req.Role = "user"
	}

	// Hash password
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	// Use transaction to create both user + team_member atomically
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	// Create user account (username = email)
	var userID string
	err = tx.QueryRow(
		`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
		req.Email, string(hashBytes), req.Role,
	).Scan(&userID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户已存在或数据无效: " + err.Error()})
		return
	}

	// Create team member linked to user
	var memberID string
	err = tx.QueryRow(
		`INSERT INTO team_members (name, email, role, status, user_id) VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
		req.Name, req.Email, req.Role, userID,
	).Scan(&memberID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "成员添加失败: " + err.Error()})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Team member added: %s (%s), user_id=%s", req.Name, req.Email, userID)
	c.JSON(http.StatusOK, gin.H{
		"message": "成员已添加并创建登录账号",
		"member": gin.H{
			"id":      memberID,
			"name":    req.Name,
			"email":   req.Email,
			"role":    req.Role,
			"status":  "active",
			"has_account": true,
		},
	})
}

// UpdateTeamMember 更新团队成员信息 — 同步角色到 users 表
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

	// Sync role to users table (so JWT picks up the change on next login)
	if req.Role != "" {
		var userID sql.NullString
		h.db.QueryRow(`SELECT user_id FROM team_members WHERE id = $1`, memberID).Scan(&userID)
		if userID.Valid {
			h.db.Exec(`UPDATE users SET role = $1 WHERE id = $2`, req.Role, userID.String)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "成员已更新"})
}

// ResetPassword 重置团队成员密码
func (h *TeamsHandler) ResetPassword(c *gin.Context) {
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
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码不能为空"})
		return
	}
	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码长度至少6位"})
		return
	}

	// Find the linked user_id
	var userID sql.NullString
	var email string
	err := h.db.QueryRow(`SELECT user_id, email FROM team_members WHERE id = $1`, memberID).Scan(&userID, &email)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "成员不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	if userID.Valid {
		// Update existing user's password
		_, err = h.db.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, string(hashBytes), userID.String)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// Legacy member without user account — create one now
		var newUserID string
		err = h.db.QueryRow(
			`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'member') RETURNING id`,
			email, string(hashBytes),
		).Scan(&newUserID)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "创建用户账号失败: " + err.Error()})
			return
		}
		// Link team_member to new user
		h.db.Exec(`UPDATE team_members SET user_id = $1 WHERE id = $2`, newUserID, memberID)
	}

	log.Printf("Password reset for member %s (%s)", memberID, email)
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
}

// RemoveTeamMember 删除团队成员 — 同时删除关联的用户账号
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

	// Find linked user_id before deleting
	var userID sql.NullString
	err := h.db.QueryRow(`SELECT user_id FROM team_members WHERE id = $1`, memberID).Scan(&userID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "成员不存在"})
		return
	}

	// Delete team_member first (has FK to users)
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

	// Also delete the linked user account
	if userID.Valid {
		_, err = h.db.Exec(`DELETE FROM users WHERE id = $1`, userID.String)
		if err != nil {
			log.Printf("Warning: failed to delete user %s: %v", userID.String, err)
		} else {
			log.Printf("Deleted user account %s for removed team member %s", userID.String, memberID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "成员已移除"})
}

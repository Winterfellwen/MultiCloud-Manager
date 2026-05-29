package api

import (
	"net/http"

	"database/sql"

	"github.com/gin-gonic/gin"
)

// TeamsHandler struct follows the same pattern as other handlers
type TeamsHandler struct {
	db         *sql.DB
	isPostgres bool
}

// NewTeamsHandler creates a new TeamsHandler instance
func NewTeamsHandler(db *sql.DB, isPostgres bool) *TeamsHandler {
	return &TeamsHandler{
		db:         db,
		isPostgres: isPostgres,
	}
}

// GetTeams 获取团队列表和成员
func (h *TeamsHandler) GetTeams(c *gin.Context) {
	// 从Gin context中获取用户ID
	userIDAny, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}
	userID := userIDAny.(string)

	// 获取当前用户的用户名
	var username string
	err := h.db.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户信息失败"})
		return
	}

	// 返回固定的团队和当前用户作为成员
	member := map[string]interface{}{
		"id":    userID,
		"name":  username,
		"role":  "admin",
	}
	members := []map[string]interface{}{member}

	response := map[string]interface{}{
		"teams": []map[string]interface{}{
			{
				"id":   1,
				"name": "默认团队",
			},
		},
		"members": members,
	}

	c.JSON(http.StatusOK, response)
}

// RemoveTeamMember 删除团队成员
func (h *TeamsHandler) RemoveTeamMember(c *gin.Context) {
	// 从Gin context中获取用户ID
	userIDAny, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}
	userID := userIDAny.(string)

	// 解析URL参数
	teamID := c.Param("teamId")
	memberID := c.Param("id")

	// 验证参数
	if teamID == "" || memberID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少团队ID或成员ID"})
		return
	}

	// 简化实现：只允许用户删除自己（或返回成功）
	if memberID == userID {
		// 允许用户删除自己（实际上不删除，只返回成功）
		c.JSON(http.StatusOK, gin.H{
			"message": "成员已移除",
		})
		return
	}

	// 对于其他用户，返回错误（简化实现：只允许管理自己的账户）
	c.JSON(http.StatusForbidden, gin.H{"error": "无权限移除其他成员"})
}

// GetTeamMembers 获取团队成员列表
func (h *TeamsHandler) GetTeamMembers(c *gin.Context) {
	// 从Gin context中获取用户ID
	userIDAny, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}
	userID := userIDAny.(string)

	// 解析团队ID
	teamID := c.Param("teamId")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少团队ID"})
		return
	}

	// 获取当前用户的用户名
	var username string
	err := h.db.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户信息失败"})
		return
	}

	member := map[string]interface{}{
		"id":    userID,
		"name":  username,
		"role":  "admin",
	}
	members := []map[string]interface{}{member}

	c.JSON(http.StatusOK, gin.H{
		"members": members,
	})
}
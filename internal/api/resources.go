package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"multicloud/internal/cloud"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type ResourcesHandler struct {
	syncer *cloud.Syncer
	db     *sql.DB
}

func NewResourcesHandler(syncer *cloud.Syncer, db *sql.DB) *ResourcesHandler {
	return &ResourcesHandler{syncer: syncer, db: db}
}

func (h *ResourcesHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	lastSync := h.syncer.GetLastSync()
	resp := map[string]interface{}{
		"resources": resources,
	}
	if !lastSync.IsZero() {
		resp["last_sync"] = lastSync.Format(time.RFC3339)
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ResourcesHandler) Sync(c *gin.Context) {
	ctx := c.Request.Context()
	
	var req struct {
		AccountID string `json:"account_id"`
	}
	c.ShouldBindJSON(&req)
	
	var syncResults []cloud.SyncResult
	var syncErr error
	
	if req.AccountID != "" {
		err := h.syncer.SyncAccountByID(ctx, req.AccountID)
		if err != nil {
			syncErr = err
		}
	} else {
		syncResults, syncErr = h.syncer.SyncAll(ctx)
	}
	
	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	lastSync := h.syncer.GetLastSync()
	resp := map[string]interface{}{
		"resources": resources,
	}
	if !lastSync.IsZero() {
		resp["last_sync"] = lastSync.Format(time.RFC3339)
	}
	if len(syncResults) > 0 {
		resp["sync_results"] = syncResults
	}
	if syncErr != nil {
		// Partial failure - still return 200 but include error info
		resp["warning"] = syncErr.Error()
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ResourcesHandler) Action(c *gin.Context) {
	id := c.Param("id")
	action := c.Param("action")
	ctx := c.Request.Context()

	prov, cloudResID, err := h.syncer.GetProviderForResource(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var opErr error
	switch action {
	case "start":
		opErr = prov.StartInstance(ctx, cloudResID)
	case "stop":
		opErr = prov.StopInstance(ctx, cloudResID)
	case "restart":
		opErr = prov.RestartInstance(ctx, cloudResID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported action: " + action})
		return
	}

	if opErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": opErr.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ResourcesHandler) Stats(c *gin.Context) {
	var resourceCount, accountCount, terraformCount, teamCount int
	h.db.QueryRow("SELECT COUNT(*) FROM resources_cache").Scan(&resourceCount)
	h.db.QueryRow("SELECT COUNT(*) FROM cloud_accounts").Scan(&accountCount)
	h.db.QueryRow("SELECT COUNT(*) FROM terraform_templates").Scan(&terraformCount)
	h.db.QueryRow("SELECT COUNT(*) FROM team_members").Scan(&teamCount)

	c.JSON(http.StatusOK, gin.H{
		"stats": map[string]interface{}{
			"resources":  resourceCount,
			"accounts":   accountCount,
			"terraform":  terraformCount,
			"members":    teamCount,
		},
	})
}

type PasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func (h *ResourcesHandler) ChangePassword(c *gin.Context) {
	var req PasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, _ := c.Get("user_id")
	username, _ := userID.(string)
	if username == "" {
		username = "admin"
	}

	var passwordHash string
	h.db.QueryRow("SELECT password_hash FROM users WHERE username = $1", username).Scan(&passwordHash)
	if passwordHash == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "旧密码错误"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	_, err = h.db.Exec("UPDATE users SET password_hash = $1 WHERE username = $2", string(hash), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ResourcesHandler) SyncLogs(c *gin.Context) {
	ctx := c.Request.Context()
	accountID := c.Query("account_id")
	
	query := `SELECT id, account_id, cloud_type, status, message, resource_count, created_at 
		FROM sync_logs WHERE 1=1`
	args := []interface{}{}
	argIdx := 1
	
	if accountID != "" {
		query += fmt.Sprintf(" AND account_id = $%d", argIdx)
		args = append(args, accountID)
		argIdx++
	}
	
	query += " ORDER BY created_at DESC LIMIT 100"
	
	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	
	var logs []map[string]interface{}
	for rows.Next() {
		var id int64
		var accID, cloudType, status, message string
		var resourceCount int
		var createdAt time.Time
		if err := rows.Scan(&id, &accID, &cloudType, &status, &message, &resourceCount, &createdAt); err != nil {
			continue
		}
		logs = append(logs, map[string]interface{}{
			"id":             id,
			"account_id":     accID,
			"cloud_type":     cloudType,
			"status":         status,
			"message":        message,
			"resource_count": resourceCount,
			"created_at":     createdAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

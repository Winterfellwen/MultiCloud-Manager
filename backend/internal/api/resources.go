package api

import (
	"database/sql"
	"net/http"
	"time"

	"multicloud/internal/cloud"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type ResourcesHandler struct {
	syncer     *cloud.Syncer
	db         *sql.DB
	isPostgres bool
}

func NewResourcesHandler(syncer *cloud.Syncer, db *sql.DB, isPostgres bool) *ResourcesHandler {
	return &ResourcesHandler{syncer: syncer, db: db, isPostgres: isPostgres}
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
	if err := h.syncer.SyncAll(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
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
	var resourceCount, accountCount int
	h.db.QueryRow("SELECT COUNT(*) FROM resources_cache").Scan(&resourceCount)
	h.db.QueryRow("SELECT COUNT(*) FROM cloud_accounts").Scan(&accountCount)

	c.JSON(http.StatusOK, gin.H{
		"stats": map[string]interface{}{
			"resources": resourceCount,
			"accounts":  accountCount,
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
	if h.isPostgres {
		h.db.QueryRow("SELECT password_hash FROM users WHERE username = $1", username).Scan(&passwordHash)
	} else {
		h.db.QueryRow("SELECT password_hash FROM users WHERE username = ?", username).Scan(&passwordHash)
	}
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

	if h.isPostgres {
		_, err = h.db.Exec("UPDATE users SET password_hash = $1 WHERE username = $2", string(hash), username)
	} else {
		_, err = h.db.Exec("UPDATE users SET password_hash = ? WHERE username = ?", string(hash), username)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

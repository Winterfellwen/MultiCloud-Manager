package api

import (
	"database/sql"
	"net/http"

	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AccountsHandler struct {
	db *services.Database
}

func NewAccountsHandler(db *services.Database) *AccountsHandler {
	return &AccountsHandler{db: db}
}

func (h *AccountsHandler) List(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"accounts": []gin.H{}})
		return
	}

	rows, err := h.db.Query(`SELECT id, team_id, cloud_type, name, is_active, last_sync_at, created_at FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询账户失败"})
		return
	}
	defer rows.Close()

	type Account struct {
		ID         string  `json:"id"`
		TeamID     string  `json:"team_id"`
		CloudType  string  `json:"cloud_type"`
		Name       string  `json:"name"`
		IsActive   bool    `json:"is_active"`
		LastSyncAt *string `json:"last_sync_at"`
		CreatedAt  string  `json:"created_at"`
	}

	var accounts []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.TeamID, &a.CloudType, &a.Name, &a.IsActive, &a.LastSyncAt, &a.CreatedAt); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}
	if accounts == nil {
		accounts = []Account{}
	}

	c.JSON(http.StatusOK, gin.H{"accounts": accounts})
}

func (h *AccountsHandler) Add(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		CloudType   string `json:"cloud_type" binding:"required"`
		Credentials string `json:"credentials" binding:"required"`
		KeyID       string `json:"key_id"`
		TeamID      string `json:"team_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要参数"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{
			"account": gin.H{
				"id":           uuid.New().String(),
				"name":         req.Name,
				"cloud_type":   req.CloudType,
				"is_active":    true,
				"last_sync_at": nil,
			},
		})
		return
	}

	teamID := req.TeamID
	if teamID == "" {
		teamID = "00000000-0000-0000-0000-000000000000"
	}

	// Store credentials as is (will be encrypted in production)
	encryptedCreds := req.Credentials

	id := uuid.New().String()
	_, err := h.db.Exec(
		`INSERT INTO cloud_accounts (id, team_id, cloud_type, name, encrypted_credentials, is_active)
		 VALUES ($1, $2, $3, $4, $5, true)`,
		id, teamID, req.CloudType, req.Name, encryptedCreds,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建账户失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"account": gin.H{
			"id":         id,
			"name":       req.Name,
			"cloud_type": req.CloudType,
			"is_active":  true,
		},
	})
}

func (h *AccountsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "updated"})
		return
	}

	var req struct {
		Name   string `json:"name"`
		Active *bool  `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.Name != "" {
		h.db.Exec(`UPDATE cloud_accounts SET name=$1 WHERE id=$2`, req.Name, id)
	}
	if req.Active != nil {
		h.db.Exec(`UPDATE cloud_accounts SET is_active=$1 WHERE id=$2`, *req.Active, id)
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *AccountsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
		return
	}

	_, err := h.db.Exec(`DELETE FROM cloud_accounts WHERE id=$1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *AccountsHandler) Sync(c *gin.Context) {
	id := c.Param("id")
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "synced"})
		return
	}

	h.db.Exec(`UPDATE cloud_accounts SET last_sync_at=CURRENT_TIMESTAMP WHERE id=$1`, id)
	c.JSON(http.StatusOK, gin.H{"message": "synced", "synced_at": sql.NullString{}})
}
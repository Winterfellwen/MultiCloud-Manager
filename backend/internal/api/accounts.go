package api

import (
	"context"
	"net/http"
	"time"

	"multicloud-manager/internal/cloud"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AccountsHandler struct {
	db      *services.Database
	syncer  *cloud.Syncer
}

func NewAccountsHandler(db *services.Database, syncer *cloud.Syncer) *AccountsHandler {
	return &AccountsHandler{db: db, syncer: syncer}
}

func (h *AccountsHandler) List(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"accounts": []gin.H{}})
		return
	}

	rows, err := h.db.Query(`SELECT id, team_id, cloud_type, name, is_active, last_sync_at, created_at FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "missing_params")})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed") + ": " + err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "invalid_params")})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "delete_failed")})
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

	// Get account info
	var cloudType, credJSON string
	err := h.db.QueryRow(`SELECT cloud_type, encrypted_credentials FROM cloud_accounts WHERE id=$1`, id).Scan(&cloudType, &credJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}

	// Try to sync this specific account
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	if h.syncer != nil {
		err = h.syncer.SyncAccount(ctx, id, cloudType, credJSON)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"message": "sync completed with errors",
				"error": err.Error(),
			})
			return
		}
	}

	h.db.Exec(`UPDATE cloud_accounts SET last_sync_at=CURRENT_TIMESTAMP WHERE id=$1`, id)
	c.JSON(http.StatusOK, gin.H{"message": "synced"})
}
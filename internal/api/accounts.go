package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"multicloud/internal/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AccountsHandler struct {
	db    *sql.DB
	vault vault.Service
}

func NewAccountsHandler(db *sql.DB, v vault.Service) *AccountsHandler {
	return &AccountsHandler{db: db, vault: v}
}

func (h *AccountsHandler) List(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, cloud_type, is_active, last_sync_at, vault_path FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var accounts []map[string]interface{}
	for rows.Next() {
		var id, name, cloudType string
		var vaultPath string
		var isActive bool
		var lastSync sql.NullTime
		if err := rows.Scan(&id, &name, &cloudType, &isActive, &lastSync, &vaultPath); err != nil {
			continue
		}
		acc := map[string]interface{}{
			"id":         id,
			"name":       name,
			"cloud_type": cloudType,
			"is_active":  isActive,
			"vault_path": vaultPath,
			"vault_secured": vaultPath != "",
		}
		if lastSync.Valid {
			acc["last_sync_at"] = lastSync.Time.Format("2006-01-02 15:04:05")
		}
		accounts = append(accounts, acc)
	}
	if accounts == nil {
		accounts = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"accounts": accounts})
}

func (h *AccountsHandler) Create(c *gin.Context) {
	var req struct {
		Name        string `json:"name"`
		CloudType   string `json:"cloud_type"`
		Credentials string `json:"credentials"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.CloudType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cloud_type is required"})
		return
	}

	id := uuid.New().String()
	vaultPath := ""

	// Store credentials in vault if vault is available
	if h.vault != nil && req.Credentials != "" {
		vaultPath = fmt.Sprintf("cloud/%s/%s", req.CloudType, id)
		var credData map[string]interface{}
		if err := json.Unmarshal([]byte(req.Credentials), &credData); err != nil {
			// If not valid JSON, store as {"raw": value}
			credData = map[string]interface{}{"raw": req.Credentials}
		}
		if err := h.vault.SetSecret(vaultPath, credData); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store credentials in vault: " + err.Error()})
			return
		}
	}

	// Store account with vault_path (credentials column kept for backward compat)
	_, err := h.db.Exec(`INSERT INTO cloud_accounts (id, name, cloud_type, credentials, vault_path, is_active) VALUES ($1, $2, $3, $4, $5, true)`,
		id, req.Name, req.CloudType, req.Credentials, vaultPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": id, "vault_path": vaultPath})
}

func (h *AccountsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string `json:"name"`
		CloudType   string `json:"cloud_type"`
		Credentials string `json:"credentials"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Get existing vault_path
	var vaultPath string
	h.db.QueryRow(`SELECT COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1`, id).Scan(&vaultPath)

	// Update credentials in vault
	if h.vault != nil && req.Credentials != "" {
		if vaultPath == "" {
			vaultPath = fmt.Sprintf("cloud/%s/%s", req.CloudType, id)
		}
		var credData map[string]interface{}
		if err := json.Unmarshal([]byte(req.Credentials), &credData); err != nil {
			credData = map[string]interface{}{"raw": req.Credentials}
		}
		if err := h.vault.SetSecret(vaultPath, credData); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault: " + err.Error()})
			return
		}
	}

	_, err := h.db.Exec(`UPDATE cloud_accounts SET name = $1, cloud_type = $2, credentials = $3, vault_path = $4 WHERE id = $5`,
		req.Name, req.CloudType, req.Credentials, vaultPath, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AccountsHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Delete from vault if vault_path exists
	if h.vault != nil {
		var vaultPath string
		h.db.QueryRow(`SELECT COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1`, id).Scan(&vaultPath)
		if vaultPath != "" {
			h.vault.DeleteSecret(vaultPath)
		}
	}

	_, err := h.db.Exec(`DELETE FROM cloud_accounts WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

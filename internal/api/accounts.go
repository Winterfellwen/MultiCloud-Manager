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

func (h *AccountsHandler) Get(c *gin.Context) {
	id := c.Param("id")
	var name, cloudType, credentials string
	var vaultPath string
	var isActive bool
	var lastSync sql.NullTime
	err := h.db.QueryRow(`SELECT name, cloud_type, credentials, is_active, last_sync_at, vault_path FROM cloud_accounts WHERE id = $1`, id).
		Scan(&name, &cloudType, &credentials, &isActive, &lastSync, &vaultPath)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Prefer credentials from vault when available — the DB column may have
	// been cleared (legacy / wiped by older versions), but the vault is the
	// source of truth once vault_path is set.
	if vaultPath != "" && h.vault != nil {
		if sec, err := h.vault.GetSecret(vaultPath); err == nil && sec != nil {
			if b, err := json.Marshal(sec); err == nil {
				credentials = string(b)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"id":           id,
		"name":         name,
		"cloud_type":   cloudType,
		"credentials":  credentials,
		"is_active":    isActive,
		"vault_path":   vaultPath,
		"vault_secured": vaultPath != "",
		"_warning":     "credentials are returned in plaintext for this endpoint; restrict via auth",
	})
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

	// Store account with vault_path (credentials stored securely in vault, not in DB)
	_, err := h.db.Exec(`INSERT INTO cloud_accounts (id, name, cloud_type, credentials, vault_path, is_active) VALUES ($1, $2, $3, '', $4, true)`,
		id, req.Name, req.CloudType, vaultPath)
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

	// Get existing row so we can preserve fields the client didn't send.
	var existing struct {
		Name        string
		CloudType   string
		Credentials string
		VaultPath   string
	}
	err := h.db.QueryRow(`SELECT name, cloud_type, COALESCE(credentials, ''), COALESCE(vault_path, '') FROM cloud_accounts WHERE id = $1`, id).
		Scan(&existing.Name, &existing.CloudType, &existing.Credentials, &existing.VaultPath)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.Name == "" {
		req.Name = existing.Name
	}
	if req.CloudType == "" {
		req.CloudType = existing.CloudType
	}
	// Credentials: only overwrite if the client actually sent non-empty content.
	// Empty string means "keep what we have", so a prefilled-then-resubmitted
	// form doesn't wipe stored secrets.
	if req.Credentials == "" {
		req.Credentials = existing.Credentials
	} else {
		// Update credentials in vault
		if h.vault != nil {
			if existing.VaultPath == "" {
				existing.VaultPath = fmt.Sprintf("cloud/%s/%s", req.CloudType, id)
			}
			var credData map[string]interface{}
			if err := json.Unmarshal([]byte(req.Credentials), &credData); err != nil {
				credData = map[string]interface{}{"raw": req.Credentials}
			}
			if err := h.vault.SetSecret(existing.VaultPath, credData); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update vault: " + err.Error()})
				return
			}
		}
	}

	_, err = h.db.Exec(`UPDATE cloud_accounts SET name = $1, cloud_type = $2, credentials = '', vault_path = $3 WHERE id = $4`,
		req.Name, req.CloudType, existing.VaultPath, id)
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

package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AccountsHandler struct {
	db         *sql.DB
	isPostgres bool
}

func NewAccountsHandler(db *sql.DB, isPostgres bool) *AccountsHandler {
	return &AccountsHandler{db: db, isPostgres: isPostgres}
}

func (h *AccountsHandler) List(c *gin.Context) {
	var rows *sql.Rows
	var err error
	if h.isPostgres {
		rows, err = h.db.Query(`SELECT id, name, cloud_type, is_active, last_sync_at FROM cloud_accounts ORDER BY created_at DESC`)
	} else {
		rows, err = h.db.Query(`SELECT id, name, cloud_type, is_active, last_sync_at FROM cloud_accounts ORDER BY created_at DESC`)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var accounts []map[string]interface{}
	for rows.Next() {
		var id, name, cloudType string
		var isActive interface{}
		var lastSync sql.NullTime
		if err := rows.Scan(&id, &name, &cloudType, &isActive, &lastSync); err != nil {
			continue
		}
		active := false
		switch v := isActive.(type) {
		case bool:
			active = v
		case int64:
			active = v == 1
		}
		acc := map[string]interface{}{
			"id":         id,
			"name":       name,
			"cloud_type": cloudType,
			"is_active":  active,
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
	if h.isPostgres {
		_, err := h.db.Exec(`INSERT INTO cloud_accounts (id, name, cloud_type, credentials, is_active) VALUES ($1, $2, $3, $4, true)`,
			id, req.Name, req.CloudType, req.Credentials)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		_, err := h.db.Exec(`INSERT INTO cloud_accounts (id, name, cloud_type, credentials, is_active) VALUES (?, ?, ?, ?, 1)`,
			id, req.Name, req.CloudType, req.Credentials)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"id": id})
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

	if h.isPostgres {
		_, err := h.db.Exec(`UPDATE cloud_accounts SET name = $1, cloud_type = $2, credentials = $3 WHERE id = $4`,
			req.Name, req.CloudType, req.Credentials, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		_, err := h.db.Exec(`UPDATE cloud_accounts SET name = ?, cloud_type = ?, credentials = ? WHERE id = ?`,
			req.Name, req.CloudType, req.Credentials, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AccountsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if h.isPostgres {
		_, err := h.db.Exec(`DELETE FROM cloud_accounts WHERE id = $1`, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		_, err := h.db.Exec(`DELETE FROM cloud_accounts WHERE id = ?`, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

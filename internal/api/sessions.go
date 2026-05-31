package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

type SessionsHandler struct {
	db *sql.DB
}

func NewSessionsHandler(db *sql.DB) *SessionsHandler {
	return &SessionsHandler{db: db}
}

func newSessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *SessionsHandler) List(c *gin.Context) {
	query := `SELECT session_id, title, status, mode, created_at, updated_at 
	         FROM sessions ORDER BY created_at DESC LIMIT 50`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"sessions": []interface{}{}})
		return
	}
	defer rows.Close()

	var sessions []map[string]interface{}
	for rows.Next() {
		var sessionID, title, status, mode string
		var createdAt, updatedAt interface{}
		if err := rows.Scan(&sessionID, &title, &status, &mode, &createdAt, &updatedAt); err != nil {
			continue
		}
		sessions = append(sessions, map[string]interface{}{
			"session_id": sessionID,
			"title":      title,
			"status":     status,
			"mode":       mode,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}

	if sessions == nil {
		sessions = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

func (h *SessionsHandler) loadMessages(sessionInternalID string) []map[string]interface{} {
	// Try new format: single 'history' row with full JSON
	var historyJSON string
	err := h.db.QueryRow(`SELECT content FROM messages WHERE session_id = $1 AND role = 'history' ORDER BY created_at DESC LIMIT 1`, sessionInternalID).Scan(&historyJSON)
	if err == nil && historyJSON != "" {
		var history []map[string]interface{}
		if json.Unmarshal([]byte(historyJSON), &history) == nil && len(history) > 0 {
			return history
		}
	}

	// Fallback: old format (individual user/assistant rows)
	rows, err := h.db.Query(`SELECT role, content, created_at FROM messages WHERE session_id = $1 AND role != 'history' ORDER BY created_at`, sessionInternalID)
	if err != nil {
		return []map[string]interface{}{}
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var role, content string
		var createdAt interface{}
		if err := rows.Scan(&role, &content, &createdAt); err != nil {
			continue
		}
		messages = append(messages, map[string]interface{}{
			"role":       role,
			"content":    content,
			"created_at": createdAt,
		})
	}
	if messages == nil {
		messages = []map[string]interface{}{}
	}
	return messages
}

func (h *SessionsHandler) Get(c *gin.Context) {
	sessionID := c.Param("sid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing session id"})
		return
	}

	var sid, title, status, mode string
	var createdAt, updatedAt interface{}
	var internalID string

	query := `SELECT id, session_id, title, status, mode, created_at, updated_at 
	          FROM sessions WHERE session_id = $1`
	err := h.db.QueryRow(query, sessionID).Scan(&internalID, &sid, &title, &status, &mode, &createdAt, &updatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": sid,
		"title":      title,
		"status":     status,
		"mode":       mode,
		"created_at": createdAt,
		"updated_at": updatedAt,
		"messages":   h.loadMessages(internalID),
	})
}

func (h *SessionsHandler) Delete(c *gin.Context) {
	sessionID := c.Param("sid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing session id"})
		return
	}

	_, err := h.db.Exec(`DELETE FROM sessions WHERE session_id = $1`, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "session deleted"})
}

func (h *SessionsHandler) Update(c *gin.Context) {
	sessionID := c.Param("sid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing session id"})
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	_, err := h.db.Exec(`UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`, req.Status, sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "session updated"})
}

func (h *SessionsHandler) Create(c *gin.Context) {
	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
		req.Title = "New Session"
	}

	var sessionID string

	insertQuery := `INSERT INTO sessions (session_id, title, status, mode) 
	                VALUES (gen_random_uuid()::text, $1, 'idle', 'plan') 
	                RETURNING session_id`
	err := h.db.QueryRow(insertQuery, req.Title).Scan(&sessionID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"title":      req.Title,
		"status":     "idle",
		"mode":       "plan",
	})
}

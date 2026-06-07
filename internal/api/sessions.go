package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

type SessionsHandler struct {
	db *sql.DB
	rm *RunManager
}

func NewSessionsHandler(db *sql.DB, rm *RunManager) *SessionsHandler {
	return &SessionsHandler{db: db, rm: rm}
}

func newSessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *SessionsHandler) List(c *gin.Context) {
	query := `
		WITH session_runs AS (
		    SELECT s.id, s.session_id, s.title, s.status, s.mode, s.created_at, s.updated_at,
		           s.last_viewed_at,
		           (SELECT state FROM runs WHERE session_id = s.id AND state IN ('running','waiting_confirm') ORDER BY created_at DESC LIMIT 1) AS active_state,
		           (SELECT COUNT(*) FROM runs WHERE session_id = s.id AND state = 'pending') AS queue_depth,
		           (SELECT MAX(terminal_at) FROM runs WHERE session_id = s.id AND state = 'done') AS last_done_at
		    FROM sessions s
		    ORDER BY s.updated_at DESC
		    LIMIT 50
		)
		SELECT session_id, title, status, mode, created_at, updated_at, last_viewed_at, active_state, queue_depth, last_done_at
		FROM session_runs
	`
	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"sessions": []interface{}{}})
		return
	}
	defer rows.Close()

	var sessions []map[string]interface{}
	for rows.Next() {
		var sessionID, title, status, mode string
		var createdAt, updatedAt sql.NullTime
		var lastViewedAt, lastDoneAt sql.NullTime
		var activeState sql.NullString
		var queueDepth int
		if err := rows.Scan(&sessionID, &title, &status, &mode, &createdAt, &updatedAt, &lastViewedAt, &activeState, &queueDepth, &lastDoneAt); err != nil {
			continue
		}
		state := "idle"
		switch {
		case activeState.Valid:
			state = activeState.String
		case queueDepth > 0:
			state = "queued"
		case lastDoneAt.Valid && (!lastViewedAt.Valid || lastDoneAt.Time.After(lastViewedAt.Time)):
			state = "done"
		default:
			var lastTerminal sql.NullString
			h.db.QueryRow(`SELECT state FROM runs WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1) AND state IN ('error','stopped') ORDER BY terminal_at DESC LIMIT 1`, sessionID).Scan(&lastTerminal)
			if lastTerminal.Valid {
				state = lastTerminal.String
			}
		}
		hasUnread := state == "done" || state == "error" || state == "stopped"
		sessions = append(sessions, map[string]interface{}{
			"session_id":  sessionID,
			"title":       title,
			"status":      status,
			"mode":        mode,
			"created_at":  createdAt.Time,
			"updated_at":  updatedAt.Time,
			"state":       state,
			"queue_depth": queueDepth,
			"has_unread":  hasUnread,
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

	var internalID, sid, title, status, mode string
	var createdAt, updatedAt sql.NullTime
	query := `SELECT id, session_id, title, status, mode, created_at, updated_at
	          FROM sessions WHERE session_id = $1 OR id::text = $1`
	err := h.db.QueryRow(query, sessionID).Scan(&internalID, &sid, &title, &status, &mode, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var activeRunID sql.NullString
	h.db.QueryRow(
		`SELECT id::text FROM runs WHERE session_id = $1 AND state IN ('running','waiting_confirm') ORDER BY created_at DESC LIMIT 1`,
		internalID).Scan(&activeRunID)

	var activeEvents []map[string]interface{}
	if activeRunID.Valid {
		activeEvents = h.fetchRunEvents(activeRunID.String, 0)
	}

	pendingRows, _ := h.db.Query(
		`SELECT id::text, user_message, created_at FROM runs WHERE session_id = $1 AND state = 'pending' ORDER BY created_at`,
		internalID)
	var pendingRuns []map[string]interface{}
	if pendingRows != nil {
		defer pendingRows.Close()
		for pendingRows.Next() {
			var rid, msg string
			var createdAt sql.NullTime
			if err := pendingRows.Scan(&rid, &msg, &createdAt); err == nil {
				pendingRuns = append(pendingRuns, map[string]interface{}{
					"run_id":       rid,
					"user_message": msg,
					"created_at":   createdAt.Time,
				})
			}
		}
	}

	incompleteRows, _ := h.db.Query(
		`SELECT id::text, state, user_message, COALESCE(terminal_at, created_at), COALESCE(error_message, '')
		 FROM runs WHERE session_id = $1 AND state IN ('error','stopped')
		 ORDER BY terminal_at DESC LIMIT 5`,
		internalID)
	var incompleteRuns []map[string]interface{}
	if incompleteRows != nil {
		defer incompleteRows.Close()
		for incompleteRows.Next() {
			var rid, st, msg, errMsg string
			var termAt sql.NullTime
			if err := incompleteRows.Scan(&rid, &st, &msg, &termAt, &errMsg); err != nil {
				continue
			}
			incompleteRuns = append(incompleteRuns, map[string]interface{}{
				"run_id":        rid,
				"state":         st,
				"user_message":  msg,
				"events":        h.fetchRunEventsTail(rid, 200),
				"created_at":    termAt.Time,
				"terminal_at":   termAt.Time,
				"error_message": errMsg,
			})
		}
	}

	h.db.Exec(`UPDATE sessions SET last_viewed_at = CURRENT_TIMESTAMP WHERE id = $1`, internalID)

	resp := gin.H{
		"session_id":        sid,
		"title":             title,
		"status":            status,
		"mode":              mode,
		"created_at":        createdAt.Time,
		"updated_at":        updatedAt.Time,
		"active_run_id":     activeRunID.String,
		"messages":          h.loadMessages(internalID),
		"active_run_events": activeEvents,
		"pending_runs":      pendingRuns,
		"incomplete_runs":   incompleteRuns,
	}
	if resp["pending_runs"] == nil {
		resp["pending_runs"] = []map[string]interface{}{}
	}
	if resp["incomplete_runs"] == nil {
		resp["incomplete_runs"] = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, resp)
}

func (h *SessionsHandler) fetchRunEvents(runID string, limit int) []map[string]interface{} {
	q := `SELECT id, seq, event_type, payload, created_at FROM run_events WHERE run_id = $1 ORDER BY seq`
	if limit > 0 {
		q += fmt.Sprintf(" LIMIT %d", limit)
	}
	rows, err := h.db.Query(q, runID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int64
		var seq int
		var etype string
		var payload []byte
		var createdAt sql.NullTime
		if err := rows.Scan(&id, &seq, &etype, &payload, &createdAt); err != nil {
			continue
		}
		var p map[string]interface{}
		_ = json.Unmarshal(payload, &p)
		out = append(out, map[string]interface{}{
			"id":         id,
			"seq":        seq,
			"event_type": etype,
			"payload":    p,
			"created_at": createdAt.Time,
		})
	}
	return out
}

func (h *SessionsHandler) fetchRunEventsTail(runID string, limit int) []map[string]interface{} {
	rows, err := h.db.Query(
		`SELECT id, seq, event_type, payload, created_at FROM (
		    SELECT id, seq, event_type, payload, created_at FROM run_events
		    WHERE run_id = $1 ORDER BY seq DESC LIMIT $2
		 ) recent ORDER BY seq`,
		runID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int64
		var seq int
		var etype string
		var payload []byte
		var createdAt sql.NullTime
		if err := rows.Scan(&id, &seq, &etype, &payload, &createdAt); err != nil {
			continue
		}
		var p map[string]interface{}
		_ = json.Unmarshal(payload, &p)
		out = append(out, map[string]interface{}{
			"id":         id,
			"seq":        seq,
			"event_type": etype,
			"payload":    p,
			"created_at": createdAt.Time,
		})
	}
	return out
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

package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type EventsSSEHandler struct {
	db        *sql.DB
	rm        *RunManager
	jwtSecret string
}

func NewEventsSSEHandler(db *sql.DB, rm *RunManager, jwtSecret string) *EventsSSEHandler {
	return &EventsSSEHandler{db: db, rm: rm, jwtSecret: jwtSecret}
}

func (h *EventsSSEHandler) Stream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")
	// Disable chunked encoding for SSE
	c.Header("Transfer-Encoding", "identity")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	// Auth: accept token from query param (EventSource can't set request headers)
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.jwtSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
		return
	}

	c.Set("user_id", claims["sub"])
	role := "viewer"
	if r, ok := claims["role"].(string); ok && r != "" {
		role = r
	}
	c.Set("user_role", role)

	sessionIDsParam := c.Query("session_ids")
	if sessionIDsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_ids required"})
		return
	}
	sessionIDs := strings.Split(sessionIDsParam, ",")
	for i := range sessionIDs {
		sessionIDs[i] = strings.TrimSpace(sessionIDs[i])
	}

	userID, _ := c.Get("user_id")
	userRole, _ := c.Get("user_role")
	ownerID, _ := userID.(string)
	role, _ = userRole.(string)

	if role != "admin" {
		for _, sid := range sessionIDs {
			sid = strings.TrimSpace(sid)
			if sid == "" {
				continue
			}
			var dbOwnerID string
			err := h.db.QueryRow(`SELECT user_id FROM sessions WHERE session_id = $1`, sid).Scan(&dbOwnerID)
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
				c.Abort()
				return
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				c.Abort()
				return
			}
			if dbOwnerID != ownerID {
				c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
				c.Abort()
				return
			}
		}
	}

	var fromID int64
	if v := c.Query("last_event_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			fromID = n
		}
	}

	// Send initial connection message
	fmt.Fprintf(c.Writer, ": connected\n\n")
	flusher.Flush()

	ch, unsub := h.rm.Subscribe(sessionIDs, fromID)
	defer unsub()

	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()

	ctx := c.Request.Context()

	// Manual streaming loop to properly handle chunked encoding termination
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				// Channel closed, just return - no need to send chunked encoding terminator for SSE
				return
			}
			// Check if connection is still alive before writing
			select {
			case <-ctx.Done():
				return
			default:
			}
			id := strconv.FormatInt(ev.ID, 10)
			data := toJSON(ev)
			// SSE format: id: <id>\ndata: <json>\n\n
			_, err := fmt.Fprintf(c.Writer, "id: %s\ndata: %s\n\n", id, data)
			if err != nil {
				return
			}
			flusher.Flush()
		case <-tick.C:
			// Check if connection is still alive before writing keep-alive
			select {
			case <-ctx.Done():
				return
			default:
			}
			// Send keep-alive comment
			_, err := fmt.Fprintf(c.Writer, ": ping\n\n")
			if err != nil {
				return
			}
			flusher.Flush()
		case <-ctx.Done():
			// Client disconnected or request cancelled - just return for SSE
			return
		}
	}
}

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
	// --- Auth & validation BEFORE setting SSE headers ---

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

	userID := fmt.Sprintf("%v", claims["sub"])
	role := "viewer"
	if r, ok := claims["role"].(string); ok && r != "" {
		role = r
	}

	sessionIDsParam := c.Query("session_ids")
	if sessionIDsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_ids required"})
		return
	}
	sessionIDs := strings.Split(sessionIDsParam, ",")
	for i := range sessionIDs {
		sessionIDs[i] = strings.TrimSpace(sessionIDs[i])
	}

	// Batch permission check for non-admin users
	if role != "admin" && h.db != nil {
		rows, err := h.db.Query(
			`SELECT user_id FROM sessions WHERE session_id = ANY($1)`,
			sessionIDs,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		for rows.Next() {
			var dbOwnerID string
			if err := rows.Scan(&dbOwnerID); err != nil {
				continue
			}
			if dbOwnerID != userID {
				c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
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

	// --- Now set SSE headers (after all validation passes) ---
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		// Should not happen with gin + net/http
		return
	}

	// Send initial connection message
	fmt.Fprintf(c.Writer, ": connected\n\n")
	flusher.Flush()

	ch, unsub := h.rm.Subscribe(sessionIDs, fromID)
	defer unsub()

	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()

	ctx := c.Request.Context()

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			select {
			case <-ctx.Done():
				return
			default:
			}
			id := strconv.FormatInt(ev.ID, 10)
			data := toJSON(ev)
			if _, err := fmt.Fprintf(c.Writer, "id: %s\ndata: %s\n\n", id, data); err != nil {
				return
			}
			flusher.Flush()
		case <-tick.C:
			select {
			case <-ctx.Done():
				return
			default:
			}
			if _, err := fmt.Fprintf(c.Writer, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}

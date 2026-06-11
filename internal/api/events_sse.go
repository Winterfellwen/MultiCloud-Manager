package api

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type EventsSSEHandler struct {
	db *sql.DB
	rm *RunManager
}

func NewEventsSSEHandler(db *sql.DB, rm *RunManager) *EventsSSEHandler {
	return &EventsSSEHandler{db: db, rm: rm}
}

func (h *EventsSSEHandler) Stream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
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

	userID, _ := c.Get("user_id")
	userRole, _ := c.Get("user_role")
	ownerID, _ := userID.(string)
	role, _ := userRole.(string)

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

	fmt.Fprintf(c.Writer, ": connected\n\n")
	flusher.Flush()

	ch, unsub := h.rm.Subscribe(sessionIDs, fromID)
	defer unsub()

	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()

	c.Stream(func(w io.Writer) bool {
		select {
		case ev, ok := <-ch:
			if !ok {
				return false
			}
			id := strconv.FormatInt(ev.ID, 10)
			data := toJSON(ev)
			fmt.Fprintf(c.Writer, "id: %s\ndata: %s\n\n", id, data)
			return true
		case <-tick.C:
			fmt.Fprintf(c.Writer, ": ping\n\n")
			return true
		case <-c.Request.Context().Done():
			return false
		}
	})
}

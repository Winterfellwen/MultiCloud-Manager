package api

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"multicloud/internal/agent"
	"multicloud/internal/cloud"
	"multicloud/internal/vault"

	"github.com/gin-gonic/gin"
)

// CloudEventsHandler handles cloud event aggregation API endpoints.
type CloudEventsHandler struct {
	db          *sql.DB
	vaultSvc    vault.Service
	eventSyncer *cloud.EventSyncer
}

// NewCloudEventsHandler creates a new CloudEventsHandler.
func NewCloudEventsHandler(db *sql.DB, v vault.Service, es *cloud.EventSyncer) *CloudEventsHandler {
	return &CloudEventsHandler{db: db, vaultSvc: v, eventSyncer: es}
}

// List returns a paginated list of cloud events with optional filters.
// GET /api/events?cloud_type=render&event_type=deploy&severity=critical&start=2026-06-01T00:00:00Z&end=2026-06-15T00:00:00Z&resource_id=xxx&page=1&page_size=20
func (h *CloudEventsHandler) List(c *gin.Context) {
	cloudType := c.Query("cloud_type")
	eventType := c.Query("event_type")
	severity := c.Query("severity")
	resourceID := c.Query("resource_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var startTime, endTime *time.Time
	if s := c.Query("start"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			startTime = &t
		}
	}
	if e := c.Query("end"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			endTime = &t
		}
	}

	where, args := cloud.BuildEventWhereClause(cloudType, eventType, severity, resourceID, startTime, endTime)

	// Count total
	var total int
	countSQL := "SELECT COUNT(*) FROM cloud_events " + where
	h.db.QueryRow(countSQL, args...).Scan(&total)

	// Query items
	offset := (page - 1) * pageSize
	querySQL := `SELECT id, cloud_type, event_type, severity, title, description, source, source_id,
                        resource_id, resource_name, resource_type, region, metadata, event_at, fetched_at
                 FROM cloud_events ` + where + ` ORDER BY event_at DESC LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	queryArgs := append(args, pageSize, offset)

	rows, err := h.db.Query(querySQL, queryArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, ct, et, sev, title, source, sourceID string
		var desc, resID, resName, resType, region sql.NullString
		var metaJSON []byte
		var eventAt, fetchedAt time.Time
		if err := rows.Scan(&id, &ct, &et, &sev, &title, &desc, &source, &sourceID,
			&resID, &resName, &resType, &region, &metaJSON, &eventAt, &fetchedAt); err != nil {
			continue
		}
		item := map[string]interface{}{
			"id": id, "cloud_type": ct, "event_type": et, "severity": sev,
			"title": title, "source": source, "source_id": sourceID,
			"event_at": eventAt.Format(time.RFC3339), "fetched_at": fetchedAt.Format(time.RFC3339),
		}
		if desc.Valid {
			item["description"] = desc.String
		}
		if resID.Valid {
			item["resource_id"] = resID.String
		}
		if resName.Valid {
			item["resource_name"] = resName.String
		}
		if resType.Valid {
			item["resource_type"] = resType.String
		}
		if region.Valid {
			item["region"] = region.String
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items, "total": total,
		"page": page, "page_size": pageSize,
		"pages": (total + pageSize - 1) / pageSize,
	})
}

// Stats returns aggregated statistics about cloud events.
// GET /api/events/stats
func (h *CloudEventsHandler) Stats(c *gin.Context) {
	var total int
	var recent24h int
	h.db.QueryRow("SELECT COUNT(*) FROM cloud_events").Scan(&total)

	stats := map[string]interface{}{
		"total": total,
	}

	// By cloud type
	byCloud := map[string]int{}
	rows, _ := h.db.Query("SELECT cloud_type, COUNT(*) FROM cloud_events GROUP BY cloud_type")
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var ct string
			var cnt int
			rows.Scan(&ct, &cnt)
			byCloud[ct] = cnt
		}
	}
	stats["by_cloud_type"] = byCloud

	// By event type
	byType := map[string]int{}
	rows, _ = h.db.Query("SELECT event_type, COUNT(*) FROM cloud_events GROUP BY event_type")
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var et string
			var cnt int
			rows.Scan(&et, &cnt)
			byType[et] = cnt
		}
	}
	stats["by_event_type"] = byType

	// By severity
	bySev := map[string]int{}
	rows, _ = h.db.Query("SELECT severity, COUNT(*) FROM cloud_events GROUP BY severity")
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var cnt int
			rows.Scan(&s, &cnt)
			bySev[s] = cnt
		}
	}
	stats["by_severity"] = bySev

	// Recent 24h count
	h.db.QueryRow("SELECT COUNT(*) FROM cloud_events WHERE event_at > NOW() - INTERVAL '24 hours'").Scan(&recent24h)
	stats["recent_24h"] = recent24h

	// Last sync time
	var lastSync sql.NullTime
	h.db.QueryRow("SELECT MAX(last_sync_at) FROM cloud_event_sync_state").Scan(&lastSync)
	if lastSync.Valid {
		stats["last_sync_at"] = lastSync.Time.Format(time.RFC3339)
	}

	c.JSON(http.StatusOK, stats)
}

// TriggerSync triggers a manual event sync in the background.
// POST /api/events/sync
func (h *CloudEventsHandler) TriggerSync(c *gin.Context) {
	go h.eventSyncer.SyncAll(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"status": "syncing"})
}

// SyncStatus returns the current sync status for all cloud types.
// GET /api/events/sync-status
func (h *CloudEventsHandler) SyncStatus(c *gin.Context) {
	status := h.eventSyncer.GetSyncStatus(c.Request.Context())
	if status == nil {
		status = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, status)
}

// TriggerAnalysis triggers an AI analysis on cloud events.
// POST /api/events/analysis
func (h *CloudEventsHandler) TriggerAnalysis(c *gin.Context) {
	var req struct {
		AnalysisType string                 `json:"analysis_type" binding:"required"`
		Scope        map[string]interface{} `json:"scope"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "analysis_type is required"})
		return
	}

	cfg := GetAIConfigValue()
	analyzer := agent.NewEventAnalyzer(h.db)
	result, err := analyzer.Analyze(c.Request.Context(), agent.AnalyzerAIConfig{
		APIEndpoint: cfg.APIEndpoint,
		Model:       cfg.Model,
		APIKey:      cfg.APIKey,
	}, req.AnalysisType, req.Scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetAnalysis returns recent AI analysis results.
// GET /api/events/analysis
func (h *CloudEventsHandler) GetAnalysis(c *gin.Context) {
	analyzer := agent.NewEventAnalyzer(h.db)
	results := analyzer.GetRecentAnalysis(c.Request.Context(), 10)
	if results == nil {
		results = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, results)
}

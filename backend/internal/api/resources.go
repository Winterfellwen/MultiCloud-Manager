package api

import (
	"context"
	"net/http"
	"time"

	"multicloud-manager/internal/cloud"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ResourcesHandler struct {
	syncer *cloud.Syncer
}

func NewResourcesHandler(syncer *cloud.Syncer) *ResourcesHandler {
	return &ResourcesHandler{syncer: syncer}
}

// List returns cached resources (fast, no API calls)
func (h *ResourcesHandler) List(c *gin.Context) {
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}, "last_sync": nil})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}, "last_sync": nil})
		return
	}

	lastSync := h.syncer.GetLastSync()
	var lastSyncStr *string
	if !lastSync.IsZero() {
		s := lastSync.Format(time.RFC3339)
		lastSyncStr = &s
	}

	c.JSON(http.StatusOK, gin.H{"resources": resources, "last_sync": lastSyncStr})
}

// Sync triggers an immediate background sync, returns current cache
func (h *ResourcesHandler) Sync(c *gin.Context) {
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}, "last_sync": nil})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	if err := h.syncer.SyncAll(ctx); err != nil {
		c.JSON(http.StatusOK, gin.H{"error": err.Error()})
		return
	}

	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}})
		return
	}

	lastSync := h.syncer.GetLastSync()
	var lastSyncStr *string
	if !lastSync.IsZero() {
		s := lastSync.Format(time.RFC3339)
		lastSyncStr = &s
	}

	c.JSON(http.StatusOK, gin.H{"resources": resources, "last_sync": lastSyncStr})
}

func (h *ResourcesHandler) ListDeletions(c *gin.Context) {
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"deletions": []gin.H{}})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	deletions, err := h.syncer.GetDeletions(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"deletions": []gin.H{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deletions": deletions})
}

func (h *ResourcesHandler) Detail(c *gin.Context) {
	id := c.Param("id")
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"resource": gin.H{}})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"resource": gin.H{}})
		return
	}
	for _, r := range resources {
		if r["id"] == id {
			c.JSON(http.StatusOK, gin.H{"resource": r})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
}

func (h *ResourcesHandler) Start(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"message": "start initiated", "resource_id": id, "status": "starting"})
}

func (h *ResourcesHandler) Stop(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"message": "stop initiated", "resource_id": id, "status": "stopping"})
}

func (h *ResourcesHandler) Restart(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"message": "restart initiated", "resource_id": id, "status": "restarting"})
}

func generateID() string {
	return uuid.New().String()[:8]
}

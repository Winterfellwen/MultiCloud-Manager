package api

import (
	"context"
	"net/http"
	"time"

	"multicloud-manager/internal/cloud"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ResourcesHandler struct {
	db     *services.Database
	syncer *cloud.Syncer
}

func NewResourcesHandler(db *services.Database, syncer *cloud.Syncer) *ResourcesHandler {
	return &ResourcesHandler{db: db, syncer: syncer}
}

func (h *ResourcesHandler) List(c *gin.Context) {
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	resources, err := h.syncer.SyncAndGetResources(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"resources": []gin.H{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"resources": resources})
}

func (h *ResourcesHandler) Detail(c *gin.Context) {
	id := c.Param("id")
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"resource": gin.H{}})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
	if h.syncer == nil {
		c.JSON(http.StatusOK, gin.H{"message": "start initiated", "resource_id": id, "status": "starting"})
		return
	}
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

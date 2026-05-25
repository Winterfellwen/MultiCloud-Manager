package api

import (
	"net/http"

	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ResourcesHandler struct {
	db *services.Database
}

func NewResourcesHandler(db *services.Database) *ResourcesHandler {
	return &ResourcesHandler{db: db}
}

func (h *ResourcesHandler) List(c *gin.Context) {
	// For now, return mock resources since we don't have a resources table yet
	resources := []gin.H{
		{"id": "res-001", "name": "prod-web-server", "type": "VM", "cloud_type": "azure", "region": "eastus", "status": "running"},
		{"id": "res-002", "name": "dev-database", "type": "Database", "cloud_type": "tencent", "region": "ap-guangzhou", "status": "running"},
		{"id": "res-003", "name": "staging-k8s", "type": "Kubernetes", "cloud_type": "oracle", "region": "ap-tokyo", "status": "stopped"},
		{"id": "res-004", "name": "blog-api", "type": "Web Service", "cloud_type": "render", "region": "oregon", "status": "running"},
	}
	c.JSON(http.StatusOK, gin.H{"resources": resources})
}

func (h *ResourcesHandler) Detail(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"resource": gin.H{
			"id":         id,
			"name":       "prod-web-server",
			"type":       "VM",
			"cloud_type": "azure",
			"region":     "eastus",
			"status":     "running",
			"cpu":        "2 vCPU",
			"memory":     "4 GB",
			"disk":       "50 GB SSD",
		},
	})
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

// Placeholder for future use
func generateID() string {
	return uuid.New().String()[:8]
}
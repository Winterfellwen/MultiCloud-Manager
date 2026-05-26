package api

import (
	"net/http"

	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
)

type StatsHandler struct {
	db *services.Database
}

func NewStatsHandler(db *services.Database) *StatsHandler {
	return &StatsHandler{db: db}
}

func (h *StatsHandler) GetStats(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"stats": gin.H{"resources": 0, "accounts": 0, "terraform": 0, "members": 0}})
		return
	}

	var accounts, resources, terraform, members int
	h.db.QueryRow("SELECT COUNT(*) FROM cloud_accounts").Scan(&accounts)
	h.db.QueryRow("SELECT COUNT(*) FROM resources_cache").Scan(&resources)
	h.db.QueryRow("SELECT COUNT(*) FROM users WHERE team_id IS NOT NULL").Scan(&members)

	c.JSON(http.StatusOK, gin.H{
		"stats": gin.H{
			"resources": resources,
			"accounts":  accounts,
			"terraform": terraform,
			"members":   members,
		},
	})
}

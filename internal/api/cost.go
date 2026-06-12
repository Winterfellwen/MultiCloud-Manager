package api

import (
	"encoding/json"
	"net/http"
	"time"

	"multicloud/internal/cost"

	"github.com/gin-gonic/gin"
)

type CostAPI struct {
	engine *cost.CostEngine
}

func NewCostAPI(engine *cost.CostEngine) *CostAPI {
	return &CostAPI{engine: engine}
}

func (ca *CostAPI) GetOverview(c *gin.Context) {
	providers := c.QueryArray("provider")
	start, _ := time.Parse("2006-01-02", c.DefaultQuery("start", time.Now().AddDate(0, -1, 0).Format("2006-01-02")))
	end, _ := time.Parse("2006-01-02", c.DefaultQuery("end", time.Now().Format("2006-01-02")))

	overview, err := ca.engine.Aggregator().Overview(c.Request.Context(), providers, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, overview)
}

func (ca *CostAPI) GetBreakdown(c *gin.Context) {
	providers := c.QueryArray("provider")
	start, _ := time.Parse("2006-01-02", c.DefaultQuery("start", time.Now().AddDate(0, -1, 0).Format("2006-01-02")))
	end, _ := time.Parse("2006-01-02", c.DefaultQuery("end", time.Now().Format("2006-01-02")))

	breakdown, err := ca.engine.Aggregator().Breakdown(c.Request.Context(), providers, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, breakdown)
}

func (ca *CostAPI) GetTrend(c *gin.Context) {
	providers := c.QueryArray("provider")
	start, _ := time.Parse("2006-01-02", c.DefaultQuery("start", time.Now().AddDate(0, -1, 0).Format("2006-01-02")))
	end, _ := time.Parse("2006-01-02", c.DefaultQuery("end", time.Now().Format("2006-01-02")))
	interval := c.DefaultQuery("interval", "day")

	trend, err := ca.engine.Aggregator().Trend(c.Request.Context(), providers, start, end, interval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, trend)
}

func (ca *CostAPI) CompareCrossCloud(c *gin.Context) {
	tier := c.Query("tier")
	region := c.DefaultQuery("region", "eastus")

	if tier == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tier query parameter is required"})
		return
	}

	result, err := ca.engine.Aggregator().CompareCrossCloud(c.Request.Context(), tier, region)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (ca *CostAPI) Forecast(c *gin.Context) {
	providers := c.QueryArray("provider")

	forecast, err := ca.engine.Aggregator().Forecast(c.Request.Context(), providers)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, forecast)
}

func (ca *CostAPI) SyncCost(c *gin.Context) {
	go func() {
		ca.engine.SyncAll(c.Request.Context())
	}()
	c.JSON(http.StatusOK, gin.H{"message": "cost sync started"})
}

func (ca *CostAPI) ListOptimizations(c *gin.Context) {
	status := c.Query("status")

	suggestions, err := ca.engine.Optimizer().ListSuggestions(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, suggestions)
}

func (ca *CostAPI) UpdateOptimizationStatus(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ca.engine.Optimizer().UpdateSuggestionStatus(c.Request.Context(), id, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}

func (ca *CostAPI) ApplyOptimization(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")
	userIDStr, _ := userID.(string)

	if err := ca.engine.Optimizer().ApplySuggestion(c.Request.Context(), id, userIDStr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "optimization applied"})
}

func (ca *CostAPI) ListRules(c *gin.Context) {
	rules, err := ca.engine.Optimizer().ListRules(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rules)
}

func (ca *CostAPI) CreateRule(c *gin.Context) {
	var req struct {
		Name            string          `json:"name" binding:"required"`
		Description     string          `json:"description"`
		Enabled         bool            `json:"enabled"`
		RequiresConfirm bool            `json:"requires_confirm"`
		Condition       json.RawMessage `json:"condition" binding:"required"`
		Action          json.RawMessage `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	userIDStr, _ := userID.(string)

	rule, err := ca.engine.Optimizer().CreateRule(c.Request.Context(), req.Name, req.Description,
		req.Enabled, req.RequiresConfirm, req.Condition, req.Action, userIDStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rule)
}

func (ca *CostAPI) UpdateRule(c *gin.Context) {
	id := c.Param("id")
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ca.engine.Optimizer().UpdateRule(c.Request.Context(), id, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "rule updated"})
}

func (ca *CostAPI) DeleteRule(c *gin.Context) {
	id := c.Param("id")

	if err := ca.engine.Optimizer().DeleteRule(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "rule deleted"})
}

func (ca *CostAPI) ToggleRule(c *gin.Context) {
	id := c.Param("id")

	if err := ca.engine.Optimizer().ToggleRule(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "rule toggled"})
}

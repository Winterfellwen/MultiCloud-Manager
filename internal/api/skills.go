package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"multicloud/internal/agent/skill"
)

// SkillHandler skill management handler
type SkillHandler struct {
	engine *skill.Engine
}

// NewSkillHandler creates a skill management handler
func NewSkillHandler(engine *skill.Engine) *SkillHandler {
	return &SkillHandler{engine: engine}
}

// ListSkills lists all skills
func (h *SkillHandler) ListSkills(c *gin.Context) {
	skills := h.engine.GetActiveSkills()
	c.JSON(http.StatusOK, gin.H{"skills": skills})
}

// GetSkill gets skill details
func (h *SkillHandler) GetSkill(c *gin.Context) {
	name := c.Param("name")
	s := h.engine.GetSkill(name)
	if s == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, s)
}

// EnableSkill enables a skill
func (h *SkillHandler) EnableSkill(c *gin.Context) {
	name := c.Param("name")
	if !h.engine.EnableSkill(name) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "skill enabled"})
}

// DisableSkill disables a skill
func (h *SkillHandler) DisableSkill(c *gin.Context) {
	name := c.Param("name")
	if !h.engine.DisableSkill(name) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "skill disabled"})
}

// UpdateSkillConfig updates skill configuration
func (h *SkillHandler) UpdateSkillConfig(c *gin.Context) {
	name := c.Param("name")

	var req struct {
		Config map[string]interface{} `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !h.engine.UpdateConfig(name, req.Config) {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "config updated"})
}

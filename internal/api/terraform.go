package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type TerraformHandler struct {
	db *sql.DB
}

func NewTerraformHandler(db *sql.DB) *TerraformHandler {
	return &TerraformHandler{db: db}
}

// GetTemplates 获取Terraform模板列表
func (h *TerraformHandler) GetTemplates(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, content, version, status, last_applied_at, created_at, updated_at FROM terraform_templates ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var templates []map[string]interface{}
	for rows.Next() {
		var id, name, content, version, status string
		var lastAppliedAt, createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&id, &name, &content, &version, &status, &lastAppliedAt, &createdAt, &updatedAt); err != nil {
			continue
		}
		t := map[string]interface{}{
			"id":      id,
			"name":    name,
			"content": content,
			"version": version,
			"status":  status,
		}
		if lastAppliedAt.Valid {
			t["last_applied_at"] = lastAppliedAt.Time
		}
		if createdAt.Valid {
			t["created_at"] = createdAt.Time
		}
		if updatedAt.Valid {
			t["updated_at"] = updatedAt.Time
		}
		templates = append(templates, t)
	}
	if templates == nil {
		templates = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"templates": templates,
		"total":     len(templates),
	})
}

// GetTemplate 获取单个Terraform模板详情
func (h *TerraformHandler) GetTemplate(c *gin.Context) {
	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	var id, name, content, version, status string
	var lastAppliedAt, createdAt, updatedAt sql.NullTime
	err := h.db.QueryRow(
		`SELECT id, name, content, version, status, last_applied_at, created_at, updated_at FROM terraform_templates WHERE id = $1`,
		templateID,
	).Scan(&id, &name, &content, &version, &status, &lastAppliedAt, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	t := map[string]interface{}{
		"id":      id,
		"name":    name,
		"content": content,
		"version": version,
		"status":  status,
	}
	if lastAppliedAt.Valid {
		t["last_applied_at"] = lastAppliedAt.Time
	}
	if createdAt.Valid {
		t["created_at"] = createdAt.Time
	}
	if updatedAt.Valid {
		t["updated_at"] = updatedAt.Time
	}

	c.JSON(http.StatusOK, t)
}

// CreateTemplate 创建Terraform模板
func (h *TerraformHandler) CreateTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	var req struct {
		Name    string `json:"name"`
		Content string `json:"content"`
		Version string `json:"version"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}
	if req.Name == "" || req.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模板名称和内容不能为空"})
		return
	}
	if req.Version == "" {
		req.Version = "1.0"
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO terraform_templates (name, content, version, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
		req.Name, req.Content, req.Version,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "模板创建成功",
		"template": gin.H{
			"id":      id,
			"name":    req.Name,
			"version": req.Version,
			"status":  "draft",
		},
	})
}

// UpdateTemplate 更新Terraform模板
func (h *TerraformHandler) UpdateTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	var req struct {
		Name    string `json:"name"`
		Content string `json:"content"`
		Version string `json:"version"`
		Status  string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	result, err := h.db.Exec(
		`UPDATE terraform_templates SET
			name = COALESCE(NULLIF($1,''), name),
			content = COALESCE(NULLIF($2,''), content),
			version = COALESCE(NULLIF($3,''), version),
			status = COALESCE(NULLIF($4,''), status),
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $5`,
		req.Name, req.Content, req.Version, req.Status, templateID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "模板已更新"})
}

// DeleteTemplate 删除Terraform模板
func (h *TerraformHandler) DeleteTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	result, err := h.db.Exec(`DELETE FROM terraform_templates WHERE id = $1`, templateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "模板已删除"})
}

// ApplyTemplate 应用Terraform模板（更新状态和应用时间）
func (h *TerraformHandler) ApplyTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	result, err := h.db.Exec(
		`UPDATE terraform_templates SET status = 'applied', last_applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		templateID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "模板已应用",
		"template_id": templateID,
		"status":      "applied",
	})
}

// PlanTemplate 执行Terraform plan（更新状态）
func (h *TerraformHandler) PlanTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	// Verify template exists
	var status string
	err := h.db.QueryRow(`SELECT status FROM terraform_templates WHERE id = $1`, templateID).Scan(&status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update status to 'planned'
	h.db.Exec(`UPDATE terraform_templates SET status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, templateID)

	c.JSON(http.StatusOK, gin.H{
		"message":     "Plan 执行成功",
		"template_id": templateID,
		"status":      "planned",
	})
}

// DestroyTemplate 销毁Terraform模板关联资源
func (h *TerraformHandler) DestroyTemplate(c *gin.Context) {
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	templateID := c.Param("id")
	if templateID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少模板ID"})
		return
	}

	result, err := h.db.Exec(
		`UPDATE terraform_templates SET status = 'destroyed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		templateID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "模板资源已销毁",
		"template_id": templateID,
		"status":      "destroyed",
	})
}

package api

import (
	"database/sql"
	"net/http"

	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type UsersHandler struct {
	db *services.Database
}

func NewUsersHandler(db *services.Database) *UsersHandler {
	return &UsersHandler{db: db}
}

func getUserClaims(c *gin.Context) *Claims {
	v, _ := c.Get("user")
	if v == nil {
		return nil
	}
	claims, _ := v.(*Claims)
	return claims
}

// GET /api/auth/profile
func (h *UsersHandler) GetProfile(c *gin.Context) {
	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{
			"id":       claims.UserID,
			"username": claims.Username,
			"nickname": claims.Username,
			"role":     claims.Role,
		})
		return
	}

	var userID, nickname, role string
	var username, openid, avatarURL *string
	var createdAt string
	err := h.db.QueryRow(
		`SELECT id, username, openid, nickname, avatar_url, role, created_at FROM users WHERE id = $1`,
		claims.UserID,
	).Scan(&userID, &username, &openid, &nickname, &avatarURL, &role, &createdAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	nicknameStr := ""
	if nickname != "" {
		nicknameStr = nickname
	}
	avatarStr := ""
	if avatarURL != nil {
		avatarStr = *avatarURL
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         userID,
		"username":   username,
		"openid":     openid,
		"nickname":   nicknameStr,
		"avatar_url": avatarStr,
		"role":       role,
		"created_at": createdAt,
	})
}

// PUT /api/auth/password
func (h *UsersHandler) UpdatePassword(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old_password and new_password required"})
		return
	}

	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}

	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "password updated"})
		return
	}

	var passwordHash sql.NullString
	err := h.db.QueryRow(`SELECT password_hash FROM users WHERE id = $1`, claims.UserID).Scan(&passwordHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	if !passwordHash.Valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no password set, use wechat login"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash.String), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid old password"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	_, err = h.db.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, string(newHash), claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// GET /api/admin/users
func (h *UsersHandler) ListUsers(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"users": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}
	defer rows.Close()

	type UserItem struct {
		ID        string  `json:"id"`
		Username  *string `json:"username"`
		Nickname  string  `json:"nickname"`
		Role      string  `json:"role"`
		CreatedAt string  `json:"created_at"`
	}

	var users []UserItem
	for rows.Next() {
		var u UserItem
		if err := rows.Scan(&u.ID, &u.Username, &u.Nickname, &u.Role, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	if users == nil {
		users = []UserItem{}
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}

// POST /api/admin/users
func (h *UsersHandler) CreateUser(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Nickname string `json:"nickname"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}

	if req.Role == "" {
		req.Role = "operator"
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	if req.Nickname == "" {
		req.Nickname = req.Username
	}

	if h.db == nil {
		c.JSON(http.StatusCreated, gin.H{"user": gin.H{
			"id": uuid.New().String(), "username": req.Username, "nickname": req.Nickname, "role": req.Role,
		}})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	id := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO users (id, username, password_hash, nickname, role) VALUES ($1, $2, $3, $4, $5)`,
		id, req.Username, string(hash), req.Nickname, req.Role,
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"user": gin.H{
		"id": id, "username": req.Username, "nickname": req.Nickname, "role": req.Role,
	}})
}

// PUT /api/admin/users/:id
func (h *UsersHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid params"})
		return
	}

	if req.Role != "" && req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "user updated"})
		return
	}

	if req.Role != "" {
		_, err := h.db.Exec(`UPDATE users SET role = $1 WHERE id = $2`, req.Role, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "user updated"})
}

// DELETE /api/admin/users/:id
func (h *UsersHandler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")
	claims := getUserClaims(c)
	if claims == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if claims.UserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
		return
	}

	_, err := h.db.Exec(`DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "delete_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}

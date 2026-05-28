package api

import (
	"database/sql"
	"net/http"
	"time"

	"multicloud-manager/config"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db  *services.Database
	cfg *config.Config
}

func NewAuthHandler(db *services.Database, cfg *config.Config) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
}

func (h *AuthHandler) generateJWT(userID, username, role string) (string, error) {
	expiry := time.Duration(h.cfg.JWTExpiryHours) * time.Hour
	if expiry <= 0 {
		expiry = 72 * time.Hour
	}

	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.cfg.JWTSecret))
}

func (h *AuthHandler) PasswordLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	if h.db == nil {
		// Dev mode: accept admin/Test@20181025
		if req.Username == "admin" && req.Password == "Test@20181025" {
			token, _ := h.generateJWT(uuid.New().String(), "admin", "admin")
			c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": "", "username": "admin", "nickname": "Admin", "role": "admin"}})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": i18n.T(c, "invalid_params")})
		return
	}

	var userID, username, passwordHash, nickname, role string
	err := h.db.QueryRow(
		`SELECT id, username, password_hash, nickname, role FROM users WHERE username = $1`,
		req.Username,
	).Scan(&userID, &username, &passwordHash, &nickname, &role)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	token, err := h.generateJWT(userID, username, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       userID,
			"username": username,
			"nickname": nickname,
			"role":     role,
		},
	})
}

func (h *AuthHandler) WechatLogin(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}

	if h.db == nil {
		// Dev mode: return mock viewer user
		token, _ := h.generateJWT("dev-user", "", "viewer")
		c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": "dev-user", "openid": "", "nickname": "Dev User", "role": "viewer"}})
		return
	}

	// Exchange code for openid via WeChat API
	openid, err := h.exchangeCodeForOpenID(req.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wechat login failed"})
		return
	}

	// Find or create user
	var userID, nickname, avatarURL, role string
	var dbUsername *string
	err = h.db.QueryRow(
		`SELECT id, username, nickname, avatar_url, role FROM users WHERE openid = $1`,
		openid,
	).Scan(&userID, &dbUsername, &nickname, &avatarURL, &role)

	if err == sql.ErrNoRows {
		// Create new user as viewer
		userID = uuid.New().String()
		nickname = "WeChat User"
		role = "viewer"
		_, err = h.db.Exec(
			`INSERT INTO users (id, openid, nickname, role) VALUES ($1, $2, $3, $4)`,
			userID, openid, nickname, role,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "create user failed: " + err.Error()})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query user failed: " + err.Error()})
		return
	}

	token, err := h.generateJWT(userID, "", role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":         userID,
			"openid":     openid,
			"nickname":   nickname,
			"avatar_url": avatarURL,
			"role":       role,
		},
	})
}

func (h *AuthHandler) exchangeCodeForOpenID(code string) (string, error) {
	// TODO: Implement real WeChat code-to-openid exchange
	// In production: GET https://api.weixin.qq.com/sns/jscode2session?appid=APPID&secret=SECRET&js_code=CODE&grant_type=authorization_code
	// Use a fixed test openid for dev so subsequent logins find the same user
	return "dev-wechat-openid", nil
}

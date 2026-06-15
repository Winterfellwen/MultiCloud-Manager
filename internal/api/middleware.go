package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ValidateJWTToken parses and validates a JWT token string using the given secret.
// Returns the parsed token and claims on success, or an error describing why validation failed.
func ValidateJWTToken(tokenStr, jwtSecret string) (*jwt.Token, jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(jwtSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, nil, err
	}
	if !token.Valid {
		return nil, nil, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, nil, fmt.Errorf("invalid claims")
	}
	return token, claims, nil
}

func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			c.Abort()
			return
		}

		_, claims, err := ValidateJWTToken(tokenStr, jwtSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims["sub"])

		// Extract role (default to "viewer" for old tokens without role)
		role := "viewer"
		if r, ok := claims["role"].(string); ok && r != "" {
			role = r
		}
		c.Set("user_role", role)

		c.Next()
	}
}

// RequireRole returns middleware that checks user_role against allowed roles.
// Usage: RequireRole("admin") or RequireRole("admin", "user")
func RequireRole(allowed ...string) gin.HandlerFunc {
	allowedSet := make(map[string]bool, len(allowed))
	for _, r := range allowed {
		allowedSet[r] = true
	}
	return func(c *gin.Context) {
		role, _ := c.Get("user_role")
		roleStr, _ := role.(string)
		if !allowedSet[roleStr] {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足，需要: " + strings.Join(allowed, " 或 ")})
			c.Abort()
			return
		}
		c.Next()
	}
}

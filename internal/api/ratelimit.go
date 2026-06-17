package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimitConfig defines rate limit parameters for an endpoint.
type RateLimitConfig struct {
	Requests int           // Max requests allowed in the window
	Window   time.Duration // Time window duration
	Key      string        // Base key prefix for Redis
}

// RateLimitTier defines different rate limit tiers.
type RateLimitTier string

const (
	TierAnonymous RateLimitTier = "anonymous" // Unauthenticated requests (by IP)
	TierUser      RateLimitTier = "user"      // Authenticated requests (by user ID)
	TierAdmin     RateLimitTier = "admin"     // Admin requests (higher limits)
)

// TierRateLimits defines rate limits for each tier.
var TierRateLimits = map[RateLimitTier]RateLimitConfig{
	TierAnonymous: {Requests: 30, Window: time.Minute, Key: "ratelimit:anon"},
	TierUser:      {Requests: 120, Window: time.Minute, Key: "ratelimit:user"},
	TierAdmin:     {Requests: 600, Window: time.Minute, Key: "ratelimit:admin"},
}

// SensitiveOperationRateLimits defines stricter limits for sensitive operations.
var SensitiveOperationRateLimits = map[RateLimitTier]RateLimitConfig{
	TierAnonymous: {Requests: 10, Window: time.Minute, Key: "ratelimit:sensitive:anon"},
	TierUser:      {Requests: 30, Window: time.Minute, Key: "ratelimit:sensitive:user"},
	TierAdmin:     {Requests: 60, Window: time.Minute, Key: "ratelimit:sensitive:admin"},
}

// RateLimitResult contains the result of a rate limit check.
type RateLimitResult struct {
	Allowed   bool
	Remaining int
	ResetAt   time.Time
	RetryIn   time.Duration
}

// RedisCmdInterface abstracts Redis command execution for rate limiting.
type RedisCmdInterface interface {
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd
}

// ---------------------------------------------------------------------------
// Redis-based distributed rate limiter (tiered, sliding window)
// ---------------------------------------------------------------------------

// RedisRateLimiter provides Redis-based distributed rate limiting with tier support.
type RedisRateLimiter struct {
	redis RedisCmdInterface
}

// NewRedisRateLimiter creates a new Redis-based RateLimiter with the given Redis client.
func NewRedisRateLimiter(redisClient *redis.Client) *RedisRateLimiter {
	return &RedisRateLimiter{redis: redisClient}
}

// getIdentifier extracts the identifier for rate limiting.
// Uses user_id for authenticated requests, IP for anonymous.
func (r *RedisRateLimiter) getIdentifier(c *gin.Context) string {
	if userID, exists := c.Get("user_id"); exists {
		if id, ok := userID.(string); ok && id != "" {
			return id
		}
	}
	return c.ClientIP()
}

// getTier determines the rate limit tier based on user role.
func (r *RedisRateLimiter) getTier(c *gin.Context) RateLimitTier {
	if role, exists := c.Get("user_role"); exists {
		if roleStr, ok := role.(string); ok && roleStr == "admin" {
			return TierAdmin
		}
	}
	if _, exists := c.Get("user_id"); exists {
		return TierUser
	}
	return TierAnonymous
}

// getTierKey returns the appropriate key suffix for the tier.
func (r *RedisRateLimiter) getTierKey(baseKey string, tier RateLimitTier) string {
	switch tier {
	case TierAdmin:
		return strings.Replace(baseKey, "ratelimit:", "ratelimit:admin:", 1)
	case TierUser:
		return strings.Replace(baseKey, "ratelimit:", "ratelimit:user:", 1)
	default:
		return strings.Replace(baseKey, "ratelimit:", "ratelimit:anon:", 1)
	}
}

// Check performs a rate limit check using sliding window algorithm.
// Returns RateLimitResult with remaining requests and reset time.
func (r *RedisRateLimiter) Check(ctx context.Context, config RateLimitConfig, identifier string) (RateLimitResult, error) {
	now := time.Now()
	resetAt := now.Add(config.Window)

	key := fmt.Sprintf("%s:%s", config.Key, identifier)

	// Lua script for atomic sliding window rate limiting
	// Removes expired entries, adds current request, checks count
	script := `
		local key = KEYS[1]
		local now = tonumber(ARGV[1])
		local window = tonumber(ARGV[2])
		local limit = tonumber(ARGV[3])
		local window_start = now - window

		-- Remove expired entries
		redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

		-- Count current requests in window
		local count = redis.call('ZCARD', key)

		if count < limit then
			-- Add new request with current timestamp as score
			redis.call('ZADD', key, now, now .. ':' .. math.random())
			redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
			return {1, limit - count - 1, 0}
		else
			-- Get oldest entry to calculate retry time
			local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
			local retry_in = 0
			if oldest and oldest[2] then
				retry_in = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
			end
			return {0, 0, retry_in}
		end
	`

	cmd := r.redis.Eval(ctx, script, []string{key},
		now.UnixMilli(),
		config.Window.Milliseconds(),
		config.Requests,
	)

	result, err := cmd.Result()
	if err != nil {
		// Fail open - allow request if Redis is unavailable
		return RateLimitResult{
			Allowed: true,
			ResetAt: resetAt,
		}, err
	}

	values, ok := result.([]interface{})
	if !ok || len(values) < 1 {
		return RateLimitResult{Allowed: true, ResetAt: resetAt}, nil
	}

	allowed := values[0].(int64) == 1
	remaining := 0
	retryIn := 0 * time.Second

	if allowed && len(values) > 1 {
		remaining = int(values[1].(int64))
	} else if !allowed && len(values) > 2 {
		retryIn = time.Duration(values[2].(int64)) * time.Second
	}

	return RateLimitResult{
		Allowed:   allowed,
		Remaining: remaining,
		ResetAt:   resetAt,
		RetryIn:   retryIn,
	}, nil
}

// Middleware returns a Gin middleware for rate limiting.
func (r *RedisRateLimiter) Middleware(config RateLimitConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		identifier := r.getIdentifier(c)
		tier := r.getTier(c)

		// Use tier-specific key
		tierKey := r.getTierKey(config.Key, tier)
		tierConfig := RateLimitConfig{
			Requests: config.Requests,
			Window:   config.Window,
			Key:      tierKey,
		}

		result, err := r.Check(c.Request.Context(), tierConfig, identifier)
		if err != nil {
			// Log error but allow request on rate limiter failure
		}

		// Set rate limit headers
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", tierConfig.Requests))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", result.Remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", result.ResetAt.Unix()))

		if !result.Allowed {
			c.Header("Retry-After", fmt.Sprintf("%d", int(result.RetryIn.Seconds())))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded",
				"retry_after": int(result.RetryIn.Seconds()),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// StandardMiddleware returns the standard rate limiting middleware.
func (r *RedisRateLimiter) StandardMiddleware() gin.HandlerFunc {
	config := RateLimitConfig{Requests: 100, Window: time.Minute, Key: "ratelimit:standard"}
	return r.Middleware(config)
}

// SensitiveMiddleware returns stricter rate limiting for sensitive operations.
func (r *RedisRateLimiter) SensitiveMiddleware() gin.HandlerFunc {
	config := RateLimitConfig{Requests: 20, Window: time.Minute, Key: "ratelimit:sensitive"}
	return r.Middleware(config)
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (backwards-compatible with existing router)
// ---------------------------------------------------------------------------

// SimpleLimiter implements a basic token-bucket rate limiter in memory.
// Used for backwards compatibility with existing router.go calls.
type SimpleLimiter struct {
	requests int
	window   time.Duration
	mu       sync.Mutex
	buckets  map[string]*tokenBucket
}

type tokenBucket struct {
	tokens     int
	lastRefill time.Time
}

// NewRateLimiter creates a simple in-memory rate limiter (backwards compatible).
// requests: max requests allowed per window
// window: time window duration
func NewRateLimiter(requests int, window time.Duration) *SimpleLimiter {
	return &SimpleLimiter{
		requests: requests,
		window:   window,
		buckets:  make(map[string]*tokenBucket),
	}
}

// RateLimitMiddleware creates Gin middleware for simple rate limiting.
func RateLimitMiddleware(limiter *SimpleLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use user ID if authenticated, otherwise use IP
		identifier := c.ClientIP()
		if userID, exists := c.Get("user_id"); exists {
			if id, ok := userID.(string); ok && id != "" {
				identifier = id
			}
		}

		if !limiter.Allow(identifier) {
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// Allow checks if a request from the given identifier should be allowed.
func (sl *SimpleLimiter) Allow(identifier string) bool {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	now := time.Now()
	bucket, exists := sl.buckets[identifier]

	if !exists {
		bucket = &tokenBucket{
			tokens:     sl.requests - 1,
			lastRefill: now,
		}
		sl.buckets[identifier] = bucket
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(bucket.lastRefill)
	tokensToAdd := int(elapsed.Seconds() * float64(sl.requests) / sl.window.Seconds())
	if tokensToAdd > 0 {
		bucket.tokens = min(sl.requests, bucket.tokens+tokensToAdd)
		bucket.lastRefill = now
	}

	if bucket.tokens > 0 {
		bucket.tokens--
		return true
	}

	return false
}

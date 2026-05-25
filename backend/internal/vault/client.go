package vault

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Client 与 Agent Vault 通信的客户端
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
	mu         sync.RWMutex
	// 内存缓存：credential_ref → 真实凭据
	cache map[string]map[string]string
}

// NewClient 创建 Agent Vault 客户端
func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		cache: make(map[string]map[string]string),
	}
}

// InjectCredentials 在请求中注入真实凭据
// 这是核心安全流程：AI Agent 传入 credential_ref，Vault 返回真实密钥
func (c *Client) InjectCredentials(ctx context.Context, credentialRef string, request map[string]interface{}) (map[string]interface{}, error) {
	// 第一步：从内存缓存读取（热路径）
	c.mu.RLock()
	if creds, ok := c.cache[credentialRef]; ok {
		c.mu.RUnlock()
		injected := cloneMap(request)
		for k, v := range creds {
			injected["_"+k] = v
		}
		return injected, nil
	}
	c.mu.RUnlock()

	// 第二步：缓存未命中，请求 Vault API
	creds, err := c.fetchFromVault(ctx, credentialRef)
	if err != nil {
		return nil, fmt.Errorf("vault fetch failed for %s: %v", credentialRef, err)
	}

	// 第三步：更新缓存
	c.mu.Lock()
	c.cache[credentialRef] = creds
	c.mu.Unlock()

	// 第四步：注入凭据
	injected := cloneMap(request)
	for k, v := range creds {
		injected["_"+k] = v
	}

	return injected, nil
}

// fetchFromVault 从 Agent Vault 安全读取凭据
func (c *Client) fetchFromVault(ctx context.Context, credentialRef string) (map[string]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("%s/v1/kv/data/cloud/%s", c.baseURL, credentialRef), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Vault-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vault returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data struct {
			Data map[string]string `json:"data"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return result.Data.Data, nil
}

// ClearCache 清除缓存的凭据（密钥轮换时调用）
func (c *Client) ClearCache() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache = make(map[string]map[string]string)
}

// Encrypt 使用 AES-GCM 加密凭据（存储加密）
func Encrypt(plaintext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// Decrypt 使用 AES-GCM 解密密文
func Decrypt(ciphertext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return aesGCM.Open(nil, nonce, ciphertext, nil)
}

// ValidateCredentialRef 验证请求中的 credential_ref 格式
// AI Agent 的请求必须只使用 credential_ref，不允许包含真实密钥
func ValidateCredentialRef(request map[string]interface{}) (string, error) {
	ref, ok := request["credential_ref"].(string)
	if !ok || ref == "" {
		return "", fmt.Errorf("missing credential_ref in request")
	}

	// 安全检查：确保请求中没有直接传入凭据
	forbiddenKeys := []string{
		"client_secret", "api_key", "secret_key",
		"subscription_id", "tenant_id", "client_id",
		"private_key", "access_key", "password",
	}
	for _, key := range forbiddenKeys {
		if _, exists := request[key]; exists {
			return "", fmt.Errorf("security violation: direct credential '%s' found in request", key)
		}
	}

	return ref, nil
}

// InvalidateRequest 立即清除请求中的真实凭据
// 在执行完成后调用，确保凭据不会残留在内存中
func InvalidateRequest(request map[string]interface{}) {
	for key := range request {
		if len(key) > 0 && key[0] == '_' {
			delete(request, key)
		}
	}
}

func cloneMap(m map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}
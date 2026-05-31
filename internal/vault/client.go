package vault

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"sync"
)

type Client struct {
	addr       string
	token      string
	httpClient *http.Client
	mu         sync.RWMutex
}

type Config struct {
	Addr     string
	RoleID   string
	SecretID string
}

func NewClient(cfg Config) *Client {
	return &Client{
		addr:       cfg.Addr,
		httpClient: &http.Client{},
	}
}

func (c *Client) SetToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = token
}

func (c *Client) Token() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.token
}

func (c *Client) rawRequest(method, path string, body []byte) ([]byte, int, error) {
	url := fmt.Sprintf("%s/v1/%s", c.addr, path)

	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if token := c.Token(); token != "" {
		req.Header.Set("X-Vault-Token", token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("reading response: %w", err)
	}

	return respBody, resp.StatusCode, nil
}

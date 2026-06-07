package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"

	"multicloud/internal/cloud/types"
)

type AzureProvider struct {
	subscriptionID string
	tenantID       string
	clientID       string
	clientSecret   string
	httpClient     *http.Client
	tokenCache     *tokenCache
}

type tokenCache struct {
	mu      sync.RWMutex
	token   string
	expires time.Time
}

func (tc *tokenCache) Get() (string, bool) {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	if tc.token != "" && time.Now().Before(tc.expires) {
		return tc.token, true
	}
	return "", false
}

func (tc *tokenCache) Set(token string, duration time.Duration) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.token = token
	tc.expires = time.Now().Add(duration - 1*time.Minute)
}

func NewAzureProvider(creds map[string]string) *AzureProvider {
	return &AzureProvider{
		subscriptionID: creds["subscription_id"],
		tenantID:       creds["tenant_id"],
		clientID:       creds["client_id"],
		clientSecret:   creds["client_secret"],
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		tokenCache:     &tokenCache{},
	}
}

func (p *AzureProvider) GetType() string { return "azure" }

func (p *AzureProvider) getToken(ctx context.Context) (string, error) {
	if cached, ok := p.tokenCache.Get(); ok {
		return cached, nil
	}

	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"resource":      {"https://management.azure.com"},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/token", p.tenantID),
		bytes.NewBufferString(body.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   string `json:"expires_in"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(rawBody, &result); err != nil {
		return "", fmt.Errorf("azure auth: decode failed (status %d): %s", resp.StatusCode, string(rawBody))
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("azure auth: no access_token (status %d, error=%s, description=%s, body=%s)",
			resp.StatusCode, result.Error, result.ErrorDescription, string(rawBody))
	}

	duration := 3600 * time.Second
	if secs := result.ExpiresIn; secs != "" {
		var d int
		fmt.Sscanf(secs, "%d", &d)
		if d > 0 {
			duration = time.Duration(d) * time.Second
		}
	}
	p.tokenCache.Set(result.AccessToken, duration)

	return result.AccessToken, nil
}

func (p *AzureProvider) doAPI(ctx context.Context, method, url string, body io.Reader) ([]byte, error) {
	token, err := p.getToken(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("azure API %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func (p *AzureProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/resources?api-version=2021-04-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}

	var result struct {
		Value []struct {
			ID       string            `json:"id"`
			Name     string            `json:"name"`
			Type     string            `json:"type"`
			Location string            `json:"location"`
			Tags     map[string]string `json:"tags"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var instances []types.Instance
	for _, res := range result.Value {
		parts := splitResourceType(res.Type)
		resourceType := parts[len(parts)-1]

		status := "running"
		if res.Type == "Microsoft.Compute/virtualMachines" {
			status = p.getVMStatus(ctx, res.ID)
		}

		instances = append(instances, types.Instance{
			ID:           res.ID,
			Name:         res.Name,
			CloudType:    "azure",
			Region:       res.Location,
			Status:       status,
			InstanceType: resourceType,
			Spec: map[string]interface{}{
				"type": res.Type,
			},
			Tags: res.Tags,
		})
	}

	return instances, nil
}

func splitResourceType(resourceType string) []string {
	var parts []string
	current := ""
	for _, c := range resourceType {
		if c == '/' {
			if current != "" {
				parts = append(parts, current)
			}
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}

func (p *AzureProvider) getVMStatus(ctx context.Context, resourceID string) string {
	url := fmt.Sprintf("https://management.azure.com%s/instanceView?api-version=2023-03-01", resourceID)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return "unknown"
	}

	var result struct {
		Statuses []struct {
			Code string `json:"code"`
		} `json:"statuses"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "unknown"
	}

	for _, s := range result.Statuses {
		if s.Code == "PowerState/running" {
			return "running"
		}
		if s.Code == "PowerState/deallocated" || s.Code == "PowerState/stopped" {
			return "stopped"
		}
	}

	return "unknown"
}

func (p *AzureProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
}

func (p *AzureProvider) StartInstance(ctx context.Context, id string) error {
	return p.vmAction(ctx, id, "start")
}

func (p *AzureProvider) StopInstance(ctx context.Context, id string) error {
	return p.vmAction(ctx, id, "deallocate")
}

func (p *AzureProvider) RestartInstance(ctx context.Context, id string) error {
	return p.vmAction(ctx, id, "restart")
}

func (p *AzureProvider) vmAction(ctx context.Context, resourceID, action string) error {
	url := fmt.Sprintf("https://management.azure.com%s/%s?api-version=2023-03-01", resourceID, action)
	_, err := p.doAPI(ctx, "POST", url, nil)
	return err
}

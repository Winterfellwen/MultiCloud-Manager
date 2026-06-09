package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
)

type RenderProvider struct {
	apiKey     string
	httpClient *http.Client
}

func NewRenderProvider(creds map[string]string) *RenderProvider {
	return &RenderProvider{
		apiKey:     creds["api_key"],
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

func (p *RenderProvider) GetType() string { return "render" }

type renderService struct {
	ID             string `json:"id"`
	ServiceDetails struct {
		Region string `json:"region"`
		Plan   string `json:"plan"`
		URL    string `json:"url"`
	} `json:"serviceDetails"`
	DashboardUrl string `json:"dashboardUrl"`
}

func (p *RenderProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	var instances []types.Instance

	services, err := p.listServices(ctx)
	if err != nil {
		log.Printf("render: list services: %v", err)
	} else {
		instances = append(instances, services...)
	}

	pgs, err := p.listPostgres(ctx)
	if err != nil {
		log.Printf("render: list postgres: %v", err)
	} else {
		instances = append(instances, pgs...)
	}

	kvs, err := p.listKeyValue(ctx)
	if err != nil {
		log.Printf("render: list key-value: %v", err)
	} else {
		instances = append(instances, kvs...)
	}

	if instances == nil {
		return nil, fmt.Errorf("all Render API calls failed")
	}
	return instances, nil
}

func (p *RenderProvider) listServices(ctx context.Context) ([]types.Instance, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/services?limit=100")
	if err != nil {
		return nil, err
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("services unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		srvData, ok := item["service"]
		if !ok {
			continue
		}
		var s struct {
			ID             string `json:"id"`
			Name           string `json:"name"`
			Slug           string `json:"slug"`
			Type           string `json:"type"`
			State          string `json:"state"`
			Suspended      string `json:"suspended"`
			CreatedAt      string `json:"createdAt"`
			ServiceDetails struct {
				Region string `json:"region"`
				Plan   string `json:"plan"`
				URL    string `json:"url"`
			} `json:"serviceDetails"`
			DashboardUrl string `json:"dashboardUrl"`
		}
		if err := json.Unmarshal(srvData, &s); err != nil {
			continue
		}

		status := "running"
		if s.State == "suspended" || s.State == "deactivated" || s.Suspended != "not_suspended" {
			status = "stopped"
		}

		region := s.ServiceDetails.Region
		if region == "" {
			region = "singapore"
		}

		instances = append(instances, types.Instance{
			ID:           s.ID,
			Name:         s.Name,
			CloudType:    "render",
			Region:       region,
			Status:       status,
			InstanceType: s.Type,
			Spec: map[string]interface{}{
				"plan":          s.ServiceDetails.Plan,
				"url":           s.ServiceDetails.URL,
				"slug":          s.Slug,
				"dashboard_url": s.DashboardUrl,
			},
		})
	}
	return instances, nil
}

func (p *RenderProvider) listPostgres(ctx context.Context) ([]types.Instance, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/postgres?limit=100")
	if err != nil {
		return nil, err
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("postgres unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		pgData, ok := item["postgres"]
		if !ok {
			continue
		}
		var pg struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			Region     string `json:"region"`
			Status     string `json:"status"`
			Plan       string `json:"plan"`
			Version    string `json:"version"`
			Suspended  string `json:"suspended"`
			CreatedAt  string `json:"createdAt"`
		}
		if err := json.Unmarshal(pgData, &pg); err != nil {
			continue
		}

		status := "running"
		if pg.Status != "available" || pg.Suspended != "not_suspended" {
			status = "stopped"
		}

		region := pg.Region
		if region == "" {
			region = "singapore"
		}

		instances = append(instances, types.Instance{
			ID:           pg.ID,
			Name:         pg.Name,
			CloudType:    "render",
			Region:       region,
			Status:       status,
			InstanceType: "postgres",
			Spec: map[string]interface{}{
				"plan":    pg.Plan,
				"version": pg.Version,
			},
		})
	}
	return instances, nil
}

func (p *RenderProvider) listKeyValue(ctx context.Context) ([]types.Instance, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/key-value?limit=100")
	if err != nil {
		return nil, err
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("key-value unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		kvData, ok := item["keyValue"]
		if !ok {
			continue
		}
		var kv struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Region    string `json:"region"`
			Status    string `json:"status"`
			Plan      string `json:"plan"`
			Version   string `json:"version"`
			Suspended string `json:"suspended"`
			CreatedAt string `json:"createdAt"`
		}
		if err := json.Unmarshal(kvData, &kv); err != nil {
			continue
		}

		status := "running"
		if kv.Status != "available" {
			status = "stopped"
		}

		region := kv.Region
		if region == "" {
			region = "singapore"
		}

		instances = append(instances, types.Instance{
			ID:           kv.ID,
			Name:         kv.Name,
			CloudType:    "render",
			Region:       region,
			Status:       status,
			InstanceType: "key_value",
			Spec: map[string]interface{}{
				"plan":    kv.Plan,
				"version": kv.Version,
			},
		})
	}
	return instances, nil
}

func (p *RenderProvider) doGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("render API error %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

func (p *RenderProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
}

func (p *RenderProvider) renderAction(ctx context.Context, actionURL string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", actionURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	if strings.Contains(actionURL, "/deploys") {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("render API error %d on %s", resp.StatusCode, actionURL)
	}
	return nil
}

func (p *RenderProvider) StartInstance(ctx context.Context, id string) error {
	return p.renderAction(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s/resume", id))
}

func (p *RenderProvider) StopInstance(ctx context.Context, id string) error {
	return p.renderAction(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s/suspend", id))
}

func (p *RenderProvider) RestartInstance(ctx context.Context, id string) error {
	return p.renderAction(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s/deploys", id))
}

func (p *RenderProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	// Validate URL host — only allow Render API
	if !strings.HasPrefix(reqURL, "https://api.render.com/") {
		return nil, fmt.Errorf("render: URL must start with https://api.render.com/")
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	respHeaders := map[string]string{}
	for k := range resp.Header {
		lower := strings.ToLower(k)
		if lower == "authorization" || lower == "set-cookie" {
			continue
		}
		respHeaders[k] = resp.Header.Get(k)
	}

	return &types.RawResponse{
		StatusCode: resp.StatusCode,
		Headers:    respHeaders,
		Body:       respBody,
	}, nil
}

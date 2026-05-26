package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"multicloud-manager/internal/cloud/types"
)

type RenderProvider struct {
	apiKey     string
	httpClient *http.Client
}

func NewRenderProvider(creds map[string]string) *RenderProvider {
	return &RenderProvider{
		apiKey:     creds["api_key"],
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *RenderProvider) GetType() string { return "render" }

type renderService struct {
	Service struct {
		ID        string            `json:"id"`
		Name      string            `json:"name"`
		Slug      string            `json:"slug"`
		Type      string            `json:"type"`
		State     string            `json:"state"`
		UpdatedAt string            `json:"updatedAt"`
		CreatedAt string            `json:"createdAt"`
		ServiceDetails struct {
			Region string `json:"region"`
			Plan   string `json:"plan"`
			URL    string `json:"url"`
		} `json:"serviceDetails"`
	} `json:"service"`
}

func (p *RenderProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.render.com/v1/services?limit=100", nil)
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

	var services []renderService
	if err := json.Unmarshal(body, &services); err != nil {
		return nil, err
	}

	var instances []types.Instance
	for _, s := range services {
		status := "running"
		if s.Service.State == "suspended" || s.Service.State == "deactivated" {
			status = "stopped"
		}

		var created time.Time
		if s.Service.CreatedAt != "" {
			created, _ = time.Parse(time.RFC3339, s.Service.CreatedAt)
		}

		region := s.Service.ServiceDetails.Region
		if region == "" {
			region = "oregon"
		}

		instances = append(instances, types.Instance{
			ID:           s.Service.ID,
			Name:         s.Service.Name,
			CloudType:    "render",
			Region:       region,
			Status:       status,
			InstanceType: s.Service.Type,
			Spec: map[string]interface{}{
				"plan":     s.Service.ServiceDetails.Plan,
				"url":      s.Service.ServiceDetails.URL,
				"slug":     s.Service.Slug,
			},
			CreatedAt: created,
		})
	}

	return instances, nil
}

func (p *RenderProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("render GetInstance not implemented")
}

func (p *RenderProvider) StartInstance(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("https://api.render.com/v1/services/%s/resume", id), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (p *RenderProvider) StopInstance(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("https://api.render.com/v1/services/%s/suspend", id), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (p *RenderProvider) RestartInstance(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("https://api.render.com/v1/services/%s/deploys", id),
		nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (p *RenderProvider) CreateInstance(ctx context.Context, params types.CreateInstanceParams) (string, error) {
	return "", fmt.Errorf("render CreateInstance not implemented")
}

func (p *RenderProvider) DeleteInstance(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE",
		fmt.Sprintf("https://api.render.com/v1/services/%s", id), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (p *RenderProvider) ListRegions(ctx context.Context) ([]types.Region, error) {
	return nil, fmt.Errorf("render ListRegions not implemented")
}

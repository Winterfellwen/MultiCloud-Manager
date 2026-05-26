package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

func (p *RenderProvider) GetType() string { return "render" }

type renderService struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Type           string    `json:"type"`
	State          string    `json:"state"`
	Suspended      string    `json:"suspended"`
	UpdatedAt      string    `json:"updatedAt"`
	CreatedAt      string    `json:"createdAt"`
	ServiceDetails struct {
		Region string `json:"region"`
		Plan   string `json:"plan"`
		URL    string `json:"url"`
	} `json:"serviceDetails"`
	DashboardUrl string `json:"dashboardUrl"`
}

type renderPG struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Region         string `json:"region"`
	Status         string `json:"status"`
	Plan           string `json:"plan"`
	Version        string `json:"version"`
	DatabaseName   string `json:"databaseName"`
	DatabaseUser   string `json:"databaseUser"`
	DiskSizeGB     int    `json:"diskSizeGB"`
	HighAvail      bool   `json:"highAvailabilityEnabled"`
	Suspended      string `json:"suspended"`
	DashboardUrl   string `json:"dashboardUrl"`
	CreatedAt      string `json:"createdAt"`
}

type renderKV struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Region       string `json:"region"`
	Status       string `json:"status"`
	Plan         string `json:"plan"`
	Version      string `json:"version"`
	Suspended    string `json:"suspended"`
	DashboardUrl string `json:"dashboardUrl"`
	CreatedAt    string `json:"createdAt"`
}

func (p *RenderProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	instances, err := p.listServices(ctx)
	if err != nil {
		log.Printf("render: list services error: %v", err)
		// continue with empty list so postgres/kv can still be fetched
		instances = nil
	}

	pgs, err := p.listPostgres(ctx)
	if err != nil {
		log.Printf("render: list postgres error: %v", err)
	} else {
		instances = append(instances, pgs...)
	}

	kvs, err := p.listKeyValue(ctx)
	if err != nil {
		log.Printf("render: list key-value error: %v", err)
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
		return nil, fmt.Errorf("services raw unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		srvData, ok := item["service"]
		if !ok {
			continue
		}
		var s renderService
		if err := json.Unmarshal(srvData, &s); err != nil {
			continue
		}
		status := "running"
		if s.State == "suspended" || s.State == "deactivated" || s.Suspended != "not_suspended" {
			status = "stopped"
		}

		var created time.Time
		if s.CreatedAt != "" {
			created, _ = time.Parse(time.RFC3339, s.CreatedAt)
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
			CreatedAt: created,
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
		return nil, fmt.Errorf("postgres raw unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		pgData, ok := item["postgres"]
		if !ok {
			continue
		}
		var pg renderPG
		if err := json.Unmarshal(pgData, &pg); err != nil {
			continue
		}
		status := "running"
		if pg.Status != "available" || pg.Suspended != "not_suspended" {
			status = "stopped"
		}

		var created time.Time
		if pg.CreatedAt != "" {
			created, _ = time.Parse(time.RFC3339, pg.CreatedAt)
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
				"plan":          pg.Plan,
				"version":       pg.Version,
				"database":      pg.DatabaseName,
				"disk_gb":       pg.DiskSizeGB,
				"ha_enabled":    pg.HighAvail,
				"dashboard_url": pg.DashboardUrl,
			},
			CreatedAt: created,
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
		return nil, fmt.Errorf("key-value raw unmarshal: %w", err)
	}

	var instances []types.Instance
	for _, item := range raw {
		kvData, ok := item["keyValue"]
		if !ok {
			continue
		}
		var kv renderKV
		if err := json.Unmarshal(kvData, &kv); err != nil {
			continue
		}
		status := "running"
		if kv.Status != "available" {
			status = "stopped"
		}

		var created time.Time
		if kv.CreatedAt != "" {
			created, _ = time.Parse(time.RFC3339, kv.CreatedAt)
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
				"plan":          kv.Plan,
				"version":       kv.Version,
				"dashboard_url": kv.DashboardUrl,
			},
			CreatedAt: created,
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

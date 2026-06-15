package providers

import (
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

type RenderEventProvider struct {
	apiKey     string
	httpClient *http.Client
}

func NewRenderEventProvider(apiKey string) *RenderEventProvider {
	return &RenderEventProvider{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *RenderEventProvider) SupportedEventTypes() []string {
	return []string{"deploy", "event"}
}

func (p *RenderEventProvider) FetchEvents(ctx context.Context, eventType string, since time.Time) ([]types.CloudEvent, error) {
	switch eventType {
	case "deploy":
		return p.fetchDeployEvents(ctx, since)
	case "event":
		return p.fetchServiceEvents(ctx, since)
	default:
		return nil, fmt.Errorf("render: unsupported event type: %s", eventType)
	}
}

// fetchDeployEvents lists deploys for all services and converts them to CloudEvents
func (p *RenderEventProvider) fetchDeployEvents(ctx context.Context, since time.Time) ([]types.CloudEvent, error) {
	// 1. GET /v1/services?limit=100 to get all services
	body, err := p.doGet(ctx, "https://api.render.com/v1/services?limit=100")
	if err != nil {
		return nil, fmt.Errorf("render events: list services: %w", err)
	}

	var services []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &services); err != nil {
		return nil, fmt.Errorf("render events: unmarshal services: %w", err)
	}

	var events []types.CloudEvent
	for _, svc := range services {
		// 2. GET /v1/services/{id}/deploys?limit=20
		deployBody, err := p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s/deploys?limit=20", svc.ID))
		if err != nil {
			log.Printf("render events: list deploys for %s: %v", svc.Name, err)
			continue
		}

		var deploys []struct {
			ID        string `json:"id"`
			Status    string `json:"status"`
			CreatedAt string `json:"createdAt"`
			UpdatedAt string `json:"updatedAt"`
			Commit    struct {
				ID      string `json:"id"`
				Message string `json:"message"`
			} `json:"commit"`
			DeployURL string `json:"deployUrl"`
		}
		if err := json.Unmarshal(deployBody, &deploys); err != nil {
			log.Printf("render events: unmarshal deploys for %s: %v", svc.Name, err)
			continue
		}

		for _, d := range deploys {
			createdAt, _ := time.Parse(time.RFC3339, d.CreatedAt)
			if createdAt.Before(since) {
				continue
			}

			severity := "info"
			title := fmt.Sprintf("%s deployment", d.Status)
			switch d.Status {
			case "live":
				severity = "ok"
				title = "Deploy succeeded"
			case "build_failed", "update_failed", "live_failed":
				severity = "critical"
				title = "Deploy failed"
			case "build_in_progress", "update_in_progress":
				severity = "info"
				title = "Deploy in progress"
			case "canceled":
				severity = "warning"
				title = "Deploy canceled"
			}

			desc := d.Commit.Message
			if desc == "" {
				desc = fmt.Sprintf("Deploy ID: %s", d.ID)
			}

			events = append(events, types.CloudEvent{
				SourceID:     fmt.Sprintf("render-deploy-%s", d.ID),
				EventType:    "deploy",
				Severity:     severity,
				Title:        title,
				Description:  desc,
				Source:       "render.deploy",
				ResourceID:   svc.ID,
				ResourceName: svc.Name,
				ResourceType: svc.Type,
				EventAt:      createdAt,
				Metadata: map[string]interface{}{
					"deploy_id":  d.ID,
					"status":     d.Status,
					"commit_id":  d.Commit.ID,
					"deploy_url": d.DeployURL,
				},
			})
		}
	}
	return events, nil
}

// fetchServiceEvents lists events for all services
func (p *RenderEventProvider) fetchServiceEvents(ctx context.Context, since time.Time) ([]types.CloudEvent, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/services?limit=100")
	if err != nil {
		return nil, fmt.Errorf("render events: list services: %w", err)
	}

	var services []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &services); err != nil {
		return nil, fmt.Errorf("render events: unmarshal services: %w", err)
	}

	var events []types.CloudEvent
	for _, svc := range services {
		evtBody, err := p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s/events?limit=20", svc.ID))
		if err != nil {
			log.Printf("render events: list events for %s: %v", svc.Name, err)
			continue
		}

		var svcEvents []struct {
			ID        string `json:"id"`
			Type      string `json:"type"`
			CreatedAt string `json:"createdAt"`
			Details   string `json:"details"`
			Level     string `json:"level"`
		}
		if err := json.Unmarshal(evtBody, &svcEvents); err != nil {
			log.Printf("render events: unmarshal events for %s: %v", svc.Name, err)
			continue
		}

		for _, e := range svcEvents {
			createdAt, _ := time.Parse(time.RFC3339, e.CreatedAt)
			if createdAt.Before(since) {
				continue
			}

			severity := "info"
			switch strings.ToLower(e.Level) {
			case "error", "critical":
				severity = "critical"
			case "warning", "warn":
				severity = "warning"
			case "info":
				severity = "info"
			}

			title := e.Type
			if title == "" {
				title = "Service event"
			}

			events = append(events, types.CloudEvent{
				SourceID:     fmt.Sprintf("render-event-%s", e.ID),
				EventType:    "event",
				Severity:     severity,
				Title:        title,
				Description:  e.Details,
				Source:       "render.event",
				ResourceID:   svc.ID,
				ResourceName: svc.Name,
				ResourceType: svc.Type,
				EventAt:      createdAt,
				Metadata: map[string]interface{}{
					"event_id": e.ID,
					"type":     e.Type,
					"level":    e.Level,
				},
			})
		}
	}
	return events, nil
}

func (p *RenderEventProvider) doGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("render events: %s returned %d", url, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return body, nil
}

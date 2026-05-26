package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"multicloud-manager/internal/cloud/types"
)

type AzureProvider struct {
	subscriptionID string
	tenantID       string
	clientID       string
	clientSecret   string
	httpClient     *http.Client
}

func NewAzureProvider(creds map[string]string) *AzureProvider {
	return &AzureProvider{
		subscriptionID: creds["subscription_id"],
		tenantID:       creds["tenant_id"],
		clientID:       creds["client_id"],
		clientSecret:   creds["client_secret"],
		httpClient:     &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *AzureProvider) GetType() string { return "azure" }

func (p *AzureProvider) getToken(ctx context.Context) (string, error) {
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

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("azure auth: no access_token in response")
	}
	return result.AccessToken, nil
}

func (p *AzureProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	token, err := p.getToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("azure auth: %w", err)
	}

	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Compute/virtualMachines?api-version=2023-03-01",
		p.subscriptionID,
	)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

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
		return nil, fmt.Errorf("azure API: %s", string(body))
	}

	var result struct {
		Value []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Location string `json:"location"`
			Tags     map[string]string `json:"tags"`
			Properties struct {
				ProvisioningState string `json:"provisioningState"`
				HardwareProfile   struct {
					VMSize string `json:"vmSize"`
				} `json:"hardwareProfile"`
				StorageProfile struct {
					ImageReference struct {
						Offer string `json:"offer"`
					} `json:"imageReference"`
				} `json:"storageProfile"`
				TimeCreated string `json:"timeCreated"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var instances []types.Instance
	for _, vm := range result.Value {
		status := "running"
		if vm.Properties.ProvisioningState != "Succeeded" {
			status = "stopped"
		}

		var created time.Time
		if vm.Properties.TimeCreated != "" {
			created, _ = time.Parse(time.RFC3339, vm.Properties.TimeCreated)
		}

		instances = append(instances, types.Instance{
			ID:           vm.ID,
			Name:         vm.Name,
			CloudType:    "azure",
			Region:       vm.Location,
			Status:       status,
			InstanceType: vm.Properties.HardwareProfile.VMSize,
			Spec: map[string]interface{}{
				"vmSize": vm.Properties.HardwareProfile.VMSize,
			},
			Tags:      vm.Tags,
			CreatedAt: created,
		})
	}

	return instances, nil
}

func (p *AzureProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("azure GetInstance not implemented")
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
	token, err := p.getToken(ctx)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("https://management.azure.com%s/%s?api-version=2023-03-01", resourceID, action)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("azure action %s failed: %s", action, string(body))
	}
	return nil
}

func (p *AzureProvider) CreateInstance(ctx context.Context, params types.CreateInstanceParams) (string, error) {
	return "", fmt.Errorf("azure CreateInstance not implemented")
}

func (p *AzureProvider) DeleteInstance(ctx context.Context, id string) error {
	return fmt.Errorf("azure DeleteInstance not implemented")
}

func (p *AzureProvider) ListRegions(ctx context.Context) ([]types.Region, error) {
	return nil, fmt.Errorf("azure ListRegions not implemented")
}

package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
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

func (p *AzureProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	base := "https://portal.azure.com"
	switch resourceType {
	case types.ResourceTypeInstance:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeVolume:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeNetwork:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeDatabase:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeLoadBalancer:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeBucket:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeCluster:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeFunction:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeDNSZone:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	case types.ResourceTypeCertificate:
		return fmt.Sprintf("%s/#@/resource/%s", base, id)
	default:
		return base
	}
}

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

// getTokenForResource obtains an OAuth2 token for the specified audience resource.
// For management.azure.com it delegates to getToken (which caches). For other
// resources (e.g. vault.azure.net) it performs a fresh token request.
func (p *AzureProvider) getTokenForResource(ctx context.Context, resource string) (string, error) {
	if resource == "https://management.azure.com" {
		return p.getToken(ctx)
	}

	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"resource":      {resource},
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
		return "", fmt.Errorf("azure auth (%s): decode failed (status %d): %s", resource, resp.StatusCode, string(rawBody))
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("azure auth (%s): no access_token (status %d, error=%s, description=%s)",
			resource, resp.StatusCode, result.Error, result.ErrorDescription)
	}
	return result.AccessToken, nil
}

// doVaultAPI makes a request to the Azure Key Vault data plane using a vault-scoped token.
func (p *AzureProvider) doVaultAPI(ctx context.Context, method, url string, body io.Reader) ([]byte, error) {
	token, err := p.getTokenForResource(ctx, "https://vault.azure.net")
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
		return nil, fmt.Errorf("azure vault API %d: %s", resp.StatusCode, string(respBody))
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

		// Extract resource group from Azure resource ID
		resourceGroup := extractResourceGroup(res.ID)

		spec := map[string]interface{}{
			"type": res.Type,
		}
		if resourceGroup != "" {
			spec["resource_group"] = resourceGroup
		}
		// Extract provider namespace for categorization
		if len(parts) >= 1 {
			spec["provider_ns"] = parts[0]
		}

		instances = append(instances, types.Instance{
			ID:           res.ID,
			Name:         res.Name,
			CloudType:    "azure",
			Region:       res.Location,
			Status:       status,
			InstanceType: resourceType,
			Spec:         spec,
			Tags:         res.Tags,
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

// extractResourceGroup extracts the resource group name from an Azure resource ID.
// Azure resource IDs have the format:
// /subscriptions/{sub}/resourceGroups/{rg}/providers/{type}/{name}
func extractResourceGroup(resourceID string) string {
	parts := splitResourceType(resourceID)
	for i, p := range parts {
		if p == "resourceGroups" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
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
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2023-03-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get instance: %w", err)
	}

	var vm struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			ProvisioningState string `json:"provisioningState"`
			HardwareProfile   struct {
				VMSize string `json:"vmSize"`
			} `json:"hardwareProfile"`
			StorageProfile struct {
				ImageReference struct {
					Publisher string `json:"publisher"`
					Offer     string `json:"offer"`
					Sku       string `json:"sku"`
					Version   string `json:"version"`
				} `json:"imageReference"`
			} `json:"storageProfile"`
			OsProfile struct {
				ComputerName  string `json:"computerName"`
				AdminUsername string `json:"adminUsername"`
			} `json:"osProfile"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &vm); err != nil {
		return nil, err
	}

	status := p.getVMStatus(ctx, id)
	resourceGroup := extractResourceGroup(id)

	spec := map[string]interface{}{
		"vm_size":            vm.Properties.HardwareProfile.VMSize,
		"provisioning_state": vm.Properties.ProvisioningState,
	}
	if resourceGroup != "" {
		spec["resource_group"] = resourceGroup
	}
	if img := vm.Properties.StorageProfile.ImageReference; img.Publisher != "" {
		spec["image"] = fmt.Sprintf("%s/%s/%s/%s", img.Publisher, img.Offer, img.Sku, img.Version)
	}
	if vm.Properties.OsProfile.ComputerName != "" {
		spec["computer_name"] = vm.Properties.OsProfile.ComputerName
	}

	log.Printf("azure: got instance %s (status=%s)", vm.Name, status)
	return &types.Instance{
		ID:           vm.ID,
		Name:         vm.Name,
		CloudType:    "azure",
		Region:       vm.Location,
		Status:       status,
		InstanceType: "virtual_machine",
		Spec:         spec,
		Tags:         vm.Tags,
	}, nil
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

func (p *AzureProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	// Validate URL host — only allow Azure management endpoints
	if !strings.HasPrefix(reqURL, "https://management.azure.com") &&
		!strings.HasPrefix(reqURL, "https://graph.microsoft.com") {
		return nil, fmt.Errorf("azure: URL must start with management.azure.com or graph.microsoft.com")
	}

	token, err := p.getToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("azure auth: %w", err)
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max
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

// ---------------------------------------------------------------------------
// ListVolumes
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Compute/disks?api-version=2022-07-02",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list volumes: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				DiskSizeGB      int    `json:"diskSizeGB"`
				DiskIOPSReadWrite int   `json:"diskIOPSReadWrite,omitempty"`
				DiskState       string `json:"diskState"`
				Encryption      struct {
					Type string `json:"type"`
				} `json:"encryption"`
			} `json:"properties"`
			Sku struct {
				Name string `json:"name"`
			} `json:"sku"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	volumes := make([]types.Volume, 0, len(result.Value))
	for _, d := range result.Value {
		encrypted := d.Properties.Encryption.Type != ""

		spec := map[string]interface{}{
			"sku":             d.Sku.Name,
			"encryption_type": d.Properties.Encryption.Type,
		}
		if d.Properties.DiskIOPSReadWrite > 0 {
			spec["disk_iops_read_write"] = d.Properties.DiskIOPSReadWrite
		}

		volumes = append(volumes, types.Volume{
			ID:         d.ID,
			Name:       d.Name,
			CloudType:  "azure",
			Region:     d.Location,
			Status:     d.Properties.DiskState,
			VolumeType: d.Sku.Name,
			SizeGB:     d.Properties.DiskSizeGB,
			IOPS:       d.Properties.DiskIOPSReadWrite,
			Encrypted:  encrypted,
			Spec:       spec,
			Tags:       d.Tags,
		})
	}

	log.Printf("azure: listed %d volumes", len(volumes))
	return volumes, nil
}

// ---------------------------------------------------------------------------
// ListNetworks
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Network/virtualNetworks?api-version=2023-05-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list networks: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				AddressSpace struct {
					AddressPrefixes []string `json:"addressPrefixes"`
				} `json:"addressSpace"`
				Subnets           []interface{} `json:"subnets"`
				ProvisioningState string         `json:"provisioningState"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	networks := make([]types.Network, 0, len(result.Value))
	for _, vnet := range result.Value {
		cidr := ""
		if len(vnet.Properties.AddressSpace.AddressPrefixes) > 0 {
			cidr = vnet.Properties.AddressSpace.AddressPrefixes[0]
		}

		spec := map[string]interface{}{
			"provisioning_state": vnet.Properties.ProvisioningState,
		}
		if len(vnet.Properties.AddressSpace.AddressPrefixes) > 0 {
			spec["address_prefixes"] = vnet.Properties.AddressSpace.AddressPrefixes
		}
		if len(vnet.Properties.Subnets) > 0 {
			spec["subnet_count"] = len(vnet.Properties.Subnets)
			spec["subnets"] = vnet.Properties.Subnets
		}

		networks = append(networks, types.Network{
			ID:          vnet.ID,
			Name:        vnet.Name,
			CloudType:   "azure",
			Region:      vnet.Location,
			Status:      vnet.Properties.ProvisioningState,
			NetworkType: "virtual_network",
			CIDR:        cidr,
			Spec:        spec,
			Tags:        vnet.Tags,
		})
	}

	log.Printf("azure: listed %d virtual networks", len(networks))
	return networks, nil
}

// ---------------------------------------------------------------------------
// ListDatabases
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	serversURL := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Sql/servers?api-version=2022-05-01-preview",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", serversURL, nil)
	if err != nil {
		return nil, fmt.Errorf("list sql servers: %w", err)
	}

	var serversResult struct {
		Value []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Location string `json:"location"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &serversResult); err != nil {
		return nil, err
	}

	var databases []types.Database
	for _, server := range serversResult.Value {
		dbsURL := fmt.Sprintf("%s/databases?api-version=2022-05-01-preview", server.ID)
		dbsBody, err := p.doAPI(ctx, "GET", dbsURL, nil)
		if err != nil {
			log.Printf("azure: list databases for server %s: %v", server.Name, err)
			continue
		}

		var dbsResult struct {
			Value []struct {
				ID         string            `json:"id"`
				Name       string            `json:"name"`
				Location   string            `json:"location"`
				Tags       map[string]string `json:"tags"`
				Properties struct {
					Status string `json:"status"`
				} `json:"properties"`
				Sku struct {
					Tier string `json:"tier"`
					Name string `json:"name"`
				} `json:"sku"`
			} `json:"value"`
		}
		if err := json.Unmarshal(dbsBody, &dbsResult); err != nil {
			log.Printf("azure: parse databases for %s: %v", server.Name, err)
			continue
		}

		for _, db := range dbsResult.Value {
			databases = append(databases, types.Database{
				ID:         db.ID,
				Name:       db.Name,
				CloudType:  "azure",
				Region:     db.Location,
				Status:     db.Properties.Status,
				Engine:     "sql",
				InstanceCls: db.Sku.Tier,
				Spec: map[string]interface{}{
					"server_name": server.Name,
					"sku_name":    db.Sku.Name,
					"sku_tier":    db.Sku.Tier,
				},
				Tags: db.Tags,
			})
		}
	}

	log.Printf("azure: listed %d databases", len(databases))
	return databases, nil
}

// ---------------------------------------------------------------------------
// ListLoadBalancers
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Network/loadBalancers?api-version=2023-05-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list load balancers: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Sku        *struct {
				Name string `json:"name"`
			} `json:"sku"`
			Properties struct {
				ProvisioningState       string        `json:"provisioningState"`
				FrontendIPConfigurations []interface{} `json:"frontendIPConfigurations"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	lbs := make([]types.LoadBalancer, 0, len(result.Value))
	for _, lb := range result.Value {
		spec := map[string]interface{}{
			"provisioning_state": lb.Properties.ProvisioningState,
		}
		skuName := ""
		if lb.Sku != nil {
			skuName = lb.Sku.Name
			spec["sku"] = skuName
		}
		scheme := ""
		if len(lb.Properties.FrontendIPConfigurations) > 0 {
			spec["frontend_ip_count"] = len(lb.Properties.FrontendIPConfigurations)
			spec["frontend_ip_configurations"] = lb.Properties.FrontendIPConfigurations
		}

		lbs = append(lbs, types.LoadBalancer{
			ID:        lb.ID,
			Name:      lb.Name,
			CloudType: "azure",
			Region:    lb.Location,
			Status:    lb.Properties.ProvisioningState,
			LBType:    skuName,
			Scheme:    scheme,
			Spec:      spec,
			Tags:      lb.Tags,
		})
	}

	log.Printf("azure: listed %d load balancers", len(lbs))
	return lbs, nil
}

// ---------------------------------------------------------------------------
// ListBuckets
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Storage/storageAccounts?api-version=2022-09-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list storage accounts: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Kind       string            `json:"kind"`
			Sku        *struct {
				Name string `json:"name"`
			} `json:"sku"`
			Properties struct {
				ProvisioningState string `json:"provisioningState"`
				PrimaryEndpoints  *struct {
					Blob  string `json:"blob"`
					Table string `json:"table"`
					File  string `json:"file"`
					Queue string `json:"queue"`
				} `json:"primaryEndpoints"`
				Encryption *struct {
					KeySource string `json:"keySource"`
					Services  *struct {
						Blob *struct {
							Enabled bool `json:"enabled"`
						} `json:"blob"`
						File *struct {
							Enabled bool `json:"enabled"`
						} `json:"file"`
					} `json:"services"`
				} `json:"encryption"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	buckets := make([]types.Bucket, 0, len(result.Value))
	for _, sa := range result.Value {
		encrypted := sa.Properties.Encryption != nil && sa.Properties.Encryption.KeySource != ""

		spec := map[string]interface{}{
			"kind":                sa.Kind,
			"provisioning_state":  sa.Properties.ProvisioningState,
		}
		if sa.Sku != nil {
			spec["sku"] = sa.Sku.Name
		}
		if sa.Properties.PrimaryEndpoints != nil {
			spec["primary_endpoints"] = sa.Properties.PrimaryEndpoints
		}
		if sa.Properties.Encryption != nil {
			spec["encryption_key_source"] = sa.Properties.Encryption.KeySource
		}

		buckets = append(buckets, types.Bucket{
			ID:         sa.ID,
			Name:       sa.Name,
			CloudType:  "azure",
			Region:     sa.Location,
			Status:     sa.Properties.ProvisioningState,
			StorageCls: func() string { if sa.Sku != nil { return sa.Sku.Name }; return "" }(),
			Encrypted:  encrypted,
			Spec:       spec,
			Tags:       sa.Tags,
		})
	}

	log.Printf("azure: listed %d storage accounts", len(buckets))
	return buckets, nil
}

// ---------------------------------------------------------------------------
// ListClusters
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.ContainerService/managedClusters?api-version=2023-08-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list clusters: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				ProvisioningState  string `json:"provisioningState"`
				KubernetesVersion  string `json:"kubernetesVersion"`
				AgentPoolProfiles  []struct {
					Name    string `json:"name"`
					Count   int    `json:"count"`
					VMSize  string `json:"vmSize"`
					OsType  string `json:"osType"`
				} `json:"agentPoolProfiles"`
				DNSPrefix string `json:"dnsPrefix"`
				Fqdn      string `json:"fqdn"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	clusters := make([]types.Cluster, 0, len(result.Value))
	for _, aks := range result.Value {
		nodeCount := 0
		profiles := make([]map[string]interface{}, 0, len(aks.Properties.AgentPoolProfiles))
		for _, p := range aks.Properties.AgentPoolProfiles {
			nodeCount += p.Count
			profiles = append(profiles, map[string]interface{}{
				"name":    p.Name,
				"count":   p.Count,
				"vm_size": p.VMSize,
				"os_type": p.OsType,
			})
		}

		spec := map[string]interface{}{
			"kubernetes_version": aks.Properties.KubernetesVersion,
			"provisioning_state": aks.Properties.ProvisioningState,
			"agent_pool_profiles": profiles,
		}
		if aks.Properties.DNSPrefix != "" {
			spec["dns_prefix"] = aks.Properties.DNSPrefix
		}
		if aks.Properties.Fqdn != "" {
			spec["fqdn"] = aks.Properties.Fqdn
		}

		clusters = append(clusters, types.Cluster{
			ID:          aks.ID,
			Name:        aks.Name,
			CloudType:   "azure",
			Region:      aks.Location,
			Status:      aks.Properties.ProvisioningState,
			ClusterType: "aks",
			Version:     aks.Properties.KubernetesVersion,
			NodeCount:   nodeCount,
			Spec:        spec,
			Tags:        aks.Tags,
		})
	}

	log.Printf("azure: listed %d AKS clusters", len(clusters))
	return clusters, nil
}

// ---------------------------------------------------------------------------
// ListFunctions
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Web/sites?api-version=2022-03-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list function apps: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Kind       string            `json:"kind"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				State      string `json:"state"`
				SiteConfig struct {
					LinuxFxVersion      string `json:"linuxFxVersion"`
					NetFrameworkVersion string `json:"netFrameworkVersion"`
					NodeVersion         string `json:"nodeVersion"`
					PythonVersion       string `json:"pythonVersion"`
					PowerShellVersion   string `json:"powerShellVersion"`
					Runtime             string `json:"runtime"`
					AlwaysOn            bool   `json:"alwaysOn"`
				} `json:"siteConfig"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	functions := make([]types.Function, 0)
	for _, site := range result.Value {
		if !strings.Contains(site.Kind, "functionapp") {
			continue
		}

		// Determine runtime from site config
		runtime := ""
		if site.Properties.SiteConfig.LinuxFxVersion != "" {
			runtime = site.Properties.SiteConfig.LinuxFxVersion
		} else if site.Properties.SiteConfig.PythonVersion != "" {
			runtime = "python|" + site.Properties.SiteConfig.PythonVersion
		} else if site.Properties.SiteConfig.NodeVersion != "" {
			runtime = "node|" + site.Properties.SiteConfig.NodeVersion
		} else if site.Properties.SiteConfig.NetFrameworkVersion != "" {
			runtime = "dotnet|" + site.Properties.SiteConfig.NetFrameworkVersion
		} else if site.Properties.SiteConfig.PowerShellVersion != "" {
			runtime = "powershell|" + site.Properties.SiteConfig.PowerShellVersion
		}

		spec := map[string]interface{}{
			"kind":           site.Kind,
			"state":          site.Properties.State,
			"linux_fx_version": site.Properties.SiteConfig.LinuxFxVersion,
			"always_on":      site.Properties.SiteConfig.AlwaysOn,
		}

		functions = append(functions, types.Function{
			ID:        site.ID,
			Name:      site.Name,
			CloudType: "azure",
			Region:    site.Location,
			Status:    site.Properties.State,
			Runtime:   runtime,
			Spec:      spec,
			Tags:      site.Tags,
		})
	}

	log.Printf("azure: listed %d function apps", len(functions))
	return functions, nil
}

// ---------------------------------------------------------------------------
// ListDNSZones
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	url := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.Network/dnsZones?api-version=2018-05-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("list dns zones: %w", err)
	}

	var result struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				NumberOfRecordSets     int64 `json:"numberOfRecordSets"`
				MaxNumberOfRecordSets  int64 `json:"maxNumberOfRecordSets"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	zones := make([]types.DNSZone, 0, len(result.Value))
	for _, z := range result.Value {
		spec := map[string]interface{}{
			"max_number_of_record_sets": z.Properties.MaxNumberOfRecordSets,
			"location":                  z.Location,
		}

		zones = append(zones, types.DNSZone{
			ID:          z.ID,
			Name:        z.Name,
			CloudType:   "azure",
			Region:      z.Location,
			Status:      "active",
			ZoneType:    "public",
			RecordCount: int(z.Properties.NumberOfRecordSets),
			Spec:        spec,
			Tags:        z.Tags,
		})
	}

	log.Printf("azure: listed %d DNS zones", len(zones))
	return zones, nil
}

// ---------------------------------------------------------------------------
// ListCertificates
// ---------------------------------------------------------------------------

func (p *AzureProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	vaultsURL := fmt.Sprintf(
		"https://management.azure.com/subscriptions/%s/providers/Microsoft.KeyVault/vaults?api-version=2022-07-01",
		p.subscriptionID,
	)
	body, err := p.doAPI(ctx, "GET", vaultsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("list key vaults: %w", err)
	}

	var vaultsResult struct {
		Value []struct {
			ID         string            `json:"id"`
			Name       string            `json:"name"`
			Location   string            `json:"location"`
			Tags       map[string]string `json:"tags"`
			Properties struct {
				Sku struct {
					Family string `json:"family"`
					Name   string `json:"name"`
				} `json:"sku"`
				TenantID string `json:"tenantId"`
				VaultURI string `json:"vaultUri"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &vaultsResult); err != nil {
		return nil, err
	}

	var certs []types.Certificate
	seen := make(map[string]bool)

	for _, vault := range vaultsResult.Value {
		vaultURI := strings.TrimRight(vault.Properties.VaultURI, "/")
		if vaultURI == "" {
			continue
		}

		listURL := fmt.Sprintf("%s/certificates?api-version=7.4&maxresults=25", vaultURI)
		listBody, err := p.doVaultAPI(ctx, "GET", listURL, nil)
		if err != nil {
			log.Printf("azure: list certificates for vault %s: %v", vault.Name, err)
			continue
		}

		var listResult struct {
			Value []struct {
				ID     string            `json:"id"`
				X5t    string            `json:"x5t"`
				Tags   map[string]string `json:"tags"`
				Attributes struct {
					Enabled bool   `json:"enabled"`
					Exp     *int64 `json:"exp,omitempty"`
					Nbf     *int64 `json:"nbf,omitempty"`
				} `json:"attributes"`
			} `json:"value"`
		}
		if err := json.Unmarshal(listBody, &listResult); err != nil {
			log.Printf("azure: parse cert list for %s: %v", vault.Name, err)
			continue
		}

		for _, c := range listResult.Value {
			if seen[c.ID] {
				continue
			}
			seen[c.ID] = true

			status := "unknown"
			if c.Attributes.Enabled {
				status = "active"
			} else {
				status = "disabled"
			}

			var notBefore, notAfter string
			if c.Attributes.Nbf != nil {
				notBefore = time.Unix(*c.Attributes.Nbf, 0).UTC().Format(time.RFC3339)
			}
			if c.Attributes.Exp != nil {
				notAfter = time.Unix(*c.Attributes.Exp, 0).UTC().Format(time.RFC3339)
			}

			certName := extractCertNameFromURL(c.ID)

			certs = append(certs, types.Certificate{
				ID:        c.ID,
				Name:      certName,
				CloudType: "azure",
				Region:    vault.Location,
				Status:    status,
				NotBefore: notBefore,
				NotAfter:  notAfter,
				Spec: map[string]interface{}{
					"vault_name": vault.Name,
					"thumbprint": c.X5t,
					"vault_sku":  vault.Properties.Sku.Name,
					"tenant_id":  vault.Properties.TenantID,
				},
				Tags: c.Tags,
			})
		}
	}

	log.Printf("azure: listed %d certificates", len(certs))
	return certs, nil
}

// extractCertNameFromURL extracts the certificate name from a Key Vault certificate URL.
// Input:  https://myvault.vault.azure.net/certificates/mycert/abc123
// Output: mycert
func extractCertNameFromURL(certURL string) string {
	if !strings.Contains(certURL, "/certificates/") {
		return ""
	}
	parts := strings.Split(certURL, "/certificates/")
	if len(parts) < 2 {
		return ""
	}
	namePart := strings.Split(parts[1], "/")[0]
	return namePart
}

// ---------------------------------------------------------------------------
// GetVolume
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetVolume(ctx context.Context, id string) (*types.Volume, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2022-07-02", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get volume: %w", err)
	}

	var d struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			DiskSizeGB      int    `json:"diskSizeGB"`
			DiskIOPSReadWrite int   `json:"diskIOPSReadWrite,omitempty"`
			DiskState       string `json:"diskState"`
			Encryption      struct {
				Type string `json:"type"`
			} `json:"encryption"`
		} `json:"properties"`
		Sku struct {
			Name string `json:"name"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, err
	}

	encrypted := d.Properties.Encryption.Type != ""

	spec := map[string]interface{}{
		"sku":             d.Sku.Name,
		"encryption_type": d.Properties.Encryption.Type,
	}
	if d.Properties.DiskIOPSReadWrite > 0 {
		spec["disk_iops_read_write"] = d.Properties.DiskIOPSReadWrite
	}

	log.Printf("azure: got volume %s", d.Name)
	return &types.Volume{
		ID:         d.ID,
		Name:       d.Name,
		CloudType:  "azure",
		Region:     d.Location,
		Status:     d.Properties.DiskState,
		VolumeType: d.Sku.Name,
		SizeGB:     d.Properties.DiskSizeGB,
		IOPS:       d.Properties.DiskIOPSReadWrite,
		Encrypted:  encrypted,
		Spec:       spec,
		Tags:       d.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetNetwork
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetNetwork(ctx context.Context, id string) (*types.Network, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2023-05-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get network: %w", err)
	}

	var vnet struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			AddressSpace struct {
				AddressPrefixes []string `json:"addressPrefixes"`
			} `json:"addressSpace"`
			Subnets           []interface{} `json:"subnets"`
			ProvisioningState string         `json:"provisioningState"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &vnet); err != nil {
		return nil, err
	}

	cidr := ""
	if len(vnet.Properties.AddressSpace.AddressPrefixes) > 0 {
		cidr = vnet.Properties.AddressSpace.AddressPrefixes[0]
	}

	spec := map[string]interface{}{
		"provisioning_state": vnet.Properties.ProvisioningState,
	}
	if len(vnet.Properties.AddressSpace.AddressPrefixes) > 0 {
		spec["address_prefixes"] = vnet.Properties.AddressSpace.AddressPrefixes
	}
	if len(vnet.Properties.Subnets) > 0 {
		spec["subnet_count"] = len(vnet.Properties.Subnets)
		spec["subnets"] = vnet.Properties.Subnets
	}

	log.Printf("azure: got network %s", vnet.Name)
	return &types.Network{
		ID:          vnet.ID,
		Name:        vnet.Name,
		CloudType:   "azure",
		Region:      vnet.Location,
		Status:      vnet.Properties.ProvisioningState,
		NetworkType: "virtual_network",
		CIDR:        cidr,
		Spec:        spec,
		Tags:        vnet.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetDatabase
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetDatabase(ctx context.Context, id string) (*types.Database, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2022-05-01-preview", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get database: %w", err)
	}

	var db struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			Status string `json:"status"`
		} `json:"properties"`
		Sku *struct {
			Tier string `json:"tier"`
			Name string `json:"name"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(body, &db); err != nil {
		return nil, err
	}

	instanceCls := ""
	skuName := ""
	if db.Sku != nil {
		instanceCls = db.Sku.Tier
		skuName = db.Sku.Name
	}

	log.Printf("azure: got database %s", db.Name)
	return &types.Database{
		ID:          db.ID,
		Name:        db.Name,
		CloudType:   "azure",
		Region:      db.Location,
		Status:      db.Properties.Status,
		Engine:      "sql",
		InstanceCls: instanceCls,
		Spec: map[string]interface{}{
			"sku_name": skuName,
			"sku_tier": instanceCls,
		},
		Tags: db.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetLoadBalancer
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetLoadBalancer(ctx context.Context, id string) (*types.LoadBalancer, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2023-05-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get load balancer: %w", err)
	}

	var lb struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Sku        *struct {
			Name string `json:"name"`
		} `json:"sku"`
		Properties struct {
			ProvisioningState       string        `json:"provisioningState"`
			FrontendIPConfigurations []interface{} `json:"frontendIPConfigurations"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &lb); err != nil {
		return nil, err
	}

	skuName := ""
	spec := map[string]interface{}{
		"provisioning_state": lb.Properties.ProvisioningState,
	}
	if lb.Sku != nil {
		skuName = lb.Sku.Name
		spec["sku"] = skuName
	}
	if len(lb.Properties.FrontendIPConfigurations) > 0 {
		spec["frontend_ip_count"] = len(lb.Properties.FrontendIPConfigurations)
		spec["frontend_ip_configurations"] = lb.Properties.FrontendIPConfigurations
	}

	log.Printf("azure: got load balancer %s", lb.Name)
	return &types.LoadBalancer{
		ID:        lb.ID,
		Name:      lb.Name,
		CloudType: "azure",
		Region:    lb.Location,
		Status:    lb.Properties.ProvisioningState,
		LBType:    skuName,
		Spec:      spec,
		Tags:      lb.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetBucket
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetBucket(ctx context.Context, id string) (*types.Bucket, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2022-09-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get storage account: %w", err)
	}

	var sa struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Kind       string            `json:"kind"`
		Sku        *struct {
			Name string `json:"name"`
		} `json:"sku"`
		Properties struct {
			ProvisioningState string `json:"provisioningState"`
			PrimaryEndpoints  *struct {
				Blob  string `json:"blob"`
				Table string `json:"table"`
				File  string `json:"file"`
				Queue string `json:"queue"`
			} `json:"primaryEndpoints"`
			Encryption *struct {
				KeySource string `json:"keySource"`
			} `json:"encryption"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &sa); err != nil {
		return nil, err
	}

	encrypted := sa.Properties.Encryption != nil && sa.Properties.Encryption.KeySource != ""

	spec := map[string]interface{}{
		"kind":               sa.Kind,
		"provisioning_state": sa.Properties.ProvisioningState,
	}
	if sa.Sku != nil {
		spec["sku"] = sa.Sku.Name
	}
	if sa.Properties.PrimaryEndpoints != nil {
		spec["primary_endpoints"] = sa.Properties.PrimaryEndpoints
	}
	if sa.Properties.Encryption != nil {
		spec["encryption_key_source"] = sa.Properties.Encryption.KeySource
	}

	log.Printf("azure: got storage account %s", sa.Name)
	return &types.Bucket{
		ID:         sa.ID,
		Name:       sa.Name,
		CloudType:  "azure",
		Region:     sa.Location,
		Status:     sa.Properties.ProvisioningState,
		StorageCls: func() string { if sa.Sku != nil { return sa.Sku.Name }; return "" }(),
		Encrypted:  encrypted,
		Spec:       spec,
		Tags:       sa.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetCluster
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetCluster(ctx context.Context, id string) (*types.Cluster, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2023-08-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get cluster: %w", err)
	}

	var aks struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			ProvisioningState  string `json:"provisioningState"`
			KubernetesVersion  string `json:"kubernetesVersion"`
			AgentPoolProfiles  []struct {
				Name    string `json:"name"`
				Count   int    `json:"count"`
				VMSize  string `json:"vmSize"`
				OsType  string `json:"osType"`
			} `json:"agentPoolProfiles"`
			DNSPrefix string `json:"dnsPrefix"`
			Fqdn      string `json:"fqdn"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &aks); err != nil {
		return nil, err
	}

	nodeCount := 0
	profiles := make([]map[string]interface{}, 0, len(aks.Properties.AgentPoolProfiles))
	for _, p := range aks.Properties.AgentPoolProfiles {
		nodeCount += p.Count
		profiles = append(profiles, map[string]interface{}{
			"name":    p.Name,
			"count":   p.Count,
			"vm_size": p.VMSize,
			"os_type": p.OsType,
		})
	}

	spec := map[string]interface{}{
		"kubernetes_version":  aks.Properties.KubernetesVersion,
		"provisioning_state":  aks.Properties.ProvisioningState,
		"agent_pool_profiles": profiles,
	}
	if aks.Properties.DNSPrefix != "" {
		spec["dns_prefix"] = aks.Properties.DNSPrefix
	}
	if aks.Properties.Fqdn != "" {
		spec["fqdn"] = aks.Properties.Fqdn
	}

	log.Printf("azure: got cluster %s", aks.Name)
	return &types.Cluster{
		ID:          aks.ID,
		Name:        aks.Name,
		CloudType:   "azure",
		Region:      aks.Location,
		Status:      aks.Properties.ProvisioningState,
		ClusterType: "aks",
		Version:     aks.Properties.KubernetesVersion,
		NodeCount:   nodeCount,
		Spec:        spec,
		Tags:        aks.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetFunction
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetFunction(ctx context.Context, id string) (*types.Function, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2022-03-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get function app: %w", err)
	}

	var site struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Kind       string            `json:"kind"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			State      string `json:"state"`
			SiteConfig struct {
				LinuxFxVersion      string `json:"linuxFxVersion"`
				NetFrameworkVersion string `json:"netFrameworkVersion"`
				NodeVersion         string `json:"nodeVersion"`
				PythonVersion       string `json:"pythonVersion"`
				PowerShellVersion   string `json:"powerShellVersion"`
				AlwaysOn            bool   `json:"alwaysOn"`
			} `json:"siteConfig"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &site); err != nil {
		return nil, err
	}

	runtime := ""
	if site.Properties.SiteConfig.LinuxFxVersion != "" {
		runtime = site.Properties.SiteConfig.LinuxFxVersion
	} else if site.Properties.SiteConfig.PythonVersion != "" {
		runtime = "python|" + site.Properties.SiteConfig.PythonVersion
	} else if site.Properties.SiteConfig.NodeVersion != "" {
		runtime = "node|" + site.Properties.SiteConfig.NodeVersion
	} else if site.Properties.SiteConfig.NetFrameworkVersion != "" {
		runtime = "dotnet|" + site.Properties.SiteConfig.NetFrameworkVersion
	} else if site.Properties.SiteConfig.PowerShellVersion != "" {
		runtime = "powershell|" + site.Properties.SiteConfig.PowerShellVersion
	}

	spec := map[string]interface{}{
		"kind":              site.Kind,
		"state":             site.Properties.State,
		"linux_fx_version":  site.Properties.SiteConfig.LinuxFxVersion,
		"always_on":         site.Properties.SiteConfig.AlwaysOn,
	}

	log.Printf("azure: got function %s", site.Name)
	return &types.Function{
		ID:        site.ID,
		Name:      site.Name,
		CloudType: "azure",
		Region:    site.Location,
		Status:    site.Properties.State,
		Runtime:   runtime,
		Spec:      spec,
		Tags:      site.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetDNSZone
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetDNSZone(ctx context.Context, id string) (*types.DNSZone, error) {
	url := fmt.Sprintf("https://management.azure.com%s?api-version=2018-05-01", id)
	body, err := p.doAPI(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("get dns zone: %w", err)
	}

	var z struct {
		ID         string            `json:"id"`
		Name       string            `json:"name"`
		Location   string            `json:"location"`
		Tags       map[string]string `json:"tags"`
		Properties struct {
			NumberOfRecordSets    int64 `json:"numberOfRecordSets"`
			MaxNumberOfRecordSets int64 `json:"maxNumberOfRecordSets"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(body, &z); err != nil {
		return nil, err
	}

	spec := map[string]interface{}{
		"max_number_of_record_sets": z.Properties.MaxNumberOfRecordSets,
	}

	log.Printf("azure: got dns zone %s", z.Name)
	return &types.DNSZone{
		ID:          z.ID,
		Name:        z.Name,
		CloudType:   "azure",
		Region:      z.Location,
		Status:      "active",
		ZoneType:    "public",
		RecordCount: int(z.Properties.NumberOfRecordSets),
		Spec:        spec,
		Tags:        z.Tags,
	}, nil
}

// ---------------------------------------------------------------------------
// GetCertificate
// ---------------------------------------------------------------------------

func (p *AzureProvider) GetCertificate(ctx context.Context, id string) (*types.Certificate, error) {
	if !strings.HasPrefix(id, "https://") {
		return nil, fmt.Errorf("azure: invalid certificate ID, expected Key Vault URL")
	}

	parsedURL, err := url.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("parse certificate URL: %w", err)
	}

	pathParts := strings.SplitN(strings.TrimPrefix(parsedURL.Path, "/certificates/"), "/", 2)
	if len(pathParts) < 1 || pathParts[0] == "" {
		return nil, fmt.Errorf("azure: cannot extract certificate name from %s", id)
	}
	certName := pathParts[0]

	hostParts := strings.Split(parsedURL.Host, ".")
	if len(hostParts) < 1 {
		return nil, fmt.Errorf("azure: cannot extract vault name from %s", id)
	}
	vaultName := hostParts[0]

	certURL := fmt.Sprintf("https://%s.vault.azure.net/certificates/%s?api-version=7.4", vaultName, certName)
	body, err := p.doVaultAPI(ctx, "GET", certURL, nil)
	if err != nil {
		return nil, fmt.Errorf("get certificate: %w", err)
	}

	var cert struct {
		ID     string            `json:"id"`
		X5t    string            `json:"x5t"`
		Tags   map[string]string `json:"tags"`
		Attributes struct {
			Enabled      bool   `json:"enabled"`
			NotBefore    *int64 `json:"nbf,omitempty"`
			Expires      *int64 `json:"exp,omitempty"`
			RecoveryLevel string `json:"recoveryLevel,omitempty"`
		} `json:"attributes"`
		Policy struct {
			Issuer struct {
				Name string `json:"name"`
			} `json:"issuer"`
			X509Props struct {
				Subject string `json:"subject"`
			} `json:"x509_props"`
		} `json:"policy"`
	}
	if err := json.Unmarshal(body, &cert); err != nil {
		return nil, err
	}

	status := "unknown"
	if cert.Attributes.Enabled {
		status = "active"
	} else {
		status = "disabled"
	}

	var notBefore, notAfter string
	if cert.Attributes.NotBefore != nil {
		notBefore = time.Unix(*cert.Attributes.NotBefore, 0).UTC().Format(time.RFC3339)
	}
	if cert.Attributes.Expires != nil {
		notAfter = time.Unix(*cert.Attributes.Expires, 0).UTC().Format(time.RFC3339)
	}

	domain := ""
	if cert.Policy.X509Props.Subject != "" {
		for _, part := range strings.Split(cert.Policy.X509Props.Subject, ",") {
			part = strings.TrimSpace(part)
			if strings.HasPrefix(part, "CN=") {
				domain = strings.TrimPrefix(part, "CN=")
				break
			}
		}
	}

	log.Printf("azure: got certificate %s", certName)
	return &types.Certificate{
		ID:        cert.ID,
		Name:      certName,
		CloudType: "azure",
		Region:    "", // not available from data plane, would need vault lookup
		Status:    status,
		Domain:    domain,
		Issuer:    cert.Policy.Issuer.Name,
		NotBefore: notBefore,
		NotAfter:  notAfter,
		Spec: map[string]interface{}{
			"thumbprint":     cert.X5t,
			"recovery_level": cert.Attributes.RecoveryLevel,
		},
		Tags: cert.Tags,
	}, nil
}

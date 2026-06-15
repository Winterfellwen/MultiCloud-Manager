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

func (p *RenderProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	// Render dashboard URLs follow a pattern based on service type
	// We return empty here; the syncer falls back to spec.dashboard_url
	return ""
}

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
	// Only return web services as instances; PostgreSQL and Redis are returned by ListDatabases
	services, err := p.listServices(ctx)
	if err != nil {
		return nil, fmt.Errorf("render: list services: %w", err)
	}
	if services == nil {
		services = []types.Instance{}
	}
	return services, nil
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
	body, err := p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/services/%s", id))
	if err != nil {
		return nil, fmt.Errorf("render: get service: %w", err)
	}

	var wrapped map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapped); err != nil {
		return nil, fmt.Errorf("render: unmarshal service: %w", err)
	}

	srvData, ok := wrapped["service"]
	if !ok {
		return nil, fmt.Errorf("render: response missing service key")
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
		return nil, fmt.Errorf("render: unmarshal service details: %w", err)
	}

	status := "running"
	if s.State == "suspended" || s.State == "deactivated" || s.Suspended != "not_suspended" {
		status = "stopped"
	}

	region := s.ServiceDetails.Region
	if region == "" {
		region = "singapore"
	}

	return &types.Instance{
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
	}, nil
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

func (p *RenderProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	return nil, nil
}

func (p *RenderProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/private-networks?limit=100")
	if err != nil {
		log.Printf("render: list private networks: %v", err)
		return nil, nil
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, nil
	}

	var networks []types.Network
	for _, item := range raw {
		netData, ok := item["privateNetwork"]
		if !ok {
			continue
		}
		var net struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Region    string `json:"region"`
			OwnerID   string `json:"ownerId"`
			EnvID     string `json:"environmentId"`
			CIDRBlock string `json:"cidrBlock"`
			CreatedOn string `json:"createdOn"`
		}
		if err := json.Unmarshal(netData, &net); err != nil {
			continue
		}
		networks = append(networks, types.Network{
			ID:          net.ID,
			Name:        net.Name,
			CloudType:   "render",
			Region:      net.Region,
			Status:      "active",
			NetworkType: "private_network",
			CIDR:        net.CIDRBlock,
			Spec: map[string]interface{}{
				"owner_id": net.OwnerID,
				"env_id":   net.EnvID,
			},
		})
	}
	return networks, nil
}

func (p *RenderProvider) listPostgresAsDBs(ctx context.Context) ([]types.Database, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/postgres?limit=100")
	if err != nil {
		return nil, err
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("postgres unmarshal: %w", err)
	}

	var databases []types.Database
	for _, item := range raw {
		pgData, ok := item["postgres"]
		if !ok {
			continue
		}
		var pg struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			Region       string `json:"region"`
			Status       string `json:"status"`
			Plan         string `json:"plan"`
			Version      string `json:"version"`
			Suspended    string `json:"suspended"`
			CreatedAt    string `json:"createdAt"`
			DashboardURL string `json:"dashboardUrl"`
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

		databases = append(databases, types.Database{
			ID:          pg.ID,
			Name:        pg.Name,
			CloudType:   "render",
			Region:      region,
			Status:      status,
			Engine:      "PostgreSQL",
			EngineVer:   pg.Version,
			InstanceCls: pg.Plan,
			Spec: map[string]interface{}{
				"plan":          pg.Plan,
				"engine":        "PostgreSQL",
				"engine_version": pg.Version,
				"dashboard_url": pg.DashboardURL,
			},
		})
	}
	return databases, nil
}

func (p *RenderProvider) listKeyValueAsDBs(ctx context.Context) ([]types.Database, error) {
	body, err := p.doGet(ctx, "https://api.render.com/v1/key-value?limit=100")
	if err != nil {
		return nil, err
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("key-value unmarshal: %w", err)
	}

	var databases []types.Database
	for _, item := range raw {
		kvData, ok := item["keyValue"]
		if !ok {
			continue
		}
		var kv struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			Region       string `json:"region"`
			Status       string `json:"status"`
			Plan         string `json:"plan"`
			Version      string `json:"version"`
			Suspended    string `json:"suspended"`
			CreatedAt    string `json:"createdAt"`
			DashboardURL string `json:"dashboardUrl"`
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

		databases = append(databases, types.Database{
			ID:          kv.ID,
			Name:        kv.Name,
			CloudType:   "render",
			Region:      region,
			Status:      status,
			Engine:      "Redis",
			EngineVer:   kv.Version,
			InstanceCls: kv.Plan,
			Spec: map[string]interface{}{
				"plan":          kv.Plan,
				"engine":        "Redis",
				"engine_version": kv.Version,
				"dashboard_url": kv.DashboardURL,
			},
		})
	}
	return databases, nil
}

func (p *RenderProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	var databases []types.Database

	pgs, err := p.listPostgresAsDBs(ctx)
	if err != nil {
		log.Printf("render: list postgres databases: %v", err)
	} else {
		databases = append(databases, pgs...)
	}

	kvs, err := p.listKeyValueAsDBs(ctx)
	if err != nil {
		log.Printf("render: list key-value databases: %v", err)
	} else {
		databases = append(databases, kvs...)
	}

	return databases, nil
}

func (p *RenderProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	return nil, nil
}

func (p *RenderProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	return nil, nil
}

func (p *RenderProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	return nil, nil
}

func (p *RenderProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	return nil, nil
}

func (p *RenderProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	return nil, nil
}

func (p *RenderProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	return nil, nil
}

func (p *RenderProvider) GetVolume(ctx context.Context, volumeID string) (*types.Volume, error) {
	return nil, fmt.Errorf("render: volumes not supported")
}

func (p *RenderProvider) GetNetwork(ctx context.Context, networkID string) (*types.Network, error) {
	body, err := p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/private-networks/%s", networkID))
	if err != nil {
		return nil, fmt.Errorf("render: get private network: %w", err)
	}

	var wrapped map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapped); err != nil {
		return nil, fmt.Errorf("render: unmarshal private network: %w", err)
	}

	netData, ok := wrapped["privateNetwork"]
	if !ok {
		return nil, fmt.Errorf("render: response missing privateNetwork key")
	}

	var net struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Region    string `json:"region"`
		OwnerID   string `json:"ownerId"`
		EnvID     string `json:"environmentId"`
		CIDRBlock string `json:"cidrBlock"`
		CreatedOn string `json:"createdOn"`
	}
	if err := json.Unmarshal(netData, &net); err != nil {
		return nil, fmt.Errorf("render: unmarshal network details: %w", err)
	}

	return &types.Network{
		ID:          net.ID,
		Name:        net.Name,
		CloudType:   "render",
		Region:      net.Region,
		Status:      "active",
		NetworkType: "private_network",
		CIDR:        net.CIDRBlock,
		Spec: map[string]interface{}{
			"owner_id": net.OwnerID,
			"env_id":   net.EnvID,
		},
	}, nil
}

func (p *RenderProvider) GetDatabase(ctx context.Context, databaseID string) (*types.Database, error) {
	body, err := p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/postgres/%s", databaseID))
	if err == nil {
		var wrapped map[string]json.RawMessage
		if err := json.Unmarshal(body, &wrapped); err == nil {
			pgData, ok := wrapped["postgres"]
			if ok {
				var pg struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					Region    string `json:"region"`
					Status    string `json:"status"`
					Plan      string `json:"plan"`
					Version   string `json:"version"`
					Suspended string `json:"suspended"`
				}
				if err := json.Unmarshal(pgData, &pg); err == nil {
					status := "running"
					if pg.Status != "available" || pg.Suspended != "not_suspended" {
						status = "stopped"
					}
					region := pg.Region
					if region == "" {
						region = "singapore"
					}
					return &types.Database{
						ID:          pg.ID,
						Name:        pg.Name,
						CloudType:   "render",
						Region:      region,
						Status:      status,
						Engine:      "postgres",
						EngineVer:   pg.Version,
						InstanceCls: pg.Plan,
						Spec: map[string]interface{}{
							"plan":    pg.Plan,
							"version": pg.Version,
						},
					}, nil
				}
			}
		}
	}

	body, err = p.doGet(ctx, fmt.Sprintf("https://api.render.com/v1/key-value/%s", databaseID))
	if err == nil {
		var wrapped map[string]json.RawMessage
		if err := json.Unmarshal(body, &wrapped); err == nil {
			kvData, ok := wrapped["keyValue"]
			if ok {
				var kv struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					Region    string `json:"region"`
					Status    string `json:"status"`
					Plan      string `json:"plan"`
					Version   string `json:"version"`
					Suspended string `json:"suspended"`
				}
				if err := json.Unmarshal(kvData, &kv); err == nil {
					status := "running"
					if kv.Status != "available" {
						status = "stopped"
					}
					region := kv.Region
					if region == "" {
						region = "singapore"
					}
					return &types.Database{
						ID:          kv.ID,
						Name:        kv.Name,
						CloudType:   "render",
						Region:      region,
						Status:      status,
						Engine:      "redis",
						EngineVer:   kv.Version,
						InstanceCls: kv.Plan,
						Spec: map[string]interface{}{
							"plan":    kv.Plan,
							"version": kv.Version,
						},
					}, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("render: database %s not found", databaseID)
}

func (p *RenderProvider) GetLoadBalancer(ctx context.Context, lbID string) (*types.LoadBalancer, error) {
	return nil, fmt.Errorf("render: load balancers not supported")
}

func (p *RenderProvider) GetBucket(ctx context.Context, bucketID string) (*types.Bucket, error) {
	return nil, fmt.Errorf("render: buckets not supported")
}

func (p *RenderProvider) GetCluster(ctx context.Context, clusterID string) (*types.Cluster, error) {
	return nil, fmt.Errorf("render: clusters not supported")
}

func (p *RenderProvider) GetFunction(ctx context.Context, functionID string) (*types.Function, error) {
	return nil, fmt.Errorf("render: functions not supported")
}

func (p *RenderProvider) GetDNSZone(ctx context.Context, zoneID string) (*types.DNSZone, error) {
	return nil, fmt.Errorf("render: dns zones not supported")
}

func (p *RenderProvider) GetCertificate(ctx context.Context, certID string) (*types.Certificate, error) {
	return nil, fmt.Errorf("render: certificates not supported")
}

// —— 新增：新资源类型 List 方法 ——
func (p *RenderProvider) ListRedis(ctx context.Context, opts types.ListOptions) ([]types.Redis, error) {
	return []types.Redis{}, nil
}

func (p *RenderProvider) ListMQ(ctx context.Context, opts types.ListOptions) ([]types.MQ, error) {
	return []types.MQ{}, nil
}

func (p *RenderProvider) ListCDN(ctx context.Context, opts types.ListOptions) ([]types.CDN, error) {
	return []types.CDN{}, nil
}

func (p *RenderProvider) ListWAF(ctx context.Context, opts types.ListOptions) ([]types.WAF, error) {
	return []types.WAF{}, nil
}

func (p *RenderProvider) ListNATGateways(ctx context.Context, opts types.ListOptions) ([]types.NATGateway, error) {
	return []types.NATGateway{}, nil
}

func (p *RenderProvider) ListImages(ctx context.Context, opts types.ListOptions) ([]types.Image, error) {
	return []types.Image{}, nil
}

func (p *RenderProvider) ListAPIGateways(ctx context.Context, opts types.ListOptions) ([]types.APIGateway, error) {
	return []types.APIGateway{}, nil
}

func (p *RenderProvider) ListLogServices(ctx context.Context, opts types.ListOptions) ([]types.LogService, error) {
	return []types.LogService{}, nil
}

func (p *RenderProvider) ListSecurityGroups(ctx context.Context, opts types.ListOptions) ([]types.SecurityGroup, error) {
	return []types.SecurityGroup{}, nil
}

func (p *RenderProvider) ListRegistries(ctx context.Context, opts types.ListOptions) ([]types.Registry, error) {
	return []types.Registry{}, nil
}

// —— 新增：GetResourceDetail ——
func (p *RenderProvider) GetResourceDetail(ctx context.Context, resourceType types.ResourceType, id, region string) (map[string]interface{}, error) {
	switch resourceType {
	case types.ResourceTypeInstance:
		if v, err := p.GetInstance(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeDatabase:
		if v, err := p.GetDatabase(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	}
	return map[string]interface{}{"provider": "render"}, nil
}

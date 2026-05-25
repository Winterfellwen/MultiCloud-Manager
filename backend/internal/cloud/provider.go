package cloud

import (
	"context"
	"time"
)

// Provider 多云提供者统一接口
type Provider interface {
	// GetType 返回云类型标识
	GetType() string

	// 实例管理
	ListInstances(ctx context.Context, opts ListOptions) ([]Instance, error)
	GetInstance(ctx context.Context, instanceID string) (*Instance, error)
	StartInstance(ctx context.Context, instanceID string) error
	StopInstance(ctx context.Context, instanceID string) error
	RestartInstance(ctx context.Context, instanceID string) error
	CreateInstance(ctx context.Context, params CreateInstanceParams) (string, error)
	DeleteInstance(ctx context.Context, instanceID string) error

	// 区域管理
	ListRegions(ctx context.Context) ([]Region, error)
}

// ListOptions 资源列表查询选项
type ListOptions struct {
	ResourceType string
	Region       string
	Status       string
	Limit        int
	Offset       int
}

// Instance 统一实例模型
type Instance struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	InstanceType string                 `json:"instance_type"`
	Spec         map[string]interface{} `json:"spec"`
	Tags         map[string]string      `json:"tags"`
	CreatedAt    time.Time              `json:"created_at"`
	LastModified time.Time              `json:"last_modified"`
}

// CreateInstanceParams 创建实例参数
type CreateInstanceParams struct {
	Name         string                 `json:"name"`
	Region       string                 `json:"region"`
	InstanceType string                 `json:"instance_type"`
	ImageID      string                 `json:"image_id"`
	DiskSizeGB   int                    `json:"disk_size_gb"`
	NetworkID    string                 `json:"network_id,omitempty"`
	SecurityGroup string               `json:"security_group,omitempty"`
	Tags         map[string]string      `json:"tags,omitempty"`
	Extra        map[string]interface{} `json:"extra,omitempty"`
}

// Region 区域信息
type Region struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Location string   `json:"location"`
	Zones    []string `json:"zones"`
}

// ProviderRegistry 多云提供者注册表
type ProviderRegistry struct {
	providers map[string]Provider
}

func NewProviderRegistry() *ProviderRegistry {
	return &ProviderRegistry{
		providers: make(map[string]Provider),
	}
}

func (r *ProviderRegistry) Register(provider Provider) {
	r.providers[provider.GetType()] = provider
}

func (r *ProviderRegistry) Get(cloudType string) (Provider, bool) {
	p, ok := r.providers[cloudType]
	return p, ok
}
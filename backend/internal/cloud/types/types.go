package types

import (
	"context"
	"time"
)

type Provider interface {
	GetType() string
	ListInstances(ctx context.Context, opts ListOptions) ([]Instance, error)
	GetInstance(ctx context.Context, instanceID string) (*Instance, error)
	StartInstance(ctx context.Context, instanceID string) error
	StopInstance(ctx context.Context, instanceID string) error
	RestartInstance(ctx context.Context, instanceID string) error
	CreateInstance(ctx context.Context, params CreateInstanceParams) (string, error)
	DeleteInstance(ctx context.Context, instanceID string) error
	ListRegions(ctx context.Context) ([]Region, error)
}

type ListOptions struct {
	ResourceType string
	Region       string
	Status       string
	Limit        int
	Offset       int
}

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

type Region struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Location string   `json:"location"`
	Zones    []string `json:"zones"`
}

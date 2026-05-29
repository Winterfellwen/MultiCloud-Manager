package types

import "context"

type Provider interface {
	GetType() string
	ListInstances(ctx context.Context, opts ListOptions) ([]Instance, error)
	GetInstance(ctx context.Context, instanceID string) (*Instance, error)
	StartInstance(ctx context.Context, instanceID string) error
	StopInstance(ctx context.Context, instanceID string) error
	RestartInstance(ctx context.Context, instanceID string) error
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
}

package types

import "context"

// RawResponse is the result of a DoRawRequest call.
type RawResponse struct {
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       []byte            `json:"body"`
}

type Provider interface {
	GetType() string
	ListInstances(ctx context.Context, opts ListOptions) ([]Instance, error)
	GetInstance(ctx context.Context, instanceID string) (*Instance, error)
	StartInstance(ctx context.Context, instanceID string) error
	StopInstance(ctx context.Context, instanceID string) error
	RestartInstance(ctx context.Context, instanceID string) error
	DoRawRequest(ctx context.Context, method, url string, headers map[string]string, body []byte) (*RawResponse, error)
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

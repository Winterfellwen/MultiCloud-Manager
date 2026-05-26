package cloud

import "multicloud-manager/internal/cloud/types"

// Provider aliases to types package
type Provider = types.Provider
type ListOptions = types.ListOptions
type Instance = types.Instance
type CreateInstanceParams = types.CreateInstanceParams
type Region = types.Region

// ProviderRegistry manages provider instances
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



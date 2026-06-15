package types

import "context"

// RawResponse is the result of a DoRawRequest call.
type RawResponse struct {
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       []byte            `json:"body"`
}

type ResourceType string

const (
	ResourceTypeInstance     ResourceType = "instance"
	ResourceTypeVolume       ResourceType = "volume"
	ResourceTypeNetwork      ResourceType = "network"
	ResourceTypeDatabase     ResourceType = "database"
	ResourceTypeLoadBalancer ResourceType = "loadbalancer"
	ResourceTypeBucket       ResourceType = "bucket"
	ResourceTypeCluster      ResourceType = "cluster"
	ResourceTypeFunction     ResourceType = "function"
	ResourceTypeDNSZone      ResourceType = "dns_zone"
	ResourceTypeCertificate  ResourceType = "certificate"
)

// ResourceTypeMeta describes display metadata for each resource type.
type ResourceTypeMeta struct {
	Label       string
	Icon        string
	Color       string
	ConsolePath string // Console URL path template
}

// ResourceTypeMetas maps each ResourceType to its display metadata.
var ResourceTypeMetas = map[ResourceType]ResourceTypeMeta{
	ResourceTypeInstance:     {Label: "VM", Icon: "vm", Color: "#3b82f6", ConsolePath: ""},
	ResourceTypeVolume:       {Label: "Volume", Icon: "disk", Color: "#8b5cf6", ConsolePath: ""},
	ResourceTypeNetwork:      {Label: "Network", Icon: "net", Color: "#10b981", ConsolePath: ""},
	ResourceTypeDatabase:     {Label: "Database", Icon: "db", Color: "#f59e0b", ConsolePath: ""},
	ResourceTypeLoadBalancer: {Label: "Load Balancer", Icon: "lb", Color: "#ef4444", ConsolePath: ""},
	ResourceTypeBucket:       {Label: "Storage", Icon: "bucket", Color: "#06b6d4", ConsolePath: ""},
	ResourceTypeCluster:      {Label: "Kubernetes", Icon: "k8s", Color: "#6366f1", ConsolePath: ""},
	ResourceTypeFunction:     {Label: "Function", Icon: "fn", Color: "#ec4899", ConsolePath: ""},
	ResourceTypeDNSZone:      {Label: "DNS", Icon: "dns", Color: "#14b8a6", ConsolePath: ""},
	ResourceTypeCertificate:  {Label: "Certificate", Icon: "cert", Color: "#84cc16", ConsolePath: ""},
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

type Volume struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	VolumeType  string                 `json:"volume_type"`
	SizeGB      int                    `json:"size_gb"`
	IOPS        int                    `json:"iops,omitempty"`
	AttachedTo  string                 `json:"attached_to,omitempty"`
	Encrypted   bool                   `json:"encrypted"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type Network struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	NetworkType string                 `json:"network_type"`
	CIDR        string                 `json:"cidr,omitempty"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type Database struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	Engine      string                 `json:"engine"`
	EngineVer   string                 `json:"engine_version"`
	InstanceCls string                 `json:"instance_class"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type LoadBalancer struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	LBType      string                 `json:"lb_type"`
	Scheme      string                 `json:"scheme,omitempty"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type Bucket struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	StorageCls  string                 `json:"storage_class,omitempty"`
	Versioning  bool                   `json:"versioning"`
	Encrypted   bool                   `json:"encrypted"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type Cluster struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	ClusterType  string                 `json:"cluster_type"`
	Version      string                 `json:"version,omitempty"`
	NodeCount    int                    `json:"node_count,omitempty"`
	Spec         map[string]interface{} `json:"spec"`
	Tags         map[string]string      `json:"tags"`
}

type Function struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	Runtime      string                 `json:"runtime,omitempty"`
	Handler      string                 `json:"handler,omitempty"`
	Timeout      int                    `json:"timeout,omitempty"`
	MemorySize   int                    `json:"memory_size,omitempty"`
	Spec         map[string]interface{} `json:"spec"`
	Tags         map[string]string      `json:"tags"`
}

type DNSZone struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	ZoneType    string                 `json:"zone_type,omitempty"`
	RecordCount int                    `json:"record_count,omitempty"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type Certificate struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	Domain       string                 `json:"domain,omitempty"`
	Issuer       string                 `json:"issuer,omitempty"`
	NotBefore    string                 `json:"not_before,omitempty"`
	NotAfter     string                 `json:"not_after,omitempty"`
	Spec         map[string]interface{} `json:"spec"`
	Tags         map[string]string      `json:"tags"`
}

type GenericResource struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	ResourceType string                 `json:"resource_type"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	Spec         map[string]interface{} `json:"spec"`
	Tags         map[string]string      `json:"tags"`
}

type Provider interface {
	GetType() string
	GetConsoleURL(resourceType ResourceType, id, region string) string
	ListInstances(ctx context.Context, opts ListOptions) ([]Instance, error)
	ListVolumes(ctx context.Context, opts ListOptions) ([]Volume, error)
	ListNetworks(ctx context.Context, opts ListOptions) ([]Network, error)
	ListDatabases(ctx context.Context, opts ListOptions) ([]Database, error)
	ListLoadBalancers(ctx context.Context, opts ListOptions) ([]LoadBalancer, error)
	ListBuckets(ctx context.Context, opts ListOptions) ([]Bucket, error)
	ListClusters(ctx context.Context, opts ListOptions) ([]Cluster, error)
	ListFunctions(ctx context.Context, opts ListOptions) ([]Function, error)
	ListDNSZones(ctx context.Context, opts ListOptions) ([]DNSZone, error)
	ListCertificates(ctx context.Context, opts ListOptions) ([]Certificate, error)
	GetInstance(ctx context.Context, instanceID string) (*Instance, error)
	GetVolume(ctx context.Context, volumeID string) (*Volume, error)
	GetNetwork(ctx context.Context, networkID string) (*Network, error)
	GetDatabase(ctx context.Context, databaseID string) (*Database, error)
	GetLoadBalancer(ctx context.Context, lbID string) (*LoadBalancer, error)
	GetBucket(ctx context.Context, bucketID string) (*Bucket, error)
	GetCluster(ctx context.Context, clusterID string) (*Cluster, error)
	GetFunction(ctx context.Context, functionID string) (*Function, error)
	GetDNSZone(ctx context.Context, zoneID string) (*DNSZone, error)
	GetCertificate(ctx context.Context, certID string) (*Certificate, error)
	StartInstance(ctx context.Context, instanceID string) error
	StopInstance(ctx context.Context, instanceID string) error
	RestartInstance(ctx context.Context, instanceID string) error
	DoRawRequest(ctx context.Context, method, url string, headers map[string]string, body []byte) (*RawResponse, error)
}

var SupportedResourceTypes = []ResourceType{
	ResourceTypeInstance,
	ResourceTypeVolume,
	ResourceTypeNetwork,
	ResourceTypeDatabase,
	ResourceTypeLoadBalancer,
	ResourceTypeBucket,
	ResourceTypeCluster,
	ResourceTypeFunction,
	ResourceTypeDNSZone,
	ResourceTypeCertificate,
}

func IsSupportedResourceType(rt string) bool {
	for _, t := range SupportedResourceTypes {
		if string(t) == rt {
			return true
		}
	}
	return false
}
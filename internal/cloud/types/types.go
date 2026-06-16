package types

import (
	"context"
	"time"
)

// EventProvider is the interface for fetching cloud platform events.
type EventProvider interface {
	SupportedEventTypes() []string
	FetchEvents(ctx context.Context, eventType string, since time.Time) ([]CloudEvent, error)
}

// CloudEvent represents a cloud provider event (deploy, alert, etc.).
type CloudEvent struct {
	SourceID     string                 `json:"source_id"`
	EventType    string                 `json:"event_type"`
	Severity     string                 `json:"severity"`
	Title        string                 `json:"title"`
	Description  string                 `json:"description"`
	Source       string                 `json:"source"`
	ResourceID   string                 `json:"resource_id"`
	ResourceName string                 `json:"resource_name"`
	ResourceType string                 `json:"resource_type"`
	EventAt      time.Time              `json:"event_at"`
	Metadata     map[string]interface{} `json:"metadata"`
}

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
	// —— 新增资源类型 ——
	ResourceTypeRedis      ResourceType = "redis"
	ResourceTypeMQ         ResourceType = "mq"
	ResourceTypeCDN        ResourceType = "cdn"
	ResourceTypeWAF        ResourceType = "waf"
	ResourceTypeNATGateway ResourceType = "nat_gateway"
	ResourceTypeImage      ResourceType = "image"
	ResourceTypeAPIGateway ResourceType = "api_gateway"
	ResourceTypeLogService ResourceType = "log_service"
	ResourceTypeSecurity   ResourceType = "security_group"
	ResourceTypeRegistry   ResourceType = "registry"
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
	// —— 新增 ——
	ResourceTypeRedis:      {Label: "Redis", Icon: "redis", Color: "#dc382d", ConsolePath: ""},
	ResourceTypeMQ:         {Label: "Message Queue", Icon: "mq", Color: "#7c3aed", ConsolePath: ""},
	ResourceTypeCDN:        {Label: "CDN", Icon: "cdn", Color: "#0891b2", ConsolePath: ""},
	ResourceTypeWAF:        {Label: "WAF", Icon: "waf", Color: "#be185d", ConsolePath: ""},
	ResourceTypeNATGateway: {Label: "NAT Gateway", Icon: "nat", Color: "#0d9488", ConsolePath: ""},
	ResourceTypeImage:      {Label: "Image", Icon: "image", Color: "#a16207", ConsolePath: ""},
	ResourceTypeAPIGateway: {Label: "API Gateway", Icon: "api", Color: "#4f46e5", ConsolePath: ""},
	ResourceTypeLogService: {Label: "Log Service", Icon: "log", Color: "#64748b", ConsolePath: ""},
	ResourceTypeSecurity:   {Label: "Security Group", Icon: "sg", Color: "#059669", ConsolePath: ""},
	ResourceTypeRegistry:   {Label: "Container Registry", Icon: "registry", Color: "#d97706", ConsolePath: ""},
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
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CloudType    string                 `json:"cloud_type"`
	Region       string                 `json:"region"`
	Status       string                 `json:"status"`
	Engine       string                 `json:"engine"`
	EngineVer    string                 `json:"engine_version"`
	InstanceCls  string                 `json:"instance_class"`
	StorageGB    int                    `json:"storage_gb,omitempty"`
	Endpoint     string                 `json:"endpoint,omitempty"`
	Port         int                    `json:"port,omitempty"`
	MasterUser   string                 `json:"master_user,omitempty"`
	MultiAZ      bool                   `json:"multi_az,omitempty"`
	PubliclyAccessible bool             `json:"publicly_accessible,omitempty"`
	StorageEncrypted bool               `json:"storage_encrypted,omitempty"`
	BackupRetention int                 `json:"backup_retention_days,omitempty"`
	PreferredBackup string              `json:"preferred_backup_window,omitempty"`
	// 通用增强字段
	LastModified string                 `json:"last_modified,omitempty"`
	Description  string                 `json:"description,omitempty"`
	// AWS RDS 特定字段
	DBName         string               `json:"db_name,omitempty"`
	AutoMinorVersionUpgrade bool       `json:"auto_minor_version_upgrade,omitempty"`
	CACertificateID string             `json:"ca_certificate_id,omitempty"`
	DBSubnetGroup  string              `json:"db_subnet_group,omitempty"`
	// Azure SQL 特定字段
	Edition         string             `json:"edition,omitempty"`
	ServiceObjective string            `json:"service_objective,omitempty"`
	SkuName         string             `json:"sku_name,omitempty"`
	// 阿里云 RDS 特定字段
	DBInstanceType string              `json:"db_instance_type,omitempty"`
	PayType        string              `json:"pay_type,omitempty"`
	ExpiredTime    string              `json:"expired_time,omitempty"`
	// 腾讯云 CDB 特定字段
	Vip            string              `json:"vip,omitempty"`
	Vport          int                 `json:"vport,omitempty"`
	DeviceInfo     string              `json:"device_info,omitempty"`
	// 通用字段
	Spec           map[string]interface{} `json:"spec"`
	Tags           map[string]string      `json:"tags"`
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
	Endpoint    string                 `json:"endpoint,omitempty"`
	CreationDate string                `json:"creation_date,omitempty"`
	// AWS S3 特定字段
	Location   string                 `json:"location,omitempty"`
	Owner      string                 `json:"owner,omitempty"`
	// 阿里云 OSS 特定字段
	ExtranetEndpoint string           `json:"extranet_endpoint,omitempty"`
	IntranetEndpoint string           `json:"intranet_endpoint,omitempty"`
	DataRedundancyType string         `json:"data_redundancy_type,omitempty"`
	// 腾讯云 COS 特定字段
	BucketID   string                 `json:"bucket_id,omitempty"`
	// 通用字段
	Spec           map[string]interface{} `json:"spec"`
	Tags           map[string]string      `json:"tags"`
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
	// 通用增强字段
	LastModified string                 `json:"last_modified,omitempty"`
	Description  string                 `json:"description,omitempty"`
	Version      string                 `json:"version,omitempty"`
	// AWS Lambda 特定字段
	Architectures    []string           `json:"architectures,omitempty"`
	EphemeralStorage int                `json:"ephemeral_storage,omitempty"`
	TracingConfig    string             `json:"tracing_config,omitempty"`
	PackageType      string             `json:"package_type,omitempty"`
	Layers           []string           `json:"layers,omitempty"`
	Environment      map[string]string  `json:"environment,omitempty"`
	// Azure Functions 特定字段
	AppServicePlan   string             `json:"app_service_plan,omitempty"`
	HTTPSOnly        bool               `json:"https_only,omitempty"`
	AuthEnabled      bool               `json:"auth_enabled,omitempty"`
	APIDefinitionURL string             `json:"api_definition_url,omitempty"`
	// 阿里云 FC 特定字段
	NASConfig     string                `json:"nas_config,omitempty"`
	VPCConfig     string                `json:"vpc_config,omitempty"`
	InternetAccess string               `json:"internet_access,omitempty"`
	// 腾讯云 SCF 特定字段
	Namespace   string                  `json:"namespace,omitempty"`
	TriggerNum  int                    `json:"trigger_num,omitempty"`
	CommitID    string                 `json:"commit_id,omitempty"`
	// Oracle Functions 特定字段
	InvokeEndpoint string               `json:"invoke_endpoint,omitempty"`
	Image         string                `json:"image,omitempty"`
	Shape         string                `json:"shape,omitempty"`
	// 通用字段
	Spec        map[string]interface{} `json:"spec"`
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

// —— 新增资源类型的结构体 ——
type Redis struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	Engine      string                 `json:"engine,omitempty"`
	EngineVer   string                 `json:"engine_version,omitempty"`
	InstanceCls string                 `json:"instance_class,omitempty"`
	Nodes       int                    `json:"nodes,omitempty"`
	Endpoint    string                 `json:"endpoint,omitempty"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        map[string]string      `json:"tags"`
}

type MQ struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	MQType    string                 `json:"mq_type,omitempty"`
	Queues    int                    `json:"queues,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type CDN struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	Domain    string                 `json:"domain,omitempty"`
	Origin    string                 `json:"origin,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type WAF struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	Rules     int                    `json:"rules,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type NATGateway struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	NATType   string                 `json:"nat_type,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type Image struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	OS        string                 `json:"os,omitempty"`
	SizeGB    int                    `json:"size_gb,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type APIGateway struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	APIs      int                    `json:"apis,omitempty"`
	Endpoint  string                 `json:"endpoint,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type LogService struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	CloudType  string                 `json:"cloud_type"`
	Region     string                 `json:"region"`
	Status     string                 `json:"status"`
	LogType    string                 `json:"log_type,omitempty"`
	Retention  int                    `json:"retention_days,omitempty"`
	Spec       map[string]interface{} `json:"spec"`
	Tags       map[string]string      `json:"tags"`
}

type SecurityGroup struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	Rules     int                    `json:"rules,omitempty"`
	VPCID     string                 `json:"vpc_id,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
}

type Registry struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	CloudType string                 `json:"cloud_type"`
	Region    string                 `json:"region"`
	Status    string                 `json:"status"`
	Images    int                    `json:"images,omitempty"`
	RepoURL   string                 `json:"repo_url,omitempty"`
	Spec      map[string]interface{} `json:"spec"`
	Tags      map[string]string      `json:"tags"`
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
	// —— 新增 List 接口 ——
	ListRedis(ctx context.Context, opts ListOptions) ([]Redis, error)
	ListMQ(ctx context.Context, opts ListOptions) ([]MQ, error)
	ListCDN(ctx context.Context, opts ListOptions) ([]CDN, error)
	ListWAF(ctx context.Context, opts ListOptions) ([]WAF, error)
	ListNATGateways(ctx context.Context, opts ListOptions) ([]NATGateway, error)
	ListImages(ctx context.Context, opts ListOptions) ([]Image, error)
	ListAPIGateways(ctx context.Context, opts ListOptions) ([]APIGateway, error)
	ListLogServices(ctx context.Context, opts ListOptions) ([]LogService, error)
	ListSecurityGroups(ctx context.Context, opts ListOptions) ([]SecurityGroup, error)
	ListRegistries(ctx context.Context, opts ListOptions) ([]Registry, error)
	// —— 详情接口 ——
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
	GetResourceDetail(ctx context.Context, resourceType ResourceType, id, region string) (map[string]interface{}, error)
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
	// —— 新增 ——
	ResourceTypeRedis,
	ResourceTypeMQ,
	ResourceTypeCDN,
	ResourceTypeWAF,
	ResourceTypeNATGateway,
	ResourceTypeImage,
	ResourceTypeAPIGateway,
	ResourceTypeLogService,
	ResourceTypeSecurity,
	ResourceTypeRegistry,
}

func IsSupportedResourceType(rt string) bool {
	for _, t := range SupportedResourceTypes {
		if string(t) == rt {
			return true
		}
	}
	return false
}

// ResourceGroup represents a group of cloud resources for analysis.
type ResourceGroup struct {
	Instances    []Instance    `json:"instances"`
	Volumes      []Volume      `json:"volumes"`
	Networks     []Network     `json:"networks"`
	Databases    []Database    `json:"databases"`
	LoadBalancers []LoadBalancer `json:"load_balancers"`
	Buckets      []Bucket      `json:"buckets"`
	Clusters     []Cluster     `json:"clusters"`
	Functions    []Function    `json:"functions"`
	DNSZones     []DNSZone     `json:"dns_zones"`
	Certificates []Certificate  `json:"certificates"`
}
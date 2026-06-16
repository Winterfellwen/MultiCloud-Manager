# 云资源优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化现有云厂商（AWS、Azure、阿里云、腾讯云、Oracle Cloud）的资源支持，提供完善的控制台跳转、资源详情展示和智能分析功能。

**Architecture:**
- 后端：扩展 `internal/cloud/types/types.go` 中的资源类型结构体，完善各云厂商 Provider 的 GetConsoleURL 和详情获取方法
- 新增：`internal/cloud/analyzer/` 模块实现 AI 资源分析
- 前端：更新资源展示页面，添加分析结果展示

**Tech Stack:** Go (后端), JavaScript/HTML/CSS (前端), 各云厂商 SDK

---

## 阶段 1: 完善 Console URL

**预计工时:** 2 小时

### Task 1.1: 完善 Azure GetConsoleURL 实现

**Files:**
- Modify: `internal/cloud/providers/azure.go:63-89`

- [ ] **Step 1: 阅读现有 Azure GetConsoleURL 实现**

```bash
head -100 /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/providers/azure.go
```

- [ ] **Step 2: 替换 Azure GetConsoleURL 为精确资源路径**

当前实现使用通用格式 `#@/resource/{id}`，需要改为各资源类型的精确路径：

```go
func (p *AzureProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
    base := "https://portal.azure.com"
    switch resourceType {
    case types.ResourceTypeInstance:
        return fmt.Sprintf("%s/#blade/HardwareMigrationMenuBlade/resourceId/%s", base, id)
    case types.ResourceTypeVolume:
        return fmt.Sprintf("%s/#blade/HardwareMigrationMenuBlade/resourceId/%s", base, id)
    case types.ResourceTypeNetwork:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeDatabase:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeLoadBalancer:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeBucket:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeCluster:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeFunction:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeDNSZone:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeCertificate:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeRedis:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeMQ:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeCDN:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeWAF:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeNATGateway:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeImage:
        return fmt.Sprintf("%s/#blade/HardwareMigrationMenuBlade/resourceId/%s", base, id)
    case types.ResourceTypeAPIGateway:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeLogService:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeSecurity:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    case types.ResourceTypeRegistry:
        return fmt.Sprintf("%s/#@/resource%s", base, id)
    default:
        return base
    }
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 1.2: 完善阿里云 GetConsoleURL

**Files:**
- Modify: `internal/cloud/providers/alicloud.go:45-74`

- [ ] **Step 1: 阅读现有阿里云 GetConsoleURL 实现**

```bash
sed -n '45,74p' /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/providers/alicloud.go
```

- [ ] **Step 2: 补充阿里云缺失的 Console URL**

添加 Redis、KMS、API Gateway 等资源类型的 Console URL：

```go
func (p *AlicloudProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
    if region == "" {
        region = p.region
    }
    // 阿里云国际站使用 different console domain
    base := "https://" + region + ".console.aliyun.com"
    switch resourceType {
    case types.ResourceTypeInstance:
        return fmt.Sprintf("%s/ecs/instance/%s", base, id)
    case types.ResourceTypeVolume:
        return fmt.Sprintf("%s/ecs/disk/%s", base, id)
    case types.ResourceTypeNetwork:
        return fmt.Sprintf("%s/vpc/vpc/%s", base, id)
    case types.ResourceTypeDatabase:
        return fmt.Sprintf("%s/rds/instance/%s", base, id)
    case types.ResourceTypeLoadBalancer:
        return fmt.Sprintf("%s/slb/instance/%s", base, id)
    case types.ResourceTypeBucket:
        return fmt.Sprintf("%s/oss/bucket/%s", base, id)
    case types.ResourceTypeCluster:
        return fmt.Sprintf("%s/cs/cluster/%s", base, id)
    case types.ResourceTypeFunction:
        return fmt.Sprintf("%s/fc/service/%s", base, id)
    case types.ResourceTypeDNSZone:
        return fmt.Sprintf("%s/dns/zone/%s", base, id)
    case types.ResourceTypeCertificate:
        return fmt.Sprintf("%s/cas/certificate/%s", base, id)
    case types.ResourceTypeRedis:
        return fmt.Sprintf("%s/kvstore/shopping/%s", base, id)
    case types.ResourceTypeMQ:
        return fmt.Sprintf("%s/ons/consumer/%s", base, id)
    case types.ResourceTypeCDN:
        return fmt.Sprintf("%s/cdn/dashboard/%s", base, id)
    case types.ResourceTypeWAF:
        return fmt.Sprintf("%s/waf/s_instances/%s", base, id)
    case types.ResourceTypeNATGateway:
        return fmt.Sprintf("%s/vpc/nat/%s", base, id)
    case types.ResourceTypeImage:
        return fmt.Sprintf("%s/ecs/image/%s", base, id)
    case types.ResourceTypeAPIGateway:
        return fmt.Sprintf("%s/api-gateway/signature/%s", base, id)
    case types.ResourceTypeLogService:
        return fmt.Sprintf("%s/log/osslog/%s", base, id)
    case types.ResourceTypeSecurity:
        return fmt.Sprintf("%s/vpc/security/%s", base, id)
    case types.ResourceTypeRegistry:
        return fmt.Sprintf("%s/cr/instance/%s", base, id)
    default:
        return base
    }
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 1.3: 完善腾讯云 GetConsoleURL

**Files:**
- Modify: `internal/cloud/providers/tencent.go`

- [ ] **Step 1: 阅读现有腾讯云 GetConsoleURL 实现**

```bash
grep -n "GetConsoleURL" /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/providers/tencent.go
```

- [ ] **Step 2: 补充腾讯云缺失的 Console URL**

腾讯云 Console URL 格式：`https://console.cloud.tencent.com/{service}/{action}/{id}`

```go
func (p *TencentCloudProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
    if region == "" {
        region = p.region
    }
    base := "https://console.cloud.tencent.com"
    switch resourceType {
    case types.ResourceTypeInstance:
        return fmt.Sprintf("%s/cvm/instance/detail?insId=%s&region=%s", base, id, region)
    case types.ResourceTypeVolume:
        return fmt.Sprintf("%s/cbs/overview?region=%s", base, region)
    case types.ResourceTypeNetwork:
        return fmt.Sprintf("%s/vpc/vpc/%s?region=%s", base, id, region)
    case types.ResourceTypeDatabase:
        return fmt.Sprintf("%s/mysql/mysqlInstance/%s", base, id)
    case types.ResourceTypeLoadBalancer:
        return fmt.Sprintf("%s/clb/overview?region=%s", base, region)
    case types.ResourceTypeBucket:
        return fmt.Sprintf("%s/cos5/bucket/%s", base, id)
    case types.ResourceTypeCluster:
        return fmt.Sprintf("%s/tke/cluster/%s/overview", base, id)
    case types.ResourceTypeFunction:
        return fmt.Sprintf("%s/scf/list?region=%s", base, region)
    case types.ResourceTypeDNSZone:
        return fmt.Sprintf("%s/cns/overview?region=%s", base, region)
    case types.ResourceTypeCertificate:
        return fmt.Sprintf("%s/ssl/certificate/%s", base, id)
    case types.ResourceTypeRedis:
        return fmt.Sprintf("%s/redis/redis/%s", base, id)
    case types.ResourceTypeMQ:
        return fmt.Sprintf("%s/cmq/overview?region=%s", base, region)
    case types.ResourceTypeCDN:
        return fmt.Sprintf("%s/cdn/console?region=%s", base, region)
    case types.ResourceTypeWAF:
        return fmt.Sprintf("%s/cls/overview?region=%s", base, region)
    case types.ResourceTypeNATGateway:
        return fmt.Sprintf("%s/vpc/nat/%s?region=%s", base, id, region)
    case types.ResourceTypeImage:
        return fmt.Sprintf("%s/image/list?region=%s", base, region)
    case types.ResourceTypeAPIGateway:
        return fmt.Sprintf("%s/apigateway/service?region=%s", base, region)
    case types.ResourceTypeLogService:
        return fmt.Sprintf("%s/cls/overview?region=%s", base, region)
    case types.ResourceTypeSecurity:
        return fmt.Sprintf("%s/vpc/security?region=%s", base, region)
    case types.ResourceTypeRegistry:
        return fmt.Sprintf("%s/tcr/repository?region=%s", base, region)
    default:
        return base
    }
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 1.4: 完善 Oracle Cloud GetConsoleURL

**Files:**
- Modify: `internal/cloud/providers/oracle.go`

- [ ] **Step 1: 阅读现有 Oracle GetConsoleURL 实现**

```bash
grep -n "GetConsoleURL" /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/providers/oracle.go
```

- [ ] **Step 2: 补充 Oracle Cloud 缺失的 Console URL**

Oracle Cloud Console URL 格式：`https://cloud.oracle.com/resourcemanager/stacks/{id}`

```go
func (p *OracleProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
    if region == "" {
        region = p.region
    }
    base := "https://cloud.oracle.com"
    switch resourceType {
    case types.ResourceTypeInstance:
        return fmt.Sprintf("%s/compute/instance/%s?region=%s", base, id, region)
    case types.ResourceTypeVolume:
        return fmt.Sprintf("%s/blockstorage/bootvolume/%s?region=%s", base, id, region)
    case types.ResourceTypeNetwork:
        return fmt.Sprintf("%s/networking/vcn/%s?region=%s", base, id, region)
    case types.ResourceTypeDatabase:
        return fmt.Sprintf("%s/database/dedicated/%s?region=%s", base, id, region)
    case types.ResourceTypeLoadBalancer:
        return fmt.Sprintf("%s/networking/loadbalancer/%s?region=%s", base, id, region)
    case types.ResourceTypeBucket:
        return fmt.Sprintf("%s/object-storage/buckets/%s?region=%s", base, id, region)
    case types.ResourceTypeCluster:
        return fmt.Sprintf("%s/containers-kubernetes-engine/clusters/%s?region=%s", base, id, region)
    case types.ResourceTypeFunction:
        return fmt.Sprintf("%s/functions/applications/%s?region=%s", base, id, region)
    case types.ResourceTypeDNSZone:
        return fmt.Sprintf("%s/dns/zone/%s?region=%s", base, id, region)
    case types.ResourceTypeCertificate:
        return fmt.Sprintf("%s/certificates/overview", base)
    case types.ResourceTypeRedis:
        return fmt.Sprintf("%s/mysql/replicas/%s?region=%s", base, id, region)
    case types.ResourceTypeMQ:
        return fmt.Sprintf("%s/messaging/queues/%s?region=%s", base, id, region)
    case types.ResourceTypeCDN:
        return fmt.Sprintf("%s/cdn/overview", base)
    case types.ResourceTypeWAF:
        return fmt.Sprintf("%s/waf/overview", base)
    case types.ResourceTypeNATGateway:
        return fmt.Sprintf("%s/networking/natgateway/%s?region=%s", base, id, region)
    case types.ResourceTypeImage:
        return fmt.Sprintf("%s/compute/images/%s?region=%s", base, id, region)
    case types.ResourceTypeAPIGateway:
        return fmt.Sprintf("%s/api-management/gateways/%s?region=%s", base, id, region)
    case types.ResourceTypeLogService:
        return fmt.Sprintf("%s/logging/overview", base)
    case types.ResourceTypeSecurity:
        return fmt.Sprintf("%s/vcn/security/%s?region=%s", base, id, region)
    case types.ResourceTypeRegistry:
        return fmt.Sprintf("%s/registry/overview", base)
    default:
        return base
    }
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 1.5: 提交阶段 1 更改

- [ ] **Step 1: 提交更改**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && git add -A && git commit -m "feat(cloud): 完善各云厂商 Console URL

- Azure: 优化 GetConsoleURL 为精确资源路径
- 阿里云: 补充 Redis/KMS/API Gateway 等资源类型 URL
- 腾讯云: 补充 SCF/CLB/Redis 等资源类型 URL
- Oracle Cloud: 补充 Object Storage/Functions 等资源类型 URL"
```

---

## 阶段 2: 增强函数计算支持

**预计工时:** 2 小时

### Task 2.1: 扩展 Function 类型定义

**Files:**
- Modify: `internal/cloud/types/types.go:192-204`

- [ ] **Step 1: 阅读现有 Function 结构体**

```bash
sed -n '192,204p' /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/types/types.go
```

- [ ] **Step 2: 扩展 Function 结构体**

```go
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
	NASConfig    string                 `json:"nas_config,omitempty"`
	VPCConfig    string                 `json:"vpc_config,omitempty"`
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
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 2.2: 实现 AWS Lambda GetFunction

**Files:**
- Modify: `internal/cloud/providers/aws.go`

- [ ] **Step 1: 添加 GetFunction 方法到 AWS Provider**

```go
func (p *AWSProvider) GetFunction(ctx context.Context, functionName string) (*types.Function, error) {
    params := map[string]string{
        "FunctionName": functionName,
    }
    body, err := p.awsRequest(ctx, "lambda", "2014-11-11", "GET", "/2015-03-31/functions/"+functionName, params, nil)
    if err != nil {
        return nil, err
    }

    var resp struct {
        Configuration struct {
            FunctionName         string            `json:"FunctionName"`
            FunctionArn          string            `json:"FunctionArn"`
            Runtime              string            `json:"Runtime"`
            Handler             string            `json:"Handler"`
            Timeout              int               `json:"Timeout"`
            MemorySize          int               `json:"MemorySize"`
            LastModified        string            `json:"LastModified"`
            Description         string            `json:"Description"`
            Version             string            `json:"Version"`
            Architectures       []string          `json:"Architectures"`
            EphemeralStorage    struct {
                Size int `json:"Size"`
            } `json:"EphemeralStorage"`
            TracingConfig struct {
                Mode string `json:"Mode"`
            } `json:"TracingConfig"`
            PackageType string   `json:"PackageType"`
            Environment struct {
                Variables map[string]string `json:"Variables"`
            } `json:"Environment"`
        } `json:"Configuration"`
        Tags map[string]string `json:"Tags"`
    }

    if err := json.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    fn := &types.Function{
        ID:             resp.Configuration.FunctionArn,
        Name:           resp.Configuration.FunctionName,
        CloudType:      "aws",
        Region:         p.region,
        Status:         "active",
        Runtime:        resp.Configuration.Runtime,
        Handler:        resp.Configuration.Handler,
        Timeout:        resp.Configuration.Timeout,
        MemorySize:     resp.Configuration.MemorySize,
        LastModified:   resp.Configuration.LastModified,
        Description:    resp.Configuration.Description,
        Version:        resp.Configuration.Version,
        Architectures:  resp.Configuration.Architectures,
        TracingConfig:  resp.Configuration.TracingConfig.Mode,
        PackageType:    resp.Configuration.PackageType,
        Environment:    resp.Configuration.Environment.Variables,
        Tags:           resp.Tags,
    }

    return fn, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 2.3: 实现阿里云 FC GetFunction

**Files:**
- Modify: `internal/cloud/providers/alicloud.go`

- [ ] **Step 1: 添加 GetFunction 方法到阿里云 Provider**

```go
func (p *AlicloudProvider) GetFunction(ctx context.Context, serviceName, functionName string) (*types.Function, error) {
    params := map[string]string{
        "serviceName":  serviceName,
        "functionName": functionName,
    }
    body, err := p.signedRequest(ctx, "2016-03-14", "GET", "/services/"+serviceName+"/functions/"+functionName, params)
    if err != nil {
        return nil, err
    }

    var resp struct {
        FunctionID       string            `json:"functionId"`
        FunctionName     string            `json:"functionName"`
        ServiceName      string            `json:"serviceName"`
        Runtime         string            `json:"runtime"`
        Handler         string            `json:"handler"`
        Timeout         int               `json:"timeout"`
        MemorySize      int               `json:"memorySize"`
        LastModifiedTime string           `json:"lastModifiedTime"`
        Description     string            `json:"description"`
        NASConfig       struct {
            MountPointDomain string `json:"mountPointDomain"`
            NASRegion        string `json:"nasRegion"`
        } `json:"nasConfig"`
        VPCConfig       struct {
            VpcID         string `json:"vpcId"`
            VSwitchID     string `json:"vSwitchId"`
        } `json:"vpcConfig"`
        InternetAccess  string `json:"internetAccess"`
        Tags            map[string]string `json:"tags"`
    }

    if err := json.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    fn := &types.Function{
        ID:             resp.FunctionID,
        Name:           resp.FunctionName,
        CloudType:      "alicloud",
        Region:         p.region,
        Status:         "active",
        Runtime:        resp.Runtime,
        Handler:        resp.Handler,
        Timeout:        resp.Timeout,
        MemorySize:     resp.MemorySize,
        LastModified:   resp.LastModifiedTime,
        Description:    resp.Description,
        NASConfig:      fmt.Sprintf("%s:%s", resp.NASConfig.MountPointDomain, resp.NASConfig.NASRegion),
        VPCConfig:      fmt.Sprintf("vpc:%s, vswitch:%s", resp.VPCConfig.VpcID, resp.VPCConfig.VSwitchID),
        InternetAccess: resp.InternetAccess,
        Tags:           resp.Tags,
    }

    return fn, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 2.4: 实现腾讯云 SCF GetFunction

**Files:**
- Modify: `internal/cloud/providers/tencent.go`

- [ ] **Step 1: 添加 GetFunction 方法到腾讯云 Provider**

```go
func (p *TencentCloudProvider) GetFunction(ctx context.Context, functionName, namespace string) (*types.Function, error) {
    if namespace == "" {
        namespace = "default"
    }
    params := map[string]string{
        "functionName": functionName,
        "namespace":    namespace,
    }
    body, err := p.tencentRequest(ctx, "scf", "2018-04-16", "GET", "/v2/index.php", params)
    if err != nil {
        return nil, err
    }

    var resp struct {
        FunctionId      string            `json:"FunctionId"`
        FunctionName    string            `json:"FunctionName"`
        Namespace       string            `json:"Namespace"`
        Runtime        string            `json:"Runtime"`
        Handler        string            `json:"Handler"`
        Timeout        int               `json:"Timeout"`
        MemorySize     int               `json:"MemorySize"`
        ModTime        string            `json:"ModTime"`
        Description    string            `json:"Description"`
        Status         string            `json:"Status"`
        TriggerNum     int               `json:"TriggerNum"`
        CommitId       string            `json:"CommitId"`
        Tags           map[string]string `json:"Tags"`
    }

    if err := json.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    fn := &types.Function{
        ID:           resp.FunctionId,
        Name:         resp.FunctionName,
        CloudType:    "tencent",
        Region:       p.region,
        Status:       resp.Status,
        Runtime:      resp.Runtime,
        Handler:      resp.Handler,
        Timeout:      resp.Timeout,
        MemorySize:   resp.MemorySize,
        LastModified: resp.ModTime,
        Description:  resp.Description,
        Namespace:    resp.Namespace,
        TriggerNum:   resp.TriggerNum,
        CommitID:     resp.CommitId,
        Tags:         resp.Tags,
    }

    return fn, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 2.5: 提交阶段 2 更改

- [ ] **Step 1: 提交更改**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && git add -A && git commit -m "feat(cloud): 增强函数计算支持

- 扩展 types.Function 结构体，添加云厂商特定字段
- 实现 AWS Lambda GetFunction 方法
- 实现阿里云 FC GetFunction 方法
- 实现腾讯云 SCF GetFunction 方法"
```

---

## 阶段 3: 增强数据库支持

**预计工时:** 2 小时

### Task 3.1: 扩展 Database 类型定义

**Files:**
- Modify: `internal/cloud/types/types.go:141-152`

- [ ] **Step 1: 阅读现有 Database 结构体**

```bash
sed -n '141,152p' /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/types/types.go
```

- [ ] **Step 2: 扩展 Database 结构体**

```go
type Database struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	Engine      string                 `json:"engine"`
	EngineVer   string                 `json:"engine_version"`
	InstanceCls string                 `json:"instance_class"`
	// AWS RDS 特定字段
	Endpoint           string `json:"endpoint,omitempty"`
	Port              int    `json:"port,omitempty"`
	AllocatedStorage  int    `json:"allocated_storage,omitempty"`
	StorageType       string `json:"storage_type,omitempty"`
	MultiAZ           bool   `json:"multi_az,omitempty"`
	PubliclyAccessible bool  `json:"publicly_accessible,omitempty"`
	BackupRetention   int    `json:"backup_retention,omitempty"`
	PreferredBackup   string `json:"preferred_backup_window,omitempty"`
	PreferredMaintenance string `json:"preferred_maintenance_window,omitempty"`
	CAIdentifier      string `json:"ca_certificate_identifier,omitempty"`
	// Azure SQL 特定字段
	ServerName         string `json:"server_name,omitempty"`
	DatabaseName       string `json:"database_name,omitempty"`
	Collation          string `json:"collation,omitempty"`
	CatalogCollation   string `json:"catalog_collation,omitempty"`
	CreateMode         string `json:"create_mode,omitempty"`
	MaxSizeBytes       int64  `json:"max_size_bytes,omitempty"`
	ZoneRedundant      bool   `json:"zone_redundant,omitempty"`
	// 阿里云 RDS 特定字段
	DBInstanceIPArray  string `json:"db_instance_ip_array,omitempty"`
	DBInstanceStorageType string `json:"db_instance_storage_type,omitempty"`
	PayType            string `json:"pay_type,omitempty"`
	LockMode           string `json:"lock_mode,omitempty"`
	SupportUpgradeAccountType string `json:"support_upgrade_account_type,omitempty"`
	// 腾讯云 CDB 特定字段
	CDBType    string `json:"cdb_type,omitempty"`
	DeviceType string `json:"device_type,omitempty"`
	InnerAddr  string `json:"inner_addr,omitempty"`
	WANPort    int    `json:"wan_port,omitempty"`
	WANInfo    string `json:"wan_info,omitempty"`
	// Oracle DB 特定字段
	DBHomeID        string `json:"db_home_id,omitempty"`
	DatabaseEdition string `json:"database_edition,omitempty"`
	LicenseType     string `json:"license_type,omitempty"`
	CharacterSet    string `json:"character_set,omitempty"`
	// 通用字段
	Spec map[string]interface{} `json:"spec"`
	Tags map[string]string      `json:"tags"`
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 3.2: 实现 AWS RDS GetDatabase

**Files:**
- Modify: `internal/cloud/providers/aws.go`

- [ ] **Step 1: 添加 GetDatabase 方法到 AWS Provider**

```go
func (p *AWSProvider) GetDatabase(ctx context.Context, dbinstanceIdentifier string) (*types.Database, error) {
    params := map[string]string{
        "DBInstanceIdentifier": dbinstanceIdentifier,
    }
    body, err := p.awsRequest(ctx, "rds", "2014-10-31", "GET", "/", params, nil)
    if err != nil {
        return nil, err
    }

    var resp struct {
        DBInstance struct {
            DBInstanceIdentifier     string `json:"DBInstanceIdentifier"`
            DBInstanceClass          string `json:"DBInstanceClass"`
            Engine                  string `json:"Engine"`
            EngineVersion           string `json:"EngineVersion"`
            DBInstanceStatus        string `json:"DBInstanceStatus"`
            Endpoint struct {
                Address string `json:"Address"`
                Port    int    `json:"Port"`
            } `json:"Endpoint"`
            AllocatedStorage      int    `json:"AllocatedStorage"`
            StorageType           string `json:"StorageType"`
            MultiAZ               bool   `json:"MultiAZ"`
            PubliclyAccessible    bool   `json:"PubliclyAccessible"`
            BackupRetentionPeriod int    `json:"BackupRetentionPeriod"`
            PreferredBackupWindow string `json:"PreferredBackupWindow"`
            PreferredMaintenanceWindow string `json:"PreferredMaintenanceWindow"`
            CACertificateIdentifier string `json:"CACertificateIdentifier"`
            Tags                  map[string]string `json:"Tags"`
        } `json:"DBInstance"`
    }

    if err := json.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    db := &types.Database{
        ID:              resp.DBInstance.DBInstanceIdentifier,
        Name:            resp.DBInstance.DBInstanceIdentifier,
        CloudType:       "aws",
        Region:          p.region,
        Status:          resp.DBInstance.DBInstanceStatus,
        Engine:          resp.DBInstance.Engine,
        EngineVer:       resp.DBInstance.EngineVersion,
        InstanceCls:     resp.DBInstance.DBInstanceClass,
        Endpoint:        resp.DBInstance.Endpoint.Address,
        Port:            resp.DBInstance.Endpoint.Port,
        AllocatedStorage: resp.DBInstance.AllocatedStorage,
        StorageType:     resp.DBInstance.StorageType,
        MultiAZ:         resp.DBInstance.MultiAZ,
        PubliclyAccessible: resp.DBInstance.PubliclyAccessible,
        BackupRetention:  resp.DBInstance.BackupRetentionPeriod,
        PreferredBackup: resp.DBInstance.PreferredBackupWindow,
        PreferredMaintenance: resp.DBInstance.PreferredMaintenanceWindow,
        CAIdentifier:    resp.DBInstance.CACertificateIdentifier,
        Tags:            resp.DBInstance.Tags,
    }

    return db, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 3.3: 实现阿里云 RDS GetDatabase

**Files:**
- Modify: `internal/cloud/providers/alicloud.go`

- [ ] **Step 1: 添加 GetDatabase 方法到阿里云 Provider**

```go
func (p *AlicloudProvider) GetDatabase(ctx context.Context, instanceID string) (*types.Database, error) {
    params := map[string]string{
        "Action":           "DescribeDBInstanceAttribute",
        "DBInstanceId":     instanceID,
    }
    body, err := p.signedRequest(ctx, "2014-08-15", "GET", "/", params)
    if err != nil {
        return nil, err
    }

    var resp struct {
        Items struct {
            DBInstanceAttribute []struct {
                DBInstanceID         string            `json:"DBInstanceId"`
                DBInstanceDesc       string            `json:"DBInstanceDescription"`
                DBInstanceClass      string            `json:"DBInstanceClass"`
                DBInstanceType       string            `json:"DBInstanceType"`
                Engine               string            `json:"Engine"`
                EngineVersion        string            `json:"EngineVersion"`
                DBInstanceStatus     string            `json:"DBInstanceStatus"`
                PayType              string            `json:"PayType"`
                LockMode             string            `json:"LockMode"`
                ZoneID               string            `json:"ZoneId"`
                DBInstanceIPArray    string            `json:"DBInstanceIPArray"`
                DBInstanceStorageType string           `json:"DBInstanceStorageType"`
                Tags                 map[string]string `json:"Tags"`
            } `json:"DBInstanceAttribute"`
        } `json:"Items"`
    }

    if err := json.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    if len(resp.Items.DBInstanceAttribute) == 0 {
        return nil, fmt.Errorf("database instance not found")
    }

    inst := resp.Items.DBInstanceAttribute[0]

    db := &types.Database{
        ID:              inst.DBInstanceID,
        Name:            inst.DBInstanceID,
        CloudType:       "alicloud",
        Region:          p.region,
        Status:          inst.DBInstanceStatus,
        Engine:          inst.Engine,
        EngineVer:       inst.EngineVersion,
        InstanceCls:     inst.DBInstanceClass,
        PayType:        inst.PayType,
        LockMode:       inst.LockMode,
        DBInstanceIPArray: inst.DBInstanceIPArray,
        DBInstanceStorageType: inst.DBInstanceStorageType,
        Tags:           inst.Tags,
    }

    return db, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 3.4: 提交阶段 3 更改

- [ ] **Step 1: 提交更改**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && git add -A && git commit -m "feat(cloud): 增强数据库支持

- 扩展 types.Database 结构体，添加云厂商特定字段
- 实现 AWS RDS GetDatabase 方法
- 实现阿里云 RDS GetDatabase 方法"
```

---

## 阶段 4: 增强对象存储支持

**预计工时:** 2 小时

### Task 4.1: 扩展 Bucket 类型定义

**Files:**
- Modify: `internal/cloud/types/types.go:166-177`

- [ ] **Step 1: 阅读现有 Bucket 结构体**

```bash
sed -n '166,177p' /Users/xinruiwen/AI-Wen/MultiCloud-Manager/internal/cloud/types/types.go
```

- [ ] **Step 2: 扩展 Bucket 结构体**

```go
type Bucket struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	CloudType   string                 `json:"cloud_type"`
	Region      string                 `json:"region"`
	Status      string                 `json:"status"`
	StorageCls  string                 `json:"storage_class,omitempty"`
	Versioning  bool                   `json:"versioning"`
	Encrypted   bool                   `json:"encrypted"`
	// AWS S3 特定字段
	CreationDate        string `json:"creation_date,omitempty"`
	ObjectCount         int64  `json:"object_count,omitempty"`
	TotalSize           int64  `json:"total_size,omitempty"`
	WebsiteConfiguration string `json:"website_configuration,omitempty"`
	CORSRules           int    `json:"cors_rules,omitempty"`
	LifecycleRules      int    `json:"lifecycle_rules,omitempty"`
	// Azure Blob 特定字段
	AccountKind            string `json:"account_kind,omitempty"`
	AccessTier             string `json:"access_tier,omitempty"`
	HTTPSOnly              bool   `json:"https_only,omitempty"`
	AllowBlobPublicAccess  bool   `json:"allow_blob_public_access,omitempty"`
	NetworkRuleSet         string `json:"network_rule_set,omitempty"`
	// 阿里云 OSS 特定字段
	BucketDomain      string `json:"bucket_domain,omitempty"`
	LastModified      string `json:"last_modified,omitempty"`
	DataRedundancyType string `json:"data_redundancy_type,omitempty"`
	ResourceGroupID   string `json:"resource_group_id,omitempty"`
	// 腾讯云 COS 特定字段
	BucketID      string `json:"bucket_id,omitempty"`
	AppID         string `json:"app_id,omitempty"`
	COSBucketURL  string `json:"cos_bucket_url,omitempty"`
	Logging       string `json:"logging,omitempty"`
	// Oracle OBS 特定字段
	ObjectCount   int    `json:"object_count,omitempty"`
	StorageTier   string `json:"storage_tier,omitempty"`
	// 通用字段
	Spec map[string]interface{} `json:"spec"`
	Tags map[string]string      `json:"tags"`
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 4.2: 实现 AWS S3 GetBucket

**Files:**
- Modify: `internal/cloud/providers/aws.go`

- [ ] **Step 1: 添加 GetBucket 方法到 AWS Provider**

```go
func (p *AWSProvider) GetBucket(ctx context.Context, bucketName string) (*types.Bucket, error) {
    params := map[string]string{
        "bucket": bucketName,
    }
    body, err := p.awsRequest(ctx, "s3", "2006-03-01", "GET", "/", params, nil)
    if err != nil {
        return nil, err
    }

    var resp struct {
        Name            string `json:"Name"`
        CreationDate    string `json:"CreationDate"`
        ExtranetEndpoint string `json:"ExtranetEndpoint"`
        IntranetEndpoint string `json:"IntranetEndpoint"`
    }

    if err := xml.Unmarshal(body, &resp); err != nil {
        return nil, err
    }

    // 获取 bucket 标签
    tagParams := map[string]string{"bucket": bucketName}
    tagBody, _ := p.awsRequest(ctx, "s3", "2006-03-01", "GET", "/?tagging", tagParams, nil)
    var tags map[string]string
    if tagBody != nil {
        var tagResp struct {
            TagSet []struct {
                Key   string `xml:"Key"`
                Value string `xml:"Value"`
            } `xml:"TagSet>Tag"`
        }
        xml.Unmarshal(tagBody, &tagResp)
        tags = make(map[string]string)
        for _, t := range tagResp.TagSet {
            tags[t.Key] = t.Value
        }
    }

    bucket := &types.Bucket{
        ID:           resp.Name,
        Name:         resp.Name,
        CloudType:    "aws",
        Region:       p.region,
        Status:       "active",
        CreationDate: resp.CreationDate,
        Tags:         tags,
    }

    return bucket, nil
}
```

- [ ] **Step 2: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 4.3: 提交阶段 4 更改

- [ ] **Step 1: 提交更改**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && git add -A && git commit -m "feat(cloud): 增强对象存储支持

- 扩展 types.Bucket 结构体，添加云厂商特定字段
- 实现 AWS S3 GetBucket 方法"
```

---

## 阶段 5: AI 智能资源分析

**预计工时:** 4 小时

### Task 5.1: 创建 analyzer 模块结构

**Files:**
- Create: `internal/cloud/analyzer/analyzer.go`
- Create: `internal/cloud/analyzer/rules.go`

- [ ] **Step 1: 创建 analyzer.go**

```go
package analyzer

import (
	"context"
	"multicloud/internal/cloud/types"
)

// ResourceAnalyzer 提供云资源智能分析功能
type ResourceAnalyzer struct {
	providers map[string]types.Provider
}

// AnalysisResult 资源分析结果
type AnalysisResult struct {
	Category    string   `json:"category"`    // "cost", "security", "performance", "reliability"
	Severity    string   `json:"severity"`    // "high", "medium", "low"
	Title       string   `json:"title"`
	Description string   `json:"description"`
	ResourceID  string   `json:"resource_id"`
	ResourceName string  `json:"resource_name"`
	CloudType   string   `json:"cloud_type"`
	Region      string   `json:"region"`
	Suggestion  string   `json:"suggestion"`
	EstimatedSavings float64 `json:"estimated_savings"` // 预估节省金额（美元/月）
}

// NewResourceAnalyzer 创建分析器实例
func NewResourceAnalyzer(providers map[string]types.Provider) *ResourceAnalyzer {
	return &ResourceAnalyzer{
		providers: providers,
	}
}

// AnalyzeResources 分析所有云厂商资源
func (a *ResourceAnalyzer) AnalyzeResources(ctx context.Context) ([]AnalysisResult, error) {
	var results []AnalysisResult

	for cloudType, provider := range a.providers {
		// 分析 VM 实例
		instances, err := provider.ListInstances(ctx, types.ListOptions{Limit: 100})
		if err == nil {
			for _, inst := range instances {
				results = append(results, a.analyzeInstance(inst)...)
			}
		}

		// 分析数据库
		databases, err := provider.ListDatabases(ctx, types.ListOptions{Limit: 100})
		if err == nil {
			for _, db := range databases {
				results = append(results, a.analyzeDatabase(db)...)
			}
		}

		// 分析存储桶
		buckets, err := provider.ListBuckets(ctx, types.ListOptions{Limit: 100})
		if err == nil {
			for _, bucket := range buckets {
				results = append(results, a.analyzeBucket(bucket)...)
			}
		}

		// 分析函数
		functions, err := provider.ListFunctions(ctx, types.ListOptions{Limit: 100})
		if err == nil {
			for _, fn := range functions {
				results = append(results, a.analyzeFunction(fn)...)
			}
		}
	}

	return results, nil
}
```

- [ ] **Step 2: 创建 rules.go**

```go
package analyzer

import (
	"strings"
	"multicloud/internal/cloud/types"
)

// analyzeInstance 分析 VM 实例
func (a *ResourceAnalyzer) analyzeInstance(inst types.Instance) []AnalysisResult {
	var results []AnalysisResult

	// 检查停止但未释放的实例（成本浪费）
	if strings.ToLower(inst.Status) == "stopped" || strings.ToLower(inst.Status) == "stopping" {
		results = append(results, AnalysisResult{
			Category:    "cost",
			Severity:    "medium",
			Title:       "已停止的实例仍在计费",
			Description: "实例 " + inst.Name + " 处于 " + inst.Status + " 状态，但仍会产生存储费用",
			ResourceID:  inst.ID,
			ResourceName: inst.Name,
			CloudType:   inst.CloudType,
			Region:      inst.Region,
			Suggestion:  "如果不再需要，请释放该实例以节省成本",
			EstimatedSavings: 20.0, // 估算节省
		})
	}

	// 检查安全组规则（公开访问）
	if sg, ok := inst.Spec["security_groups"].([]interface{}); ok {
		for _, s := range sg {
			if sgMap, ok := s.(map[string]interface{}); ok {
				if rules, ok := sgMap["ip_permissions"].([]interface{}); ok {
					for _, r := range rules {
						if rule, ok := r.(map[string]interface{}); ok {
							if ipRanges, ok := rule["ip_ranges"].([]interface{}); ok {
								for _, ip := range ipRanges {
									if cidr, ok := ip.(map[string]interface{}); ok {
										if cidrStr, ok := cidr["cidr_ip"].(string); ok {
											if cidrStr == "0.0.0.0/0" {
												results = append(results, AnalysisResult{
													Category:    "security",
													Severity:    "high",
													Title:       "安全组允许公开访问",
													Description: "实例 " + inst.Name + " 的安全组允许 0.0.0.0/0 访问",
													ResourceID:  inst.ID,
													ResourceName: inst.Name,
													CloudType:   inst.CloudType,
													Region:      inst.Region,
													Suggestion:  "限制访问来源 IP 范围，避免安全风险",
													EstimatedSavings: 0,
												})
												break
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return results
}

// analyzeDatabase 分析数据库实例
func (a *ResourceAnalyzer) analyzeDatabase(db types.Database) []AnalysisResult {
	var results []AnalysisResult

	// 检查未启用 MultiAZ 的生产数据库
	if db.MultiAZ == false && strings.ToLower(db.Status) == "available" {
		results = append(results, AnalysisResult{
			Category:    "reliability",
			Severity:    "medium",
			Title:       "数据库未启用多可用区",
			Description: "数据库 " + db.Name + " 未启用 MultiAZ，存在单点故障风险",
			ResourceID:  db.ID,
			ResourceName: db.Name,
			CloudType:   db.CloudType,
			Region:      db.Region,
			Suggestion:  "启用 MultiAZ 提高数据库可用性",
			EstimatedSavings: 0,
		})
	}

	// 检查公开访问的数据库
	if db.PubliclyAccessible == true {
		results = append(results, AnalysisResult{
			Category:    "security",
			Severity:    "high",
			Title:       "数据库可公开访问",
			Description: "数据库 " + db.Name + " 配置为公开可访问",
			ResourceID:  db.ID,
			ResourceName: db.Name,
			CloudType:   db.CloudType,
			Region:      db.Region,
			Suggestion:  "关闭公开访问，使用 VPC 或 VPN 连接",
			EstimatedSavings: 0,
		})
	}

	return results
}

// analyzeBucket 分析存储桶
func (a *ResourceAnalyzer) analyzeBucket(bucket types.Bucket) []AnalysisResult {
	var results []AnalysisResult

	// 检查未加密的存储桶
	if !bucket.Encrypted {
		results = append(results, AnalysisResult{
			Category:    "security",
			Severity:    "medium",
			Title:       "存储桶未启用加密",
			Description: "存储桶 " + bucket.Name + " 未启用服务器端加密",
			ResourceID:  bucket.ID,
			ResourceName: bucket.Name,
			CloudType:   bucket.CloudType,
			Region:      bucket.Region,
			Suggestion:  "启用加密保护数据安全",
			EstimatedSavings: 0,
		})
	}

	// 检查未启用版本控制的存储桶
	if !bucket.Versioning {
		results = append(results, AnalysisResult{
			Category:    "reliability",
			Severity:    "low",
			Title:       "存储桶未启用版本控制",
			Description: "存储桶 " + bucket.Name + " 未启用对象版本控制",
			ResourceID:  bucket.ID,
			ResourceName: bucket.Name,
			CloudType:   bucket.CloudType,
			Region:      bucket.Region,
			Suggestion:  "启用版本控制以支持数据恢复",
			EstimatedSavings: 0,
		})
	}

	return results
}

// analyzeFunction 分析函数
func (a *ResourceAnalyzer) analyzeFunction(fn types.Function) []AnalysisResult {
	var results []AnalysisResult

	// 检查超时设置过短
	if fn.Timeout < 30 && fn.Timeout > 0 {
		results = append(results, AnalysisResult{
			Category:    "performance",
			Severity:    "low",
			Title:       "函数超时设置较短",
			Description: "函数 " + fn.Name + " 超时设置为 " + string(rune(fn.Timeout)) + " 秒",
			ResourceID:  fn.ID,
			ResourceName: fn.Name,
			CloudType:   fn.CloudType,
			Region:      fn.Region,
			Suggestion:  "如果函数需要更长执行时间，请增加超时设置",
			EstimatedSavings: 0,
		})
	}

	return results
}
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 5.2: 创建 API 端点

**Files:**
- Create: `internal/api/analyzer.go`
- Modify: `internal/api/router.go`

- [ ] **Step 1: 创建 analyzer API 处理器**

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
)

// AnalyzeResources 处理资源分析请求
func (h *Handler) AnalyzeResources(w http.ResponseWriter, r *http.Request) {
	ctx := context.WithValue(r.Context(), "token", h.token)

	results, err := h.analyzer.AnalyzeResources(ctx)
	if err != nil {
		h.error(w, r, err)
		return
	}

	h.json(w, r, results)
}
```

- [ ] **Step 2: 在路由中注册分析接口**

```go
// 在 router.go 中添加路由
router.HandleFunc("/api/cloud/analyze", handler.AnalyzeResources).Methods("GET", "OPTIONS")
```

- [ ] **Step 3: 验证代码编译通过**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./...
```

### Task 5.3: 提交阶段 5 更改

- [ ] **Step 1: 提交更改**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && git add -A && git commit -m "feat(cloud): 添加 AI 智能资源分析功能

- 创建 analyzer 模块，实现成本/安全/性能/可靠性分析
- 添加资源分析 API 端点
- 实现 VM、数据库、存储桶、函数的分析规则"
```

---

## 最终验证

- [ ] **Step 1: 运行完整测试**

```bash
cd /Users/xinruiwen/AI-Wen/MultiCloud-Manager && go build ./... && go test ./...
```

- [ ] **Step 2: 推送到 GitHub**

```bash
git push origin cloud
```

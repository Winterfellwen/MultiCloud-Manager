# Render Cloud Provider Design

## Overview

Add Render (https://render.com) as a supported cloud provider. Render is a PaaS platform (similar to Heroku), fundamentally different from the existing 5 IaaS providers (AWS, Azure, Aliyun, Tencent, Huawei).

## Key Differences from IaaS Providers

| Concept | IaaS (AWS/Azure) | PaaS (Render) |
|---------|------------------|---------------|
| Compute Unit | Virtual Machine | Service (container) |
|规格 Selection | CPU/Memory | Plan (free/starter/pro) |
| Image | AMI/Image | Git repo / Docker image |
| Regions | 30+ | 5 (oregon, frankfurt, ohio, singapore, virginia) |
| SDK | Provider-specific SDKs | Pure REST API (no SDK needed) |

## API Details

- **Base URL**: `https://api.render.com/v1`
- **Authentication**: Bearer Token (API Key from Account Settings)
- **Rate Limiting**: Standard API rate limits apply

### Supported Operations

| Category | Operations |
|----------|-----------|
| Services | List, Get, Create, Delete, Restart, Suspend, Resume, Scale |
| PostgreSQL | List, Get, Create, Delete, Restart, Suspend, Resume |
| Redis (Key Value) | List, Get, Create, Delete, Suspend, Resume |
| Monitoring | CPU, Memory, Bandwidth, HTTP requests/latency, Disk usage |
| Deploys | List, Trigger, Cancel, Rollback |

## Architecture

### File Structure

```
cloud-service/src/providers/render/
├── index.ts          # RenderProvider implementing ICloudProvider
├── api.ts            # Render REST API client (fetch + auth)
└── types.ts          # Render API response type definitions
```

### Resource Type Mapping

| Render Resource | Maps to ResourceType |
|-----------------|---------------------|
| Web Service / Background Worker / Cron Job | `instance` |
| PostgreSQL | `database` |
| Redis (Key Value) | `cache` |
| Persistent Disk | `disk` |

### Service Type Mapping

| Render Service Type | Display Name |
|---------------------|--------------|
| `web_service` | Web 服务 |
| `static_site` | 静态站点 |
| `background_worker` | 后台 Worker |
| `cron_job` | 定时任务 |
| `private_service` | 私有服务 |

### Plan Mapping

| Render Plan | Display Name |
|-------------|--------------|
| `free` | 免费 |
| `starter` | 入门 |
| `standard` | 标准 |
| `pro` | 专业 |
| `pro_plus` | 专业增强 |
| `custom` | 自定义 |

## Implementation Steps

### Step 1: Add Render to Provider Registry

**File**: `cloud-service/src/providers/types.ts`
- Add `'render'` to the provider union type
- Add `render` to `RESOURCE_TYPE_META` supported providers for: `instance`, `database`, `cache`, `disk`

**File**: `cloud-service/src/providers/registry.ts`
- Add `RenderConfig` interface: `{ apiKey: string }`
- Add lazy factory for render provider
- Add `'render'` to `ProviderConfig`

### Step 2: Create Render API Client

**File**: `cloud-service/src/providers/render/api.ts`

```typescript
class RenderAPIClient {
  private baseUrl = 'https://api.render.com/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(path: string, options?: RequestInit): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options?.headers,
      },
    });
    if (!res.ok) throw new RenderAPIError(res.status, await res.text());
    return res.json();
  }

  // Services
  async listServices(params?: { limit?: number; cursor?: string }): Promise<ServiceResponse[]>
  async getService(id: string): Promise<Service>
  async createService(opts: CreateServiceOpts): Promise<Service>
  async deleteService(id: string): Promise<void>
  async restartService(id: string): Promise<void>
  async suspendService(id: string): Promise<void>
  async resumeService(id: string): Promise<void>
  async scaleService(id: string, instances: number): Promise<void>

  // PostgreSQL
  async listPostgresInstances(): Promise<PostgresInstance[]>
  async getPostgresInstance(id: string): Promise<PostgresInstance>
  async createPostgresInstance(opts: CreatePostgresOpts): Promise<PostgresInstance>
  async deletePostgresInstance(id: string): Promise<void>
  async restartPostgresInstance(id: string): Promise<void>

  // Redis (Key Value)
  async listKeyValueInstances(): Promise<KeyValueInstance[]>
  async getKeyValueInstance(id: string): Promise<KeyValueInstance>

  // Metrics
  async getCpuUsage(resourceIds: string[], start: string, end: string): Promise<MetricResponse>
  async getMemoryUsage(resourceIds: string[], start: string, end: string): Promise<MetricResponse>
  async getBandwidthUsage(resourceIds: string[], start: string, end: string): Promise<MetricResponse>
  async getHttpRequestCount(resourceIds: string[], start: string, end: string): Promise<MetricResponse>

  // Workspaces
  async listWorkspaces(): Promise<Workspace[]>
}
```

### Step 3: Implement ICloudProvider

**File**: `cloud-service/src/providers/render/index.ts`

```typescript
export class RenderProvider implements ICloudProvider {
  readonly name = 'render';
  readonly displayName = 'Render';

  private api: RenderAPIClient;
  private workspaceId: string;

  constructor(config: RenderConfig) {
    this.api = new RenderAPIClient(config.apiKey);
  }

  // Instance lifecycle (maps to services)
  async listInstances(region?: string): Promise<Instance[]> {
    const services = await this.api.listServices();
    return services.map(s => this.mapServiceToInstance(s));
  }

  async getInstance(id: string): Promise<Instance> {
    const service = await this.api.getService(id);
    return this.mapServiceToInstance(service);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const service = await this.api.createService({
      name: opts.name,
      serviceType: 'web_service',
      // ... other opts
    });
    return this.mapServiceToInstance(service);
  }

  async deleteInstance(id: string): Promise<void> {
    await this.api.deleteService(id);
  }

  async startInstance(id: string): Promise<void> {
    await this.api.resumeService(id);
  }

  async stopInstance(id: string): Promise<void> {
    await this.api.suspendService(id);
  }

  async rebootInstance(id: string): Promise<void> {
    await this.api.restartService(id);
  }

  // Metadata
  async listRegions(): Promise<Region[]> {
    return [
      { id: 'oregon', name: 'Oregon (US West)' },
      { id: 'frankfurt', name: 'Frankfurt (EU Central)' },
      { id: 'ohio', name: 'Ohio (US East)' },
      { id: 'singapore', name: 'Singapore (Asia Pacific)' },
      { id: 'virginia', name: 'Virginia (US East)' },
    ];
  }

  async listImages(): Promise<Image[]> {
    return []; // Render uses Git repos / Docker images, not traditional images
  }

  async listInstanceTypes(region: string): Promise<InstanceType[]> {
    return [
      { id: 'free', name: 'Free', cpu: 0.1, memoryMb: 256, monthlyCost: 0 },
      { id: 'starter', name: 'Starter', cpu: 1, memoryMb: 2048, monthlyCost: 7 },
      { id: 'standard', name: 'Standard', cpu: 2, memoryMb: 4096, monthlyCost: 25 },
      { id: 'pro', name: 'Pro', cpu: 4, memoryMb: 8192, monthlyCost: 85 },
      { id: 'pro_plus', name: 'Pro Plus', cpu: 8, memoryMb: 16384, monthlyCost: 175 },
    ];
  }

  // Monitoring
  async getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]> {
    const start = timeRange.start.toISOString();
    const end = timeRange.end.toISOString();
    const [cpu, memory] = await Promise.all([
      this.api.getCpuUsage([id], start, end),
      this.api.getMemoryUsage([id], start, end),
    ]);
    // ... map to MetricData[]
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // Render doesn't have a cost API, return plan-based estimate
    return { totalCost: 0, currency: 'USD', breakdown: [] };
  }

  // Generic resources
  async listResources(resourceType: ResourceType, region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': return this.listInstances(region);
      case 'database': return this.listDatabases();
      case 'cache': return this.listCaches();
      case 'disk': return this.listDisks();
      default: return [];
    }
  }

  // ... other methods

  private mapServiceToInstance(service: Service): Instance {
    return {
      id: service.id,
      name: service.name,
      provider: 'render',
      providerInstanceId: service.id,
      region: service.region,
      status: this.mapStatus(service.status),
      cpu: service.serviceDetails?.plan ? this.getPlanCpu(service.serviceDetails.plan) : 0,
      memoryMb: service.serviceDetails?.plan ? this.getPlanMemory(service.serviceDetails.plan) : 0,
      publicIp: service.serviceDetails?.url || '',
      monthlyCost: this.getPlanCost(service.serviceDetails?.plan || 'free'),
      tags: {},
      createdAt: new Date(service.createdAt),
    };
  }

  private mapStatus(status: string): InstanceStatus {
    switch (status) {
      case 'live': return 'running';
      case 'suspended': return 'stopped';
      case 'deploying': return 'pending';
      case 'deprovisioning': return 'pending';
      default: return 'error';
    }
  }
}
```

### Step 4: Add Render SDK Package

**File**: `cloud-service/package.json`

No new package needed - Render uses pure REST API with `fetch`.

### Step 5: Update Frontend

**File**: `web-console/src/pages/CloudAccounts.tsx`
- Add `'render'` to the providers list with display name "Render"

**File**: `web-console/src/components/Sidebar.tsx`
- No changes needed (Render appears through cloud accounts)

### Step 6: Environment Configuration

**File**: `.env`
```
RENDER_API_KEY=
```

## Error Handling

- 401 Unauthorized → Invalid API key
- 404 Not Found → Resource not found
- 429 Rate Limited → Retry with exponential backoff
- 500 Server Error → Log and return error message

## Testing

1. Unit test the API client with mock responses
2. Integration test with real Render API key
3. Test service lifecycle: create → list → restart → suspend → resume → delete
4. Test database operations: list PostgreSQL instances
5. Test metrics retrieval

## Limitations

- Render doesn't support creating services from the API with full configuration (requires Git repo or Docker image)
- No cost tracking API (plan-based estimates only)
- Limited regions (5 vs 30+ for IaaS providers)
- No traditional VM instance types (uses plans instead)

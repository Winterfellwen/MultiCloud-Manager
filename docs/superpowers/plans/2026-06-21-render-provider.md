# Render Cloud Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Render (PaaS) as a supported cloud provider with service management, database/Redis support, and monitoring metrics.

**Architecture:** Pure REST API client (no SDK needed) implementing `ICloudProvider`. Render services map to `instance` resources, PostgreSQL to `database`, Redis to `cache`. Authentication via Bearer token.

**Tech Stack:** TypeScript, Node.js fetch API, PostgreSQL (existing schema)

---

## File Structure

```
cloud-service/src/providers/render/
├── types.ts          # Render API response type definitions
├── api.ts            # Render REST API client (fetch + auth)
└── index.ts          # RenderProvider implementing ICloudProvider

cloud-service/src/providers/
├── types.ts          # Add 'render' to RESOURCE_TYPE_META
├── registry.ts       # Add render factory + config type

web-console/src/pages/
├── CloudAccounts.tsx  # Add render to providers list
```

---

### Task 1: Add Render to Provider Types

**Files:**
- Modify: `cloud-service/src/providers/types.ts:292-303`

- [ ] **Step 1: Update RESOURCE_TYPE_META to include 'render'**

```typescript
// cloud-service/src/providers/types.ts
// Line 293: Add 'render' to instance supportedProviders
{ type: 'instance', displayName: '云服务器', iconName: 'server', category: 'compute', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
// Line 294: Add 'render' to disk
{ type: 'disk', displayName: '云磁盘', iconName: 'hard-drive', category: 'storage', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
// Line 296: Add 'render' to database
{ type: 'database', displayName: '数据库', iconName: 'database', category: 'database', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
// Line 297: Add 'render' to cache
{ type: 'cache', displayName: '缓存', iconName: 'zap', category: 'database', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloud-service && npx tsc --noEmit`
Expected: No errors (render is just a string added to arrays)

---

### Task 2: Create Render API Types

**Files:**
- Create: `cloud-service/src/providers/render/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// cloud-service/src/providers/render/types.ts

export interface RenderConfig {
  apiKey: string;
}

// ===== Service Types =====
export type RenderServiceType = 'web_service' | 'static_site' | 'background_worker' | 'cron_job' | 'private_service';
export type RenderServiceStatus = 'live' | 'suspended' | 'deploying' | 'deprovisioning' | 'deleted' | 'cooldown';
export type RenderPlan = 'free' | 'starter' | 'standard' | 'pro' | 'pro_plus' | 'custom';

export interface RenderService {
  id: string;
  name: string;
  type: RenderServiceType;
  region: string;
  status: RenderServiceStatus;
  createdAt: string;
  updatedAt: string;
  serviceDetails?: RenderServiceDetails;
}

export interface RenderServiceDetails {
  url?: string;
  branch?: string;
  plan?: RenderPlan;
  autoDeploy?: string;
  env?: string;
}

// ===== Database Types =====
export type RenderDatabaseType = 'postgresql' | 'redis';

export interface RenderDatabase {
  id: string;
  name: string;
  databaseType: RenderDatabaseType;
  region: string;
  status: RenderServiceStatus;
  createdAt: string;
  databaseDetails?: RenderDatabaseDetails;
}

export interface RenderDatabaseDetails {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  plan?: RenderPlan;
}

// ===== API Response Types =====
export interface RenderListResponse<T> {
  data: T[];
}

export interface RenderError {
  message: string;
  code?: string;
}

// ===== Metrics Types =====
export interface RenderMetricResponse {
  data: RenderMetricDataPoint[];
}

export interface RenderMetricDataPoint {
  values: number[];
  timestamps: string[];
}

// ===== Plan Pricing =====
export const RENDER_PLAN_SPECS: Record<RenderPlan, { cpu: number; memoryMb: number; monthlyCost: number; displayName: string }> = {
  free: { cpu: 0.1, memoryMb: 256, monthlyCost: 0, displayName: '免费' },
  starter: { cpu: 1, memoryMb: 2048, monthlyCost: 7, displayName: '入门' },
  standard: { cpu: 2, memoryMb: 4096, monthlyCost: 25, displayName: '标准' },
  pro: { cpu: 4, memoryMb: 8192, monthlyCost: 85, displayName: '专业' },
  pro_plus: { cpu: 8, memoryMb: 16384, monthlyCost: 175, displayName: '专业增强' },
  custom: { cpu: 4, memoryMb: 8192, monthlyCost: 100, displayName: '自定义' },
};

// ===== Region Mapping =====
export const RENDER_REGIONS: { id: string; name: string }[] = [
  { id: 'oregon', name: 'Oregon (US West)' },
  { id: 'frankfurt', name: 'Frankfurt (EU Central)' },
  { id: 'ohio', name: 'Ohio (US East)' },
  { id: 'singapore', name: 'Singapore (Asia Pacific)' },
  { id: 'virginia', name: 'Virginia (US East)' },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloud-service && npx tsc --noEmit`
Expected: No errors

---

### Task 3: Create Render API Client

**Files:**
- Create: `cloud-service/src/providers/render/api.ts`

- [ ] **Step 1: Create the API client**

```typescript
// cloud-service/src/providers/render/api.ts
import type {
  RenderService,
  RenderDatabase,
  RenderListResponse,
  RenderMetricResponse,
  RenderServiceType,
  RenderPlan,
} from './types.js';

export class RenderAPIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`Render API Error ${status}: ${message}`);
    this.name = 'RenderAPIError';
  }
}

export class RenderAPIClient {
  private baseUrl = 'https://api.render.com/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new RenderAPIError(res.status, body || res.statusText);
    }

    return res.json() as Promise<T>;
  }

  // ===== Services =====
  async listServices(params?: { limit?: number; cursor?: string }): Promise<RenderService[]> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    const resp = await this.request<RenderListResponse<RenderService>>(`/services${qs ? `?${qs}` : ''}`);
    return resp.data;
  }

  async getService(id: string): Promise<RenderService> {
    return this.request<RenderService>(`/services/${id}`);
  }

  async createService(opts: {
    name: string;
    serviceType: RenderServiceType;
    region: string;
    plan?: RenderPlan;
    repo?: string;
    branch?: string;
    env?: string;
    envVars?: Record<string, string>;
  }): Promise<RenderService> {
    const body: Record<string, unknown> = {
      name: opts.name,
      type: opts.serviceType,
      region: opts.region,
      plan: opts.plan || 'free',
    };
    if (opts.repo) body.repo = opts.repo;
    if (opts.branch) body.branch = opts.branch;
    if (opts.env) body.env = opts.env;
    if (opts.envVars) body.envVars = opts.envVars;
    return this.request<RenderService>('/services', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteService(id: string): Promise<void> {
    await this.request(`/services/${id}`, { method: 'DELETE' });
  }

  async restartService(id: string): Promise<void> {
    await this.request(`/services/${id}/restart`, { method: 'POST' });
  }

  async suspendService(id: string): Promise<void> {
    await this.request(`/services/${id}/suspend`, { method: 'POST' });
  }

  async resumeService(id: string): Promise<void> {
    await this.request(`/services/${id}/resume`, { method: 'POST' });
  }

  async scaleService(id: string, instances: number): Promise<void> {
    await this.request(`/services/${id}/scale`, {
      method: 'PATCH',
      body: JSON.stringify({ instances }),
    });
  }

  // ===== PostgreSQL =====
  async listPostgresInstances(): Promise<RenderDatabase[]> {
    const resp = await this.request<RenderListResponse<RenderDatabase>>('/postgres');
    return resp.data;
  }

  async getPostgresInstance(id: string): Promise<RenderDatabase> {
    return this.request<RenderDatabase>(`/postgres/${id}`);
  }

  async createPostgresInstance(opts: {
    name: string;
    region: string;
    plan?: RenderPlan;
    databaseName?: string;
  }): Promise<RenderDatabase> {
    return this.request<RenderDatabase>('/postgres', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        plan: opts.plan || 'free',
        databaseName: opts.databaseName,
      }),
    });
  }

  async deletePostgresInstance(id: string): Promise<void> {
    await this.request(`/postgres/${id}`, { method: 'DELETE' });
  }

  async restartPostgresInstance(id: string): Promise<void> {
    await this.request(`/postgres/${id}/restart`, { method: 'POST' });
  }

  async suspendPostgresInstance(id: string): Promise<void> {
    await this.request(`/postgres/${id}/suspend`, { method: 'POST' });
  }

  async resumePostgresInstance(id: string): Promise<void> {
    await this.request(`/postgres/${id}/resume`, { method: 'POST' });
  }

  // ===== Redis (Key Value) =====
  async listRedisInstances(): Promise<RenderDatabase[]> {
    const resp = await this.request<RenderListResponse<RenderDatabase>>('/key-value');
    return resp.data;
  }

  async getRedisInstance(id: string): Promise<RenderDatabase> {
    return this.request<RenderDatabase>(`/key-value/${id}`);
  }

  async createRedisInstance(opts: {
    name: string;
    region: string;
    plan?: RenderPlan;
  }): Promise<RenderDatabase> {
    return this.request<RenderDatabase>('/key-value', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        plan: opts.plan || 'free',
      }),
    });
  }

  async deleteRedisInstance(id: string): Promise<void> {
    await this.request(`/key-value/${id}`, { method: 'DELETE' });
  }

  async suspendRedisInstance(id: string): Promise<void> {
    await this.request(`/key-value/${id}/suspend`, { method: 'POST' });
  }

  async resumeRedisInstance(id: string): Promise<void> {
    await this.request(`/key-value/${id}/resume`, { method: 'POST' });
  }

  // ===== Metrics =====
  async getMetrics(opts: {
    resourceIds: string[];
    metric: string;
    start: string;
    end: string;
    step?: string;
  }): Promise<RenderMetricResponse> {
    const query = new URLSearchParams();
    query.set('resourceIds', opts.resourceIds.join(','));
    query.set('metric', opts.metric);
    query.set('start', opts.start);
    query.set('end', opts.end);
    if (opts.step) query.set('step', opts.step);
    return this.request<RenderMetricResponse>(`/metrics?${query.toString()}`);
  }

  // ===== Workspaces =====
  async listWorkspaces(): Promise<{ id: string; name: string }[]> {
    const resp = await this.request<RenderListResponse<{ id: string; name: string }>>('/workspaces');
    return resp.data;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloud-service && npx tsc --noEmit`
Expected: No errors

---

### Task 4: Create RenderProvider Implementation

**Files:**
- Create: `cloud-service/src/providers/render/index.ts`

- [ ] **Step 1: Create the provider implementation**

```typescript
// cloud-service/src/providers/render/index.ts
import type {
  ICloudProvider,
  Instance,
  CreateInstanceOpts,
  Region,
  Image,
  InstanceType,
  TimeRange,
  MetricData,
  CostSummary,
  ResourceType,
  CloudResource,
  DatabaseInstance,
  CacheInstance,
  ListOptions,
} from '../types.js';
import type { RenderConfig } from './types.js';
import { RENDER_PLAN_SPECS, RENDER_REGIONS } from './types.js';
import { RenderAPIClient } from './api.js';

export class RenderProvider implements ICloudProvider {
  readonly name = 'render';
  readonly displayName = 'Render';

  private api: RenderAPIClient;

  constructor(config: RenderConfig) {
    this.api = new RenderAPIClient(config.apiKey);
  }

  // ===== Instance Lifecycle (maps to Services) =====
  async listInstances(region?: string, _options?: ListOptions): Promise<Instance[]> {
    const services = await this.api.listServices({ limit: 100 });
    return services
      .filter(s => !region || s.region === region)
      .map(s => this.mapServiceToInstance(s));
  }

  async getInstance(id: string): Promise<Instance> {
    const service = await this.api.getService(id);
    return this.mapServiceToInstance(service);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const service = await this.api.createService({
      name: opts.name,
      serviceType: 'web_service',
      region: opts.region,
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

  // ===== Metadata =====
  async listRegions(): Promise<Region[]> {
    return RENDER_REGIONS.map(r => ({
      id: r.id,
      name: r.name,
      displayName: r.name,
    }));
  }

  async listImages(): Promise<Image[]> {
    return [];
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    return Object.entries(RENDER_PLAN_SPECS).map(([id, spec]) => ({
      id,
      name: spec.displayName,
      cpu: spec.cpu,
      memoryMb: spec.memoryMb,
    }));
  }

  // ===== Monitoring =====
  async getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]> {
    const start = timeRange.start.toISOString();
    const end = timeRange.end.toISOString();
    try {
      const [cpuResp, memResp] = await Promise.all([
        this.api.getMetrics({ resourceIds: [id], metric: 'cpu_percent', start, end }),
        this.api.getMetrics({ resourceIds: [id], metric: 'memory_percent', start, end }),
      ]);
      const results: MetricData[] = [];
      if (cpuResp.data?.[0]) {
        cpuResp.data[0].timestamps.forEach((ts, i) => {
          results.push({ timestamp: new Date(ts), value: cpuResp.data[0].values[i], unit: 'percent' });
        });
      }
      if (memResp.data?.[0]) {
        memResp.data[0].timestamps.forEach((ts, i) => {
          results.push({ timestamp: new Date(ts), value: memResp.data[0].values[i], unit: 'percent' });
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  async getCostSummary(_timeRange: TimeRange): Promise<CostSummary> {
    const now = new Date();
    return {
      provider: 'render',
      totalAmount: 0,
      currency: 'USD',
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: now,
      breakdown: [],
    };
  }

  // ===== Generic Resource Management =====
  async listResources(resourceType: ResourceType, region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': {
        const services = await this.api.listServices({ limit: 100 });
        return services
          .filter(s => !region || s.region === region)
          .map(s => this.mapServiceToResource(s));
      }
      case 'database': {
        const dbs = await this.api.listPostgresInstances();
        return dbs
          .filter(d => !region || d.region === region)
          .map(d => this.mapDatabaseToResource(d, 'database'));
      }
      case 'cache': {
        const redis = await this.api.listRedisInstances();
        return redis
          .filter(r => !region || r.region === region)
          .map(r => this.mapDatabaseToResource(r, 'cache'));
      }
      default:
        return [];
    }
  }

  async getResource(resourceType: ResourceType, id: string): Promise<CloudResource> {
    switch (resourceType) {
      case 'instance': {
        const service = await this.api.getService(id);
        return this.mapServiceToResource(service);
      }
      case 'database': {
        const db = await this.api.getPostgresInstance(id);
        return this.mapDatabaseToResource(db, 'database');
      }
      case 'cache': {
        const redis = await this.api.getRedisInstance(id);
        return this.mapDatabaseToResource(redis, 'cache');
      }
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    switch (resourceType) {
      case 'instance':
        await this.api.deleteService(id);
        break;
      case 'database':
        await this.api.deletePostgresInstance(id);
        break;
      case 'cache':
        await this.api.deleteRedisInstance(id);
        break;
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  getSupportedResourceTypes(): ResourceType[] {
    return ['instance', 'database', 'cache'];
  }

  // ===== Private Helpers =====
  private mapServiceToInstance(service: import('./types.js').RenderService): Instance {
    const plan = service.serviceDetails?.plan || 'free';
    const spec = RENDER_PLAN_SPECS[plan] || RENDER_PLAN_SPECS.free;
    return {
      id: service.id,
      provider: 'render',
      providerInstanceId: service.id,
      name: service.name,
      region: service.region,
      status: this.mapStatus(service.status),
      spec: { cpu: spec.cpu, memoryMb: spec.memoryMb, diskGb: 0 },
      publicIp: service.serviceDetails?.url || null,
      privateIp: null,
      monthlyCost: spec.monthlyCost,
      tags: {},
      lastSyncedAt: new Date(),
      createdAt: new Date(service.createdAt),
    };
  }

  private mapServiceToResource(service: import('./types.js').RenderService): CloudResource {
    const plan = service.serviceDetails?.plan || 'free';
    const spec = RENDER_PLAN_SPECS[plan] || RENDER_PLAN_SPECS.free;
    return {
      id: service.id,
      provider: 'render',
      resourceType: 'instance',
      providerResourceId: service.id,
      name: service.name,
      region: service.region,
      status: this.mapStatus(service.status),
      createdAt: new Date(service.createdAt),
      tags: {},
      attributes: {
        serviceType: service.type,
        plan,
        cpu: spec.cpu,
        memoryMb: spec.memoryMb,
        url: service.serviceDetails?.url || '',
        branch: service.serviceDetails?.branch || '',
        autoDeploy: service.serviceDetails?.autoDeploy || '',
      },
    };
  }

  private mapDatabaseToResource(
    db: import('./types.js').RenderDatabase,
    resourceType: 'database' | 'cache',
  ): DatabaseInstance | CacheInstance {
    const plan = db.databaseDetails?.plan || 'free';
    const spec = RENDER_PLAN_SPECS[plan] || RENDER_PLAN_SPECS.free;
    const base = {
      id: db.id,
      provider: 'render',
      providerResourceId: db.id,
      name: db.name,
      region: db.region,
      status: this.mapStatus(db.status),
      createdAt: new Date(db.createdAt),
      tags: {},
    };
    if (resourceType === 'database') {
      return {
        ...base,
        resourceType: 'database',
        attributes: {
          engine: db.databaseType,
          engineVersion: '',
          instanceClass: plan,
          storageGb: 0,
          multiAz: false,
          endpoint: db.databaseDetails?.host || '',
          port: db.databaseDetails?.port || 5432,
        },
      };
    }
    return {
      ...base,
      resourceType: 'cache',
      attributes: {
        engine: 'redis',
        engineVersion: '',
        instanceClass: plan,
        memoryMb: spec.memoryMb,
        endpoint: db.databaseDetails?.host || '',
        port: db.databaseDetails?.port || 6379,
      },
    };
  }

  private mapStatus(status: import('./types.js').RenderServiceStatus): import('../types.js').InstanceStatus {
    switch (status) {
      case 'live': return 'running';
      case 'suspended': return 'stopped';
      case 'deploying': return 'pending';
      case 'deprovisioning': return 'pending';
      case 'cooldown': return 'pending';
      default: return 'error';
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloud-service && npx tsc --noEmit`
Expected: No errors

---

### Task 5: Register Render in Provider Registry

**Files:**
- Modify: `cloud-service/src/providers/registry.ts`

- [ ] **Step 1: Add RenderConfig import and factory**

```typescript
// cloud-service/src/providers/registry.ts
// Add to imports at top:
import type { RenderConfig } from './render/types.js';

// Add to ProviderConfig type (after aliyun):
| { type: 'render'; config: RenderConfig }

// Add to registerProviders function (after aliyun block):
if (config.render?.config.apiKey) {
  providers.set('render', async () => {
    const { RenderProvider } = await import('./render/index.js');
    return new RenderProvider(config.render!.config);
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloud-service && npx tsc --noEmit`
Expected: No errors

---

### Task 6: Add Render to Frontend Cloud Accounts

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx`

- [ ] **Step 1: Add render to providers array**

```typescript
// In CloudAccounts.tsx, find the providers array and add:
{
  id: 'render',
  name: 'Render',
  description: 'PaaS 云平台 - Web 服务、后台任务、定时任务',
  icon: Cloud,
  color: 'from-emerald-500 to-teal-600',
  fields: [
    { key: 'apiKey', label: 'API Key', placeholder: 'rnd...', required: true, type: 'password' },
  ],
},
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web-console && npx tsc --noEmit`
Expected: No errors

---

### Task 7: Add Environment Variable

**Files:**
- Modify: `.env`

- [ ] **Step 1: Add RENDER_API_KEY to .env**

```bash
# Render
RENDER_API_KEY=
```

- [ ] **Step 2: Add to docker-compose.simple.yml environment section**

```yaml
# In docker-compose.simple.yml, add to cloud-service environment:
- RENDER_API_KEY=${RENDER_API_KEY:-}
```

---

### Task 8: Test the Implementation

- [ ] **Step 1: Build and start services**

```bash
docker compose -f docker-compose.simple.yml up -d --build
```

- [ ] **Step 2: Test Render API connectivity**

```bash
# Get JWT token from browser, then:
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/cloud/providers
# Verify 'render' appears in the list
```

- [ ] **Step 3: Test adding Render account**

```bash
curl -X POST http://localhost:3000/api/cloud/accounts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"provider":"render","credentials":{"apiKey":"rnd..."},"name":"My Render"}'
```

- [ ] **Step 4: Test listing services**

```bash
# Use the cloud account to trigger a sync, then check resources
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/cloud/resources?provider=render
```

- [ ] **Step 5: Verify UI renders correctly**

Open browser → Cloud Accounts → Verify Render appears in provider list

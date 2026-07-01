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
    // Render API 返回 [{cursor, service: {...}}, ...]，提取 service 并补 status 字段
    const raw = await this.request<any[]>(`/services${qs ? `?${qs}` : ''}`);
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      const svc = item.service ?? item;
      if (!svc.status) {
        svc.status = svc.suspended === 'suspended' ? 'suspended' : 'live';
      }
      // region 在 serviceDetails 里，补到顶层
      if (!svc.region && svc.serviceDetails?.region) {
        svc.region = svc.serviceDetails.region;
      }
      return svc as RenderService;
    });
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
    const raw = await this.request<any[]>('/postgres');
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      const db = item.postgres ?? item.service ?? item;
      if (!db.status) {
        db.status = db.suspended === 'suspended' ? 'suspended' : 'live';
      }
      return db as RenderDatabase;
    });
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
    const raw = await this.request<any[]>('/key-value');
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      const db = item.keyValue ?? item.service ?? item;
      if (!db.status) {
        db.status = db.suspended === 'suspended' ? 'suspended' : 'live';
      }
      return db as RenderDatabase;
    });
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
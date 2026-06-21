// cloud-service/src/providers/render/index.ts
import type {
  Instance,
  CreateInstanceOpts,
  Region,
  Image,
  InstanceType,
  TimeRange,
  MetricData,
  CostSummary,
  ListOptions,
  ICloudProvider,
  ResourceType,
  CloudResource,
  DatabaseInstance,
  CacheInstance,
} from '../types.js';
import type { RenderService, RenderDatabase, RenderPlan, RenderMetricDataPoint } from './types.js';
import { RENDER_PLAN_SPECS, RENDER_REGIONS } from './types.js';
import { RenderAPIClient } from './api.js';

const STATUS_MAP: Record<string, Instance['status']> = {
  live: 'running',
  suspended: 'stopped',
  deploying: 'pending',
  deprovisioning: 'pending',
  cooldown: 'pending',
  deleted: 'terminated',
};

function mapStatus(raw: string): Instance['status'] {
  return STATUS_MAP[raw] ?? 'error';
}

function planSpec(plan: RenderPlan | undefined) {
  return RENDER_PLAN_SPECS[plan ?? 'free'];
}

function serviceToInstance(svc: RenderService): Instance {
  const spec = planSpec(svc.serviceDetails?.plan);
  return {
    id: svc.id,
    provider: 'render',
    providerInstanceId: svc.id,
    name: svc.name,
    region: svc.region,
    status: mapStatus(svc.status),
    spec: { cpu: spec.cpu, memoryMb: spec.memoryMb, diskGb: 0 },
    publicIp: null,
    privateIp: null,
    monthlyCost: spec.monthlyCost,
    tags: { type: svc.type },
    lastSyncedAt: new Date(),
    createdAt: new Date(svc.createdAt),
  };
}

function databaseToDatabaseInstance(db: RenderDatabase): DatabaseInstance {
  const spec = planSpec(db.databaseDetails?.plan);
  return {
    id: db.id,
    provider: 'render',
    resourceType: 'database',
    providerResourceId: db.id,
    name: db.name,
    region: db.region,
    status: mapStatus(db.status),
    createdAt: new Date(db.createdAt),
    tags: { databaseType: db.databaseType },
    attributes: {
      engine: db.databaseType,
      engineVersion: '',
      instanceClass: spec.displayName,
      storageGb: 0,
      multiAz: false,
      endpoint: db.databaseDetails?.host,
      port: db.databaseDetails?.port,
    },
  };
}

function databaseToCacheInstance(db: RenderDatabase): CacheInstance {
  const spec = planSpec(db.databaseDetails?.plan);
  return {
    id: db.id,
    provider: 'render',
    resourceType: 'cache',
    providerResourceId: db.id,
    name: db.name,
    region: db.region,
    status: mapStatus(db.status),
    createdAt: new Date(db.createdAt),
    tags: { databaseType: db.databaseType },
    attributes: {
      engine: 'redis',
      engineVersion: '',
      instanceClass: spec.displayName,
      memoryMb: spec.memoryMb,
      endpoint: db.databaseDetails?.host,
      port: db.databaseDetails?.port,
    },
  };
}

function serviceToCloudResource(svc: RenderService): CloudResource {
  const spec = planSpec(svc.serviceDetails?.plan);
  return {
    id: svc.id,
    provider: 'render',
    resourceType: 'instance',
    providerResourceId: svc.id,
    name: svc.name,
    region: svc.region,
    status: mapStatus(svc.status),
    createdAt: new Date(svc.createdAt),
    tags: { type: svc.type },
    attributes: {
      cpu: spec.cpu,
      memoryMb: spec.memoryMb,
      monthlyCost: spec.monthlyCost,
      url: svc.serviceDetails?.url,
      branch: svc.serviceDetails?.branch,
    },
  };
}

export class RenderProvider implements ICloudProvider {
  readonly name = 'render';
  readonly displayName = 'Render';
  private api: RenderAPIClient;

  constructor(apiKey: string) {
    this.api = new RenderAPIClient(apiKey);
  }

  async listInstances(_region?: string, _options?: ListOptions): Promise<Instance[]> {
    const services = await this.api.listServices();
    return services
      .filter(s => s.status !== 'deleted')
      .map(serviceToInstance);
  }

  async getInstance(id: string): Promise<Instance> {
    const svc = await this.api.getService(id);
    return serviceToInstance(svc);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const svc = await this.api.createService({
      name: opts.name,
      serviceType: 'web_service',
      region: opts.region,
      plan: (opts.instanceType as RenderPlan) || 'free',
    });
    return serviceToInstance(svc);
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

  async listRegions(): Promise<Region[]> {
    return RENDER_REGIONS.map(r => ({
      id: r.id,
      name: r.id,
      displayName: r.name,
    }));
  }

  async listImages(): Promise<Image[]> {
    return [
      { id: 'node', name: 'Node.js' },
      { id: 'python', name: 'Python' },
      { id: 'go', name: 'Go' },
      { id: 'ruby', name: 'Ruby' },
      { id: 'docker', name: 'Docker' },
      { id: 'static', name: 'Static Site' },
    ];
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    return (Object.keys(RENDER_PLAN_SPECS) as RenderPlan[]).map(plan => ({
      id: plan,
      name: RENDER_PLAN_SPECS[plan].displayName,
      cpu: RENDER_PLAN_SPECS[plan].cpu,
      memoryMb: RENDER_PLAN_SPECS[plan].memoryMb,
    }));
  }

  async getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]> {
    const resp = await this.api.getMetrics({
      resourceIds: [id],
      metric: 'cpu_percent',
      start: timeRange.start.toISOString(),
      end: timeRange.end.toISOString(),
    });

    const points: RenderMetricDataPoint = resp.data?.[0];
    if (!points?.timestamps || !points?.values) return [];
    return points.timestamps.map((ts, i) => ({
      timestamp: new Date(ts),
      value: points.values[i],
      unit: 'percent',
    }));
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    const services = await this.api.listServices();
    const postgres = await this.api.listPostgresInstances();
    const redis = await this.api.listRedisInstances();

    let total = 0;
    const breakdown: CostSummary['breakdown'] = [];

    for (const svc of services) {
      if (svc.status === 'deleted') continue;
      const cost = planSpec(svc.serviceDetails?.plan).monthlyCost;
      total += cost;
      breakdown.push({ service: svc.name, amount: cost });
    }

    for (const db of postgres) {
      if (db.status === 'deleted') continue;
      const cost = planSpec(db.databaseDetails?.plan).monthlyCost;
      total += cost;
      breakdown.push({ service: db.name, amount: cost });
    }

    for (const r of redis) {
      if (r.status === 'deleted') continue;
      const cost = planSpec(r.databaseDetails?.plan).monthlyCost;
      total += cost;
      breakdown.push({ service: r.name, amount: cost });
    }

    return {
      provider: 'render',
      totalAmount: total,
      currency: 'USD',
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown,
    };
  }

  // ===== Resource management =====

  async listResources(resourceType: ResourceType, _region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': {
        const services = await this.api.listServices();
        return services.filter(s => s.status !== 'deleted').map(serviceToCloudResource);
      }
      case 'database': {
        const dbs = await this.api.listPostgresInstances();
        return dbs.filter(d => d.status !== 'deleted').map(databaseToDatabaseInstance);
      }
      case 'cache': {
        const redis = await this.api.listRedisInstances();
        return redis.filter(r => r.status !== 'deleted').map(databaseToCacheInstance);
      }
      default:
        return [];
    }
  }

  async getResource(resourceType: ResourceType, id: string): Promise<CloudResource> {
    switch (resourceType) {
      case 'instance':
        return serviceToCloudResource(await this.api.getService(id));
      case 'database':
        return databaseToDatabaseInstance(await this.api.getPostgresInstance(id));
      case 'cache':
        return databaseToCacheInstance(await this.api.getRedisInstance(id));
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
}

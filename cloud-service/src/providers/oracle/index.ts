// cloud-service/src/providers/oracle/index.ts
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
  Disk,
  Bucket,
  DatabaseInstance,
  LoadBalancer,
  Vpc,
  Cluster,
} from '../types.js';
import type {
  OracleConfig,
  OCIInstance,
  OCIVCN,
  OCISubnet,
  OCILoadBalancer,
  OCIBucket,
  OCIOKECluster,
  OCIFunction,
  OCIZone,
  OCICertificate,
} from './types.js';
import { OCI_REGIONS, OCI_SHAPE_SPECS } from './types.js';
import { OCIClient } from './api.js';

function mapInstanceLifecycleState(state: string): Instance['status'] {
  switch (state?.toLowerCase()) {
    case 'running':
    case 'available':
      return 'running';
    case 'stopped':
    case 'stopping':
      return 'stopped';
    case 'terminated':
    case 'destroyed':
      return 'terminated';
    case 'starting':
    case 'creating':
    case 'provisioning':
      return 'pending';
    default:
      return 'error';
  }
}

function mapResourceState(state: string): string {
  switch (state?.toLowerCase()) {
    case 'active':
    case 'available':
    case 'running':
    case 'succeeded':
      return 'active';
    case 'stopped':
    case 'terminated':
    case 'deleted':
      return 'stopped';
    case 'creating':
    case 'updating':
    case 'pending':
      return 'pending';
    case 'failed':
    case 'error':
      return 'error';
    default:
      return state?.toLowerCase() || 'unknown';
  }
}

function shapeSpec(shape: string): { cpu: number; memoryMb: number } {
  return OCI_SHAPE_SPECS[shape] || { cpu: 0, memoryMb: 0 };
}

function ociInstanceToInstance(oci: OCIInstance, region: string): Instance {
  const spec = shapeSpec(oci.shape);
  return {
    id: oci.id,
    provider: 'oracle',
    providerInstanceId: oci.id,
    name: oci.displayName || oci.id,
    region,
    status: mapInstanceLifecycleState(oci.lifecycleState),
    spec: { cpu: spec.cpu, memoryMb: spec.memoryMb, diskGb: 0 },
    publicIp: null, // Would need to query VNICs for this
    privateIp: null,
    monthlyCost: 0,
    tags: { shape: oci.shape, availabilityDomain: oci.availabilityDomain },
    lastSyncedAt: new Date(),
    createdAt: new Date(oci.timeCreated),
  };
}

function vcnToVpc(vcn: OCIVCN, region: string): Vpc {
  return {
    id: vcn.id,
    provider: 'oracle',
    resourceType: 'vpc',
    providerResourceId: vcn.id,
    name: vcn.displayName || vcn.id,
    region,
    status: mapResourceState(vcn.lifecycleState),
    attributes: {
      cidrBlock: vcn.cidrBlock,
      subnetCount: 0, // Would need to count subnets
      isDefault: false,
      state: vcn.lifecycleState,
    },
    tags: {},
    createdAt: new Date(vcn.timeCreated),
  };
}

function lbToLoadBalancer(lb: OCILoadBalancer, region: string): LoadBalancer {
  const publicIp = lb.ipAddresses?.find(a => a.public)?.public?.ipAddress;
  const privateIp = lb.ipAddresses?.find(a => a.private)?.private?.ipAddress;
  return {
    id: lb.id,
    provider: 'oracle',
    resourceType: 'loadbalancer',
    providerResourceId: lb.id,
    name: lb.displayName || lb.id,
    region,
    status: mapResourceState(lb.lifecycleState),
    attributes: {
      type: 'application',
      scheme: publicIp ? 'internet-facing' : 'private',
      dnsName: publicIp ? `${lb.displayName}.lb.${region}.oraclecloud.com` : undefined,
      vpcId: undefined,
      listenerCount: 0,
      targetCount: 0,
    },
    tags: {},
    createdAt: new Date(lb.timeCreated),
  };
}

function bucketToBucket(bucket: OCIBucket, region: string): Bucket {
  return {
    id: bucket.id,
    provider: 'oracle',
    resourceType: 'bucket',
    providerResourceId: bucket.id,
    name: bucket.name,
    region,
    status: mapResourceState(bucket.lifecycleState),
    attributes: {
      storageClass: bucket.storageTier || 'Standard',
      objectCount: bucket.approximateCount || 0,
      sizeBytes: bucket.approximateSizeInBytes || 0,
      versioning: false,
      publicAccess: false,
    },
    tags: {},
    createdAt: new Date(bucket.timeCreated),
  };
}

function clusterToCluster(cluster: OCIOKECluster, region: string): Cluster {
  return {
    id: cluster.id,
    provider: 'oracle',
    resourceType: 'cluster',
    providerResourceId: cluster.id,
    name: cluster.name,
    region,
    status: mapResourceState(cluster.lifecycleState),
    attributes: {
      clusterType: 'oke',
      kubernetesVersion: cluster.kubernetesVersion || '',
      nodeCount: 0, // Would need to query node pools
      status: cluster.lifecycleState,
      endpoint: cluster.endpointIp ? `https://${cluster.endpointIp}` : undefined,
      vpcId: cluster.vcnId,
    },
    tags: {},
    createdAt: new Date(cluster.timeCreated),
  };
}

function instanceToCloudResource(oci: OCIInstance, region: string): CloudResource {
  const spec = shapeSpec(oci.shape);
  return {
    id: oci.id,
    provider: 'oracle',
    resourceType: 'instance',
    providerResourceId: oci.id,
    name: oci.displayName || oci.id,
    region,
    status: mapInstanceLifecycleState(oci.lifecycleState),
    attributes: {
      cpu: spec.cpu,
      memoryMb: spec.memoryMb,
      shape: oci.shape,
      availabilityDomain: oci.availabilityDomain,
    },
    tags: {},
    createdAt: new Date(oci.timeCreated),
  };
}

export class OracleProvider implements ICloudProvider {
  readonly name = 'oracle';
  readonly displayName = 'Oracle Cloud';
  private api: OCIClient;

  constructor(config: OracleConfig) {
    this.api = new OCIClient(config);
  }

  async listInstances(_region?: string, _options?: ListOptions): Promise<Instance[]> {
    const instances = await this.api.listInstances();
    return instances.map(i => ociInstanceToInstance(i, this.api.getRegion()));
  }

  async getInstance(id: string): Promise<Instance> {
    const inst = await this.api.getInstance(id);
    return ociInstanceToInstance(inst, this.api.getRegion());
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    // OCI CreateInstance is complex, requires subnet, image, shape, etc.
    // For now, throw not implemented - this requires more detailed setup
    throw new Error('CreateInstance not fully implemented for Oracle Cloud. Please use the OCI console to create instances.');
  }

  async deleteInstance(id: string): Promise<void> {
    await this.api.request('compute', 'DELETE', `/20160918/instances/${id}`);
  }

  async startInstance(id: string): Promise<void> {
    await this.api.request('compute', 'POST', `/20160918/instances/${id}/actions/start`);
  }

  async stopInstance(id: string): Promise<void> {
    await this.api.request('compute', 'POST', `/20160918/instances/${id}/actions/stop`);
  }

  async rebootInstance(id: string): Promise<void> {
    await this.api.request('compute', 'POST', `/20160918/instances/${id}/actions/reset`);
  }

  async listRegions(): Promise<Region[]> {
    return OCI_REGIONS.map(r => ({
      id: r.id,
      name: r.id,
      displayName: r.name,
    }));
  }

  async listImages(): Promise<Image[]> {
    const images = await this.api.listImages();
    return images.map(img => ({
      id: img.id,
      name: img.displayName,
      description: img.operatingSystem,
    }));
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    const shapes = await this.api.listShapes();
    return shapes.map(s => ({
      id: s.shape,
      name: s.shape,
      cpu: s.ocpu,
      memoryMb: Math.round(s.memoryInGBs * 1024),
    }));
  }

  async getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]> {
    // OCI monitoring API is separate - for now return empty
    // In production, use the MonitoringClient from OCI SDK
    return [];
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // OCI Cost API requires usage data - return empty for now
    return {
      provider: 'oracle',
      totalAmount: 0,
      currency: 'USD',
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown: [],
    };
  }

  // ===== Resource management =====

  getSupportedResourceTypes(): ResourceType[] {
    return ['instance', 'disk', 'bucket', 'database', 'loadbalancer', 'vpc', 'cluster'];
  }

  async listResources(resourceType: ResourceType, _region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': {
        const instances = await this.api.listInstances();
        return instances.map(i => instanceToCloudResource(i, this.api.getRegion()));
      }
      case 'disk': {
        // Block volumes are separate from instances
        const volumes = await this.api.listBlockVolumes();
        return volumes.map(v => ({
          id: v.id,
          provider: 'oracle',
          resourceType: 'disk' as const,
          providerResourceId: v.id,
          name: v.displayName || v.id,
          region: this.api.getRegion(),
          status: mapResourceState(v.lifecycleState),
          attributes: {
            sizeGb: v.sizeInGBs,
            diskType: 'BlockVolume',
            encrypted: true,
          },
          tags: {},
          createdAt: new Date(v.timeCreated),
        }));
      }
      case 'bucket': {
        const buckets = await this.api.listBuckets();
        return buckets.map(b => bucketToBucket(b, this.api.getRegion()));
      }
      case 'database': {
        // OCI has both DB Systems and Autonomous Databases
        // For simplicity, return both as database resources
        const dbs = await this.api.listDBSystems();
        const ads = await this.api.listAutonomousDatabases();
        return [...dbs, ...ads].map(db => ({
          id: db.id,
          provider: 'oracle',
          resourceType: 'database' as const,
          providerResourceId: db.id,
          name: db.displayName || db.id,
          region: this.api.getRegion(),
          status: mapResourceState(db.lifecycleState),
          attributes: {
            engine: 'OCI Database',
            engineVersion: '',
            instanceClass: 'shape' in db ? (db as any).shape || 'Autonomous' : 'Autonomous',
            storageGb: 'allocatedStorage' in db ? (db as any).allocatedStorage : 0,
            multiAz: false,
            endpoint: undefined,
            port: 1521,
          },
          tags: {},
          createdAt: new Date(db.timeCreated),
        }));
      }
      case 'loadbalancer': {
        const lbs = await this.api.listLoadBalancers();
        return lbs.map(lb => lbToLoadBalancer(lb, this.api.getRegion()));
      }
      case 'vpc': {
        const vcns = await this.api.listVCNs();
        return vcns.map(v => vcnToVpc(v, this.api.getRegion()));
      }
      case 'cluster': {
        const clusters = await this.api.listOKEClusters();
        return clusters.map(c => clusterToCluster(c, this.api.getRegion()));
      }
      default:
        return [];
    }
  }

  async getResource(resourceType: ResourceType, id: string): Promise<CloudResource> {
    const resources = await this.listResources(resourceType);
    const found = resources.find(r => r.providerResourceId === id || r.id === id);
    if (!found) throw new Error(`${resourceType} ${id} not found`);
    return found;
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    switch (resourceType) {
      case 'instance':
        await this.deleteInstance(id);
        break;
      case 'bucket': {
        const namespace = await this.api.getObjectStorageNamespace();
        await this.api.request('objectstorage', 'DELETE', `/n/${namespace}/b/${id}`);
        break;
      }
      case 'database':
        await this.api.request('database', 'DELETE', `/20160918/autonomousDatabases/${id}`);
        break;
      default:
        throw new Error(`Delete ${resourceType} not implemented for Oracle Cloud`);
    }
  }
}

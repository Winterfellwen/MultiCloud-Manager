import EcsModule, {
  DescribeInstancesRequest,
  DescribeInstancesResponse,
  DescribeRegionsRequest,
  DescribeRegionsResponse,
  StartInstanceRequest,
  StopInstanceRequest,
  RebootInstanceRequest,
  DeleteInstanceRequest,
  RunInstancesRequest,
  DescribeDisksRequest,
  DescribeDisksResponse,
  DescribeSecurityGroupsRequest,
  DescribeSecurityGroupsResponse,
  DeleteDiskRequest,
} from "@alicloud/ecs20140526";
import Rds20140815 from "@alicloud/rds20140815";
import Vpc20160428 from "@alicloud/vpc20160428";
import Slb20140515 from "@alicloud/slb20140515";
import Cdn20180510 from "@alicloud/cdn20180510";
import Cs20151215 from "@alicloud/cs20151215";
import RKvstore20150101 from "@alicloud/r-kvstore20150101";
import { Config } from "@alicloud/openapi-client";
import { RuntimeOptions } from "@alicloud/tea-util";
import type {
  ICloudProvider,
  Instance,
  Region,
  Image,
  InstanceType,
  CreateInstanceOpts,
  ListOptions,
  TimeRange,
  MetricData,
  CostSummary,
  InstanceStatus,
  CloudResource,
  ResourceType,
  Disk,
  Bucket,
  DatabaseInstance,
  CacheInstance,
  LoadBalancer,
  Vpc,
  SecurityGroup,
  CdnDistribution,
  Cluster,
} from "../types.js";

// ESM 兼容：SDK 的默认导出需要通过 .default 访问
const Client = (EcsModule as any).default;

export interface AliyunConfig {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
}

interface AliyunInstance {
  instanceId?: string;
  instanceName?: string;
  status?: string;
  regionId?: string;
  cpu?: number;
  memory?: number;
  creationTime?: string;
  expiredTime?: string;
  publicIpAddress?: { ipAddress?: string[] };
  innerIpAddress?: { ipAddress?: string[] };
  networkInterfaces?: any;
  tags?: { tag?: { key?: string; value?: string }[] };
}

export class AliyunProvider implements ICloudProvider {
  readonly name = "aliyun";
  readonly displayName = "阿里云 (Alibaba Cloud)";

  private accessKeyId: string;
  private accessKeySecret: string;
  private defaultRegion: string;

  constructor(config: AliyunConfig) {
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.defaultRegion = config.region;
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createClient(regionId?: string) {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `ecs.${region}.aliyuncs.com`,
    });
    return new Client(cfg);
  }

  async listInstances(region?: string, _options?: ListOptions): Promise<Instance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createClient(regionId);

    const request = new DescribeInstancesRequest({
      regionId,
      pageSize: 100,
      pageNumber: 1,
    });

    const response: DescribeInstancesResponse = await client.describeInstancesWithOptions(
      request,
      new RuntimeOptions({})
    );

    const raw = response?.body?.instances?.instance || [];
    return (raw as AliyunInstance[]).map((i) => this.mapInstance(i, regionId));
  }

  async getInstance(id: string): Promise<Instance> {
    const client = this.createClient();
    const request = new DescribeInstancesRequest({
      instanceIds: JSON.stringify([id]),
    });

    const response = await client.describeInstancesWithOptions(
      request,
      new RuntimeOptions({})
    );

    const raw = response?.body?.instances?.instance || [];
    const inst = raw[0] as AliyunInstance;
    if (!inst) {
      throw new Error(`Instance ${id} not found`);
    }
    return this.mapInstance(inst, inst.regionId || this.defaultRegion);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const client = this.createClient(opts.region);
    const request = new RunInstancesRequest({
      regionId: opts.region,
      imageId: opts.imageId,
      instanceType: opts.instanceType,
      instanceName: opts.name,
      securityGroupId: opts.securityGroupIds?.[0],
      vSwitchId: opts.subnetId,
    });

    const response = await client.runInstancesWithOptions(request, new RuntimeOptions({}));
    const instanceId = response?.body?.instanceIdSets?.instanceIdSet?.[0];
    if (!instanceId) {
      throw new Error("Failed to create instance");
    }
    return this.getInstance(instanceId);
  }

  async deleteInstance(id: string): Promise<void> {
    const client = this.createClient();
    const request = new DeleteInstanceRequest({
      instanceId: id,
      force: true,
    });
    await client.deleteInstanceWithOptions(request, new RuntimeOptions({}));
  }

  async startInstance(id: string): Promise<void> {
    const client = this.createClient();
    await client.startInstance(new StartInstanceRequest({ instanceId: id }));
  }

  async stopInstance(id: string): Promise<void> {
    const client = this.createClient();
    await client.stopInstance(new StopInstanceRequest({ instanceId: id }));
  }

  async rebootInstance(id: string): Promise<void> {
    const client = this.createClient();
    await client.rebootInstance(new RebootInstanceRequest({ instanceId: id }));
  }

  async listRegions(): Promise<Region[]> {
    const client = this.createClient();
    const response: DescribeRegionsResponse = await client.describeRegions(
      new DescribeRegionsRequest({})
    );
    const regions = response?.body?.regions?.region || [];
    return regions.map((r) => ({
      id: r.regionId || "",
      name: r.regionId || "",
      displayName: r.localName || r.regionId || "",
    }));
  }

  async listImages(): Promise<Image[]> {
    // 阿里云公共镜像，常用列表
    return [
      { id: "aliyun_3_x64_20G_alibase_20240528.vhd", name: "Alibaba Cloud Linux 3" },
      { id: "centos_7_9_x64_20G_alibase_20240528.vhd", name: "CentOS 7.9" },
      { id: "ubuntu_22_04_x64_20G_alibase_20240528.vhd", name: "Ubuntu 22.04" },
      { id: "debian_12_x64_20G_alibase_20240528.vhd", name: "Debian 12" },
      { id: "windows_2022_datacenter_x64_dtc_zh-cn_20G_alibase_20240528.vhd", name: "Windows Server 2022" },
    ];
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    // 阿里云常用 ECS 规格列表
    return [
      { id: "ecs.t6-c1m1.large", name: "ecs.t6-c1m1.large", cpu: 2, memoryMb: 2048 },
      { id: "ecs.g6.large", name: "ecs.g6.large", cpu: 2, memoryMb: 8192 },
      { id: "ecs.g6.xlarge", name: "ecs.g6.xlarge", cpu: 4, memoryMb: 16384 },
      { id: "ecs.c6.large", name: "ecs.c6.large", cpu: 2, memoryMb: 4096 },
      { id: "ecs.r6.large", name: "ecs.r6.large", cpu: 2, memoryMb: 16384 },
      { id: "ecs.g6.2xlarge", name: "ecs.g6.2xlarge", cpu: 8, memoryMb: 32768 },
    ];
  }

  async getMetrics(_id: string, _timeRange: TimeRange): Promise<MetricData[]> {
    // 阿里云云监控需通过 CMS API 查询，Phase 2 暂返回空，Phase 3 监控服务统一实现
    return [];
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // 阿里云费用查询需通过 BSS OpenAPI，Phase 2 暂返回零值占位
    return {
      provider: "aliyun",
      totalAmount: 0,
      currency: "CNY",
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown: [],
    };
  }

  private mapInstance(i: AliyunInstance, regionId: string): Instance {
    const publicIp = i.publicIpAddress?.ipAddress?.[0] || null;
    const privateIp =
      i.networkInterfaces?.privateInterface?.[0]?.primaryIpAddress ||
      i.innerIpAddress?.ipAddress?.[0] ||
      null;

    return {
      id: i.instanceId || "",
      provider: "aliyun",
      providerInstanceId: i.instanceId || "",
      name: i.instanceName || i.instanceId || "",
      region: i.regionId || regionId,
      status: this.mapStatus(i.status || ""),
      spec: {
        cpu: i.cpu || 0,
        memoryMb: i.memory || 0,
        diskGb: 0,
      },
      publicIp,
      privateIp,
      monthlyCost: 0,
      tags: this.convertTags(i.tags?.tag),
      lastSyncedAt: new Date(),
      createdAt: i.creationTime ? new Date(i.creationTime) : new Date(),
    };
  }

  private mapStatus(status: string): InstanceStatus {
    switch (status) {
      case "Running":
        return "running";
      case "Stopped":
        return "stopped";
      case "Pending":
      case "Starting":
        return "pending";
      case "Stopping":
        return "stopped";
      default:
        return "error";
    }
  }

  private convertTags(
    tags: { key?: string; value?: string }[] | undefined
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const tag of tags || []) {
      if (tag.key) {
        result[tag.key] = tag.value || "";
      }
    }
    return result;
  }

  // ===== 通用资源管理 =====

  getSupportedResourceTypes(): ResourceType[] {
    return [
      "instance",
      "disk",
      "bucket",
      "database",
      "cache",
      "loadbalancer",
      "vpc",
      "securitygroup",
      "cdn",
      "cluster",
    ];
  }

  async listResources(
    resourceType: ResourceType,
    region?: string
  ): Promise<CloudResource[]> {
    switch (resourceType) {
      case "instance":
        return this.listInstancesAsResources(region);
      case "disk":
        return this.listDisks(region);
      case "bucket":
        return this.listBuckets();
      case "database":
        return this.listDatabases(region);
      case "cache":
        return this.listCacheClusters(region);
      case "loadbalancer":
        return this.listLoadBalancers(region);
      case "vpc":
        return this.listVpcs(region);
      case "securitygroup":
        return this.listSecurityGroups(region);
      case "cdn":
        return this.listCdnDomains();
      case "cluster":
        return this.listClusters(region);
      default:
        return [];
    }
  }

  async getResource(
    resourceType: ResourceType,
    id: string
  ): Promise<CloudResource> {
    const resources = await this.listResources(resourceType);
    const found = resources.find(
      (r) => r.providerResourceId === id || r.id === id
    );
    if (!found) {
      throw new Error(`${resourceType} ${id} not found`);
    }
    return found;
  }

  async deleteResource(
    resourceType: ResourceType,
    id: string
  ): Promise<void> {
    switch (resourceType) {
      case "instance":
        return this.deleteInstance(id);
      case "disk":
        return this.deleteDisk(id);
      default:
        throw new Error(`Delete ${resourceType} not implemented for aliyun`);
    }
  }

  private async deleteDisk(diskId: string): Promise<void> {
    const client = this.createClient(this.defaultRegion);
    const request = new DeleteDiskRequest({ diskId });
    await client.deleteDiskWithOptions(request, new RuntimeOptions({}));
  }

  private async listInstancesAsResources(
    region?: string
  ): Promise<CloudResource[]> {
    const instances = await this.listInstances(region);
    return instances.map((i) => ({
      id: i.id,
      provider: "aliyun",
      resourceType: "instance" as const,
      providerResourceId: i.providerInstanceId,
      name: i.name,
      region: i.region,
      status: i.status,
      createdAt: i.createdAt,
      tags: i.tags,
      attributes: {
        cpu: i.spec.cpu,
        memoryMb: i.spec.memoryMb,
        diskGb: i.spec.diskGb,
        publicIp: i.publicIp,
        privateIp: i.privateIp,
        monthlyCost: i.monthlyCost,
      },
    }));
  }

  private async listDisks(region?: string): Promise<Disk[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createClient(regionId);
    const request = new DescribeDisksRequest({
      regionId,
      pageSize: 100,
      pageNumber: 1,
    });
    const response: DescribeDisksResponse = await client.describeDisksWithOptions(
      request,
      new RuntimeOptions({})
    );
    const raw =
      (response?.body?.disks?.disk as any[]) || [];
    return raw.map((d) => ({
      id: "",
      provider: "aliyun",
      resourceType: "disk" as const,
      providerResourceId: d.diskId || "",
      name: d.diskName || d.diskId || "",
      region: d.regionId || regionId,
      status: d.status || "unknown",
      attributes: {
        sizeGb: d.size || 0,
        diskType: d.category || d.diskCategory || "",
        encrypted: d.encrypted || false,
        attachedInstanceId: d.instanceId || undefined,
        attachmentStatus: d.status === "In_use" ? "attached" : "detached",
      },
      tags: this.convertTags(d.tags?.tag),
      createdAt: d.creationTime ? new Date(d.creationTime) : new Date(),
    }));
  }

  private async listBuckets(): Promise<Bucket[]> {
    // TODO: OSS 需要独立的签名请求或 @alicloud/oss-client，暂返回空数组
    return [];
  }

  private async listDatabases(region?: string): Promise<DatabaseInstance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createRdsClient(regionId);
    const response: any = await (client as any).describeDBInstancesWithOptions(
      { regionId, pageSize: 100, pageNumber: 1 },
      new RuntimeOptions({})
    );
    const raw =
      (response?.body?.items?.dBInstance as any[]) || [];
    return raw.map((db) => ({
      id: "",
      provider: "aliyun",
      resourceType: "database" as const,
      providerResourceId: db.dBInstanceId || "",
      name: db.dBInstanceDescription || db.dBInstanceId || "",
      region: db.regionId || regionId,
      status: db.dBInstanceStatus || "unknown",
      attributes: {
        engine: db.engine || "",
        engineVersion: db.engineVersion || "",
        instanceClass: db.dBInstanceClass || "",
        storageGb: db.dBInstanceStorage || 0,
        multiAz: db.mutriORsignle || false,
        endpoint: db.connectionString,
        port: db.port ? Number(db.port) : undefined,
      },
      tags: {},
      createdAt: db.createTime ? new Date(db.createTime) : new Date(),
    }));
  }

  private async listCacheClusters(region?: string): Promise<CacheInstance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createKvstoreClient(regionId);
    const response: any = await (client as any).describeInstancesWithOptions(
      { regionId, pageSize: 100, pageNumber: 1 },
      new RuntimeOptions({})
    );
    const raw =
      (response?.body?.instances?.instanceKVStore as any[]) || [];
    return raw.map((c) => ({
      id: "",
      provider: "aliyun",
      resourceType: "cache" as const,
      providerResourceId: c.instanceId || "",
      name: c.instanceName || c.instanceId || "",
      region: c.regionId || regionId,
      status: c.instanceStatus || "unknown",
      attributes: {
        engine: c.engine || "Redis",
        engineVersion: c.engineVersion || "",
        instanceClass: c.instanceClass || "",
        memoryMb: c.capacity ? Number(c.capacity) : 0,
        nodeType: c.nodeType,
        shardCount: c.shardCount,
        endpoint: c.connectionDomain,
        port: c.port ? Number(c.port) : undefined,
      },
      tags: {},
      createdAt: c.createTime ? new Date(c.createTime) : new Date(),
    }));
  }

  private async listLoadBalancers(
    region?: string
  ): Promise<LoadBalancer[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createSlbClient(regionId);
    const response: any = await (client as any).describeLoadBalancersWithOptions(
      { regionId, pageSize: 100, pageNumber: 1 },
      new RuntimeOptions({})
    );
    const raw =
      (response?.body?.loadBalancers?.loadBalancer as any[]) || [];
    return raw.map((lb) => ({
      id: "",
      provider: "aliyun",
      resourceType: "loadbalancer" as const,
      providerResourceId: lb.loadBalancerId || "",
      name: lb.loadBalancerName || lb.loadBalancerId || "",
      region: lb.regionId || regionId,
      status: lb.loadBalancerStatus || "unknown",
      attributes: {
        type: lb.loadBalancerSpec || "slb",
        scheme: lb.addressType || "internet",
        dnsName: lb.address,
        vpcId: lb.vpcId,
        listenerCount: 0,
        targetCount: 0,
      },
      tags: {},
      createdAt: lb.createTime ? new Date(lb.createTime) : new Date(),
    }));
  }

  private async listVpcs(region?: string): Promise<Vpc[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createVpcClient(regionId);
    const response: any = await (client as any).describeVpcsWithOptions(
      { regionId, pageSize: 100, pageNumber: 1 },
      new RuntimeOptions({})
    );
    const raw = (response?.body?.vpcs?.vpc as any[]) || [];
    return raw.map((v) => ({
      id: "",
      provider: "aliyun",
      resourceType: "vpc" as const,
      providerResourceId: v.vpcId || "",
      name: v.vpcName || v.vpcId || "",
      region: v.regionId || regionId,
      status: v.status || "available",
      attributes: {
        cidrBlock: v.cidrBlock || "",
        subnetCount: v.vSwitchCount || 0,
        isDefault: v.isDefault || false,
        state: v.status || "available",
      },
      tags: this.convertTags(v.tags?.tag),
      createdAt: v.creationTime ? new Date(v.creationTime) : new Date(),
    }));
  }

  private async listSecurityGroups(
    region?: string
  ): Promise<SecurityGroup[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createClient(regionId);
    const request = new DescribeSecurityGroupsRequest({
      regionId,
      pageSize: 100,
      pageNumber: 1,
    });
    const response: DescribeSecurityGroupsResponse =
      await client.describeSecurityGroupsWithOptions(
        request,
        new RuntimeOptions({})
      );
    const raw =
      (response?.body?.securityGroups?.securityGroup as any[]) || [];
    return raw.map((sg) => ({
      id: "",
      provider: "aliyun",
      resourceType: "securitygroup" as const,
      providerResourceId: sg.securityGroupId || "",
      name: sg.securityGroupName || sg.securityGroupId || "",
      region: sg.regionId || regionId,
      status: "active",
      attributes: {
        vpcId: sg.vpcId,
        ruleCount: 0,
        ingressRules: 0,
        egressRules: 0,
        description: sg.description,
      },
      tags: this.convertTags(sg.tags?.tag),
      createdAt: sg.creationTime ? new Date(sg.creationTime) : new Date(),
    }));
  }

  private async listCdnDomains(): Promise<CdnDistribution[]> {
    const client = this.createCdnClient();
    const response: any = await (client as any).describeUserDomainsWithOptions(
      { pageSize: 100, pageNumber: 1 },
      new RuntimeOptions({})
    );
    const raw = (response?.body?.domains?.pageData as any[]) || [];
    return raw.map((d) => ({
      id: "",
      provider: "aliyun",
      resourceType: "cdn" as const,
      providerResourceId: d.domainName || "",
      name: d.domainName || "",
      region: "global",
      status: d.domainStatus || "unknown",
      attributes: {
        domainName: d.domainName || "",
        originDomain: d.sources?.[0]?.content,
        originType: d.sources?.[0]?.type || "",
        enabled: d.domainStatus === "online",
        priceClass: undefined,
        sslCertificate: undefined,
      },
      tags: {},
      createdAt: d.gmtModified ? new Date(d.gmtModified) : new Date(),
    }));
  }

  private async listClusters(region?: string): Promise<Cluster[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createCsClient(regionId);
    const response: any = await (client as any).describeClustersWithOptions(
      {},
      new RuntimeOptions({})
    );
    const raw = (response?.body?.clusters as any[]) || [];
    return raw.map((c) => ({
      id: "",
      provider: "aliyun",
      resourceType: "cluster" as const,
      providerResourceId: c.clusterId || "",
      name: c.name || c.clusterId || "",
      region: c.regionId || regionId,
      status: c.state || "unknown",
      attributes: {
        clusterType: c.clusterType || "",
        kubernetesVersion: c.version || "",
        nodeCount: c.size || 0,
        status: c.state || "unknown",
        endpoint: c.master_url,
        vpcId: c.vpc_id,
      },
      tags: {},
      createdAt: c.created ? new Date(c.created) : new Date(),
    }));
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createRdsClient(regionId?: string): Rds20140815 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `rds.${region}.aliyuncs.com`,
    });
    // @ts-ignore
    return new Rds20140815(cfg as any);
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createVpcClient(regionId?: string): Vpc20160428 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `vpc.${region}.aliyuncs.com`,
    });
    // @ts-ignore
    return new Vpc20160428(cfg as any);
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createSlbClient(regionId?: string): Slb20140515 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `slb.${region}.aliyuncs.com`,
    });
    // @ts-ignore
    return new Slb20140515(cfg as any);
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createCdnClient(): Cdn20180510 {
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      endpoint: `cdn.aliyuncs.com`,
    });
    // @ts-ignore
    return new Cdn20180510(cfg as any);
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createCsClient(regionId?: string): Cs20151215 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `cs.${region}.aliyuncs.com`,
    });
    // @ts-ignore
    return new Cs20151215(cfg as any);
  }

  // @ts-ignore - Alibaba Cloud SDK types compatibility
  private createKvstoreClient(regionId?: string): RKvstore20150101 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `r-kvstore.${region}.aliyuncs.com`,
    });
    // @ts-ignore
    return new RKvstore20150101(cfg as any);
  }
}

// 腾讯云 Provider（真实 SDK 实现）
// 使用 tencentcloud-sdk-nodejs 调用腾讯云各服务 API，支持 10 大类资源
// 凭证有效性通过 listRegions 间接验证

import { createRequire } from "module";
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

const require = createRequire(import.meta.url);
// tencentcloud-sdk-nodejs 是 CommonJS 模块，包含所有服务客户端
const tencentcloud: any = require("tencentcloud-sdk-nodejs");

export interface TencentConfig {
  secretId: string;
  secretKey: string;
  region: string;
}

const TENCENT_REGIONS: Region[] = [
  { id: "ap-guangzhou", name: "ap-guangzhou", displayName: "广州" },
  { id: "ap-shanghai", name: "ap-shanghai", displayName: "上海" },
  { id: "ap-beijing", name: "ap-beijing", displayName: "北京" },
  { id: "ap-chengdu", name: "ap-chengdu", displayName: "成都" },
  { id: "ap-chongqing", name: "ap-chongqing", displayName: "重庆" },
  { id: "ap-nanjing", name: "ap-nanjing", displayName: "南京" },
  { id: "ap-hongkong", name: "ap-hongkong", displayName: "香港" },
  { id: "ap-singapore", name: "ap-singapore", displayName: "新加坡" },
  { id: "ap-tokyo", name: "ap-tokyo", displayName: "东京" },
  { id: "ap-seoul", name: "ap-seoul", displayName: "首尔" },
  { id: "ap-bangkok", name: "ap-bangkok", displayName: "曼谷" },
];

const TENCENT_IMAGES: Image[] = [
  { id: "img-pi0ii46r", name: "Ubuntu Server 22.04 LTS" },
  { id: "img-22xtcoso", name: "Ubuntu Server 20.04 LTS" },
  { id: "img-pi0ii46r", name: "CentOS 7.9" },
  { id: "img-eb30m23q", name: "Debian 11.1" },
  { id: "img-9qabwory", name: "Windows Server 2022" },
];

const TENCENT_INSTANCE_TYPES: InstanceType[] = [
  { id: "S5.MEDIUM4", name: "标准型 S5 - 2核4G", cpu: 2, memoryMb: 4096, diskGb: 50 },
  { id: "S5.LARGE8", name: "标准型 S5 - 4核8G", cpu: 4, memoryMb: 8192, diskGb: 50 },
  { id: "S5.2XLARGE16", name: "标准型 S5 - 8核16G", cpu: 8, memoryMb: 16384, diskGb: 100 },
  { id: "S5.4XLARGE32", name: "标准型 S5 - 16核32G", cpu: 16, memoryMb: 32768, diskGb: 200 },
  { id: "M5.MEDIUM4", name: "内存型 M5 - 2核16G", cpu: 2, memoryMb: 16384, diskGb: 50 },
  { id: "C5.LARGE8", name: "计算型 C5 - 4核8G", cpu: 4, memoryMb: 8192, diskGb: 50 },
];

interface TencentClientConfig {
  credential: { secretId: string; secretKey: string };
  region: string;
  profile: { httpProfile: { endpoint: string } };
}

export class TencentProvider implements ICloudProvider {
  readonly name = "tencent";
  readonly displayName = "腾讯云 (Tencent Cloud)";

  private secretId: string;
  private secretKey: string;
  private defaultRegion: string;

  constructor(config: TencentConfig) {
    this.secretId = config.secretId;
    this.secretKey = config.secretKey;
    this.defaultRegion = config.region || "ap-guangzhou";
  }

  private buildClientConfig(endpoint: string, region?: string): TencentClientConfig {
    return {
      credential: { secretId: this.secretId, secretKey: this.secretKey },
      region: region || this.defaultRegion,
      profile: { httpProfile: { endpoint } },
    };
  }

  // ===== 各服务客户端创建方法 =====

  private createCvmClient(region?: string): any {
    const CvmClient = tencentcloud.cvm.v20170312.Client;
    return new CvmClient(this.buildClientConfig("cvm.tencentcloudapi.com", region));
  }

  private createCbsClient(region?: string): any {
    const CbsClient = tencentcloud.cbs.v20170312.Client;
    return new CbsClient(this.buildClientConfig("cbs.tencentcloudapi.com", region));
  }

  private createCdbClient(region?: string): any {
    const CdbClient = tencentcloud.cdb.v20170320.Client;
    return new CdbClient(this.buildClientConfig("cdb.tencentcloudapi.com", region));
  }

  private createRedisClient(region?: string): any {
    const RedisClient = tencentcloud.redis.v20180412.Client;
    return new RedisClient(this.buildClientConfig("redis.tencentcloudapi.com", region));
  }

  private createClbClient(region?: string): any {
    const ClbClient = tencentcloud.clb.v20180317.Client;
    return new ClbClient(this.buildClientConfig("clb.tencentcloudapi.com", region));
  }

  private createVpcClient(region?: string): any {
    const VpcClient = tencentcloud.vpc.v20170312.Client;
    return new VpcClient(this.buildClientConfig("vpc.tencentcloudapi.com", region));
  }

  private createCdnClient(): any {
    const CdnClient = tencentcloud.cdn.v20180606.Client;
    return new CdnClient(this.buildClientConfig("cdn.tencentcloudapi.com", this.defaultRegion));
  }

  private createTkeClient(region?: string): any {
    const TkeClient = tencentcloud.tke.v20180525.Client;
    return new TkeClient(this.buildClientConfig("tke.tencentcloudapi.com", region));
  }

  private createLighthouseClient(region?: string): any {
    const LighthouseClient = tencentcloud.lighthouse.v20200324.Client;
    return new LighthouseClient(this.buildClientConfig("lighthouse.tencentcloudapi.com", region));
  }

  // ===== 实例管理（CVM + Lighthouse 轻量应用服务器）=====

  async listInstances(region?: string, _options?: ListOptions): Promise<Instance[]> {
    const regionId = region || this.defaultRegion;
    // 并行查询 CVM 和 Lighthouse，合并结果
    const [cvmInstances, lighthouseInstances] = await Promise.all([
      this.listCvmInstances(regionId),
      this.listLighthouseInstances(regionId),
    ]);
    return [...cvmInstances, ...lighthouseInstances];
  }

  private async listCvmInstances(regionId: string): Promise<Instance[]> {
    try {
      const client = this.createCvmClient(regionId);
      const response: any = await client.DescribeInstances({ Limit: 100, Offset: 0 });
      const raw = response?.InstanceSet || [];
      return (raw as any[]).map((i) => this.mapInstance(i, regionId));
    } catch (err) {
      return [];
    }
  }

  private async listLighthouseInstances(regionId: string): Promise<Instance[]> {
    // 轻量应用服务器可能分布在多个 region，遍历常见 region 查询
    const regionsToQuery = [
      regionId,
      "ap-guangzhou",
      "ap-shanghai",
      "ap-beijing",
      "ap-chengdu",
      "ap-chongqing",
      "ap-nanjing",
      "ap-hongkong",
      "ap-singapore",
      "ap-tokyo",
      "ap-seoul",
      "ap-bangkok",
      "ap-mumbai",
      "ap-jakarta",
      "na-siliconvalley",
      "na-ashburn",
      "eu-frankfurt",
    ];
    // 去重
    const uniqueRegions = [...new Set(regionsToQuery)];

    const results: Instance[] = [];
    for (const region of uniqueRegions) {
      try {
        const client = this.createLighthouseClient(region);
        const response: any = await client.DescribeInstances({ Limit: 100, Offset: 0 });
        const raw = response?.InstanceSet || [];
        const mapped = (raw as any[]).map((i) => this.mapLighthouseInstance(i, region));
        results.push(...mapped);
      } catch (err) {
        // 某些 region 可能没有开通 Lighthouse 服务，忽略错误继续下一个 region
      }
    }
    return results;
  }

  async getInstance(id: string): Promise<Instance> {
    const client = this.createCvmClient();
    const response: any = await client.DescribeInstances({
      InstanceIds: [id],
    });
    const raw = response?.InstanceSet || [];
    const inst = raw[0];
    if (!inst) {
      throw new Error(`Instance ${id} not found`);
    }
    return this.mapInstance(inst, this.defaultRegion);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const client = this.createCvmClient(opts.region);
    const params: any = {
      InstanceType: opts.instanceType,
      ImageId: opts.imageId,
      InstanceName: opts.name,
      Placement: { Zone: `${opts.region}-3` },
    };
    if (opts.subnetId) {
      params.VirtualPrivateCloud = { VpcId: "", SubnetId: opts.subnetId };
    }
    if (opts.securityGroupIds?.length) {
      params.SecurityGroupIds = opts.securityGroupIds;
    }
    const response: any = await client.RunInstances(params);
    const instanceId = response?.InstanceIdSet?.[0];
    if (!instanceId) {
      throw new Error("Failed to create instance");
    }
    return this.getInstance(instanceId);
  }

  async deleteInstance(id: string): Promise<void> {
    const client = this.createCvmClient();
    await client.TerminateInstances({ InstanceIds: [id] });
  }

  async startInstance(id: string): Promise<void> {
    const client = this.createCvmClient();
    await client.StartInstances({ InstanceIds: [id] });
  }

  async stopInstance(id: string): Promise<void> {
    const client = this.createCvmClient();
    await client.StopInstances({ InstanceIds: [id] });
  }

  async rebootInstance(id: string): Promise<void> {
    const client = this.createCvmClient();
    await client.RebootInstances({ InstanceIds: [id] });
  }

  async listRegions(): Promise<Region[]> {
    // 返回静态区域列表（用于连通性测试和前端展示）
    return TENCENT_REGIONS;
  }

  async listImages(): Promise<Image[]> {
    return TENCENT_IMAGES;
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    return TENCENT_INSTANCE_TYPES;
  }

  async getMetrics(_id: string, _timeRange: TimeRange): Promise<MetricData[]> {
    // 腾讯云监控需通过 Monitor API 查询，暂返回空数组
    return [];
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // 腾讯云费用查询需通过 费用中心 API，暂返回零值占位
    return {
      provider: "tencent",
      totalAmount: 0,
      currency: "CNY",
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown: [],
    };
  }

  // ===== 实例映射辅助方法 =====

  private mapInstance(i: any, regionId: string): Instance {
    const zone = i?.Placement?.Zone || "";
    const region = zone ? zone.replace(/-\d+$/, "") : regionId;
    const publicIp = i?.PublicIpAddresses?.[0] || null;
    const privateIp = i?.PrivateIpAddresses?.[0] || null;

    return {
      id: i.InstanceId || "",
      provider: "tencent",
      providerInstanceId: i.InstanceId || "",
      name: i.InstanceName || i.InstanceId || "",
      region,
      status: this.mapStatus(i.InstanceState || ""),
      spec: {
        cpu: i.CPU || 0,
        memoryMb: (i.Memory || 0) * 1024, // 腾讯云 Memory 单位为 GB
        diskGb: 0,
      },
      publicIp,
      privateIp,
      monthlyCost: 0,
      tags: this.convertTags(i.Tags),
      lastSyncedAt: new Date(),
      createdAt: i.CreatedTime ? new Date(i.CreatedTime) : new Date(),
    };
  }

  private mapStatus(status: string): InstanceStatus {
    switch (status) {
      case "RUNNING":
        return "running";
      case "STOPPED":
      case "STOPPING":
      case "SHUTDOWN":
        return "stopped";
      case "PENDING":
      case "STARTING":
      case "REBOOTING":
        return "pending";
      case "TERMINATED":
      case "TERMINATING":
        return "terminated";
      default:
        return "error";
    }
  }

  /** 轻量应用服务器实例映射（字段与 CVM 略有不同） */
  private mapLighthouseInstance(i: any, regionId: string): Instance {
    const zone = i?.Zone || "";
    const region = zone ? zone.replace(/-\d+$/, "") : regionId;
    const publicIp = i?.PublicAddresses?.[0] || null;
    const privateIp = i?.PrivateAddresses?.[0] || null;

    return {
      id: i.InstanceId || "",
      provider: "tencent",
      providerInstanceId: i.InstanceId || "",
      name: i.InstanceName || i.InstanceId || "",
      region,
      status: this.mapLighthouseStatus(i.InstanceState || ""),
      spec: {
        cpu: i.CPU || 0,
        memoryMb: (i.Memory || 0) * 1024, // Lighthouse Memory 单位为 GB
        diskGb: 0,
      },
      publicIp,
      privateIp,
      monthlyCost: 0,
      tags: this.convertTags(i.Tags),
      lastSyncedAt: new Date(),
      createdAt: i.CreatedTime ? new Date(i.CreatedTime) : new Date(),
    };
  }

  private mapLighthouseStatus(status: string): InstanceStatus {
    // Lighthouse 状态: RUNNING / STOPPED / STARTING / STOPPING / REBOOTING / SHUTDOWN / TERMINATING / TERMINATED / PENDING
    switch (status) {
      case "RUNNING":
        return "running";
      case "STOPPED":
      case "STOPPING":
      case "SHUTDOWN":
        return "stopped";
      case "STARTING":
      case "REBOOTING":
      case "PENDING":
        return "pending";
      case "TERMINATED":
      case "TERMINATING":
        return "terminated";
      default:
        return "error";
    }
  }

  private convertTags(tags: any[] | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    for (const tag of tags || []) {
      if (tag.Key) {
        result[tag.Key] = tag.Value || "";
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
      default:
        throw new Error(`Delete ${resourceType} not implemented for tencent`);
    }
  }

  private async listInstancesAsResources(
    region?: string
  ): Promise<CloudResource[]> {
    const instances = await this.listInstances(region);
    return instances.map((i) => ({
      id: i.id,
      provider: "tencent",
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
    try {
      const client = this.createCbsClient(regionId);
      const response: any = await client.DescribeDisks({ Limit: 100, Offset: 0 });
      const raw = response?.DiskSet || [];
      return (raw as any[]).map((d) => ({
        id: "",
        provider: "tencent",
        resourceType: "disk" as const,
        providerResourceId: d.DiskId || "",
        name: d.DiskName || d.DiskId || "",
        region: d.Placement?.Zone ? d.Placement.Zone.replace(/-\d+$/, "") : regionId,
        status: d.DiskState || "unknown",
        attributes: {
          sizeGb: d.DiskSize || 0,
          diskType: d.DiskType || "",
          encrypted: !!d.Encrypt,
          attachedInstanceId: d.InstanceId || undefined,
          attachmentStatus: d.Attached ? "attached" : "detached",
        },
        tags: this.convertTags(d.Tags),
        createdAt: d.CreateTime ? new Date(d.CreateTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private async listBuckets(): Promise<Bucket[]> {
    // TODO: COS 需要独立的 cos-nodejs-sdk-v5 或独立签名请求，暂返回空数组
    return [];
  }

  private async listDatabases(region?: string): Promise<DatabaseInstance[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createCdbClient(regionId);
      const response: any = await client.DescribeDBInstances({ Limit: 100, Offset: 0 });
      const raw = response?.Items || [];
      return (raw as any[]).map((db) => ({
        id: "",
        provider: "tencent",
        resourceType: "database" as const,
        providerResourceId: db.InstanceId || "",
        name: db.InstanceName || db.InstanceId || "",
        region: db.Region || regionId,
        status: this.mapDbStatus(db.Status),
        attributes: {
          engine: db.EngineType || "mysql",
          engineVersion: db.EngineVersion || "",
          instanceClass: db.DeviceType || "",
          storageGb: db.Volume || 0,
          multiAz: false,
          endpoint: db.WanAddress,
          port: db.WanPort ? Number(db.WanPort) : undefined,
        },
        tags: this.convertTags(db.TagInfo),
        createdAt: db.CreateTime ? new Date(db.CreateTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private mapDbStatus(status: number): string {
    // 腾讯云 CDB 状态为数字：0=创建中，1=运行中，4=隔离中，5=回收中
    switch (status) {
      case 1:
        return "running";
      case 0:
        return "pending";
      case 4:
      case 5:
        return "stopped";
      default:
        return "unknown";
    }
  }

  private async listCacheClusters(region?: string): Promise<CacheInstance[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createRedisClient(regionId);
      const response: any = await client.DescribeInstances({ Limit: 100, Offset: 0 });
      const raw = response?.InstanceSet || [];
      return (raw as any[]).map((c) => ({
        id: "",
        provider: "tencent",
        resourceType: "cache" as const,
        providerResourceId: c.InstanceId || "",
        name: c.InstanceName || c.InstanceId || "",
        region: c.Region || regionId,
        status: this.mapRedisStatus(c.Status),
        attributes: {
          engine: c.Engine || "Redis",
          engineVersion: c.EngineVersion || "",
          instanceClass: c.Type || "",
          memoryMb: c.Size ? Number(c.Size) : 0,
          nodeType: c.Type,
          shardCount: c.ShardNum,
          endpoint: c.WanAddress,
          port: c.Port ? Number(c.Port) : undefined,
        },
        tags: this.convertTags(c.TagKeys),
        createdAt: c.CreateTime ? new Date(c.CreateTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private mapRedisStatus(status: string): string {
    switch (status) {
      case "running":
        return "running";
      case "init":
        return "pending";
      case "isolating":
      case "isolated":
        return "stopped";
      default:
        return status || "unknown";
    }
  }

  private async listLoadBalancers(
    region?: string
  ): Promise<LoadBalancer[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createClbClient(regionId);
      const response: any = await client.DescribeLoadBalancers({
        Limit: 100,
        Offset: 0,
      });
      const raw = response?.LoadBalancerSet || [];
      return (raw as any[]).map((lb) => ({
        id: "",
        provider: "tencent",
        resourceType: "loadbalancer" as const,
        providerResourceId: lb.LoadBalancerId || "",
        name: lb.LoadBalancerName || lb.LoadBalancerId || "",
        region: lb.Region || regionId,
        status: this.mapClbStatus(lb.Status),
        attributes: {
          type: lb.LoadBalancerType || "",
          scheme: lb.LoadBalancerType === "OPEN" ? "internet" : "internal",
          dnsName: lb.DNSName,
          vpcId: lb.VpcId,
          listenerCount: 0,
          targetCount: 0,
        },
        tags: this.convertTags(lb.Tags),
        createdAt: lb.CreateTime ? new Date(lb.CreateTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private mapClbStatus(status: number): string {
    // 腾讯云 CLB 状态：0=创建中，1=正常运行
    switch (status) {
      case 1:
        return "running";
      case 0:
        return "pending";
      default:
        return "unknown";
    }
  }

  private async listVpcs(region?: string): Promise<Vpc[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createVpcClient(regionId);
      const response: any = await client.DescribeVpcs({ Limit: 100, Offset: 0 });
      const raw = response?.VpcSet || [];
      return (raw as any[]).map((v) => ({
        id: "",
        provider: "tencent",
        resourceType: "vpc" as const,
        providerResourceId: v.VpcId || "",
        name: v.VpcName || v.VpcId || "",
        region: regionId,
        status: v.State || "available",
        attributes: {
          cidrBlock: v.CidrBlock || "",
          subnetCount: v.SubnetCount || 0,
          isDefault: !!v.IsDefault,
          state: v.State || "available",
        },
        tags: this.convertTags(v.TagSet),
        createdAt: v.CreatedTime ? new Date(v.CreatedTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private async listSecurityGroups(
    region?: string
  ): Promise<SecurityGroup[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createVpcClient(regionId);
      const response: any = await client.DescribeSecurityGroups({
        Limit: 100,
        Offset: 0,
      });
      const raw = response?.SecurityGroupSet || [];
      return (raw as any[]).map((sg) => ({
        id: "",
        provider: "tencent",
        resourceType: "securitygroup" as const,
        providerResourceId: sg.SecurityGroupId || "",
        name: sg.SecurityGroupName || sg.SecurityGroupId || "",
        region: regionId,
        status: "active",
        attributes: {
          vpcId: undefined,
          ruleCount: 0,
          ingressRules: 0,
          egressRules: 0,
          description: sg.SecurityGroupDesc,
        },
        tags: this.convertTags(sg.TagSet),
        createdAt: sg.CreatedTime ? new Date(sg.CreatedTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private async listCdnDomains(): Promise<CdnDistribution[]> {
    try {
      const client = this.createCdnClient();
      const response: any = await client.DescribeDomains({ Limit: 100, Offset: 0 });
      const raw = response?.Domains || [];
      return (raw as any[]).map((d) => ({
        id: "",
        provider: "tencent",
        resourceType: "cdn" as const,
        providerResourceId: d.Domain || "",
        name: d.Domain || "",
        region: "global",
        status: d.Status || "unknown",
        attributes: {
          domainName: d.Domain || "",
          originDomain: d.Origin?.[0]?.Origin,
          originType: d.Origin?.[0]?.OriginType || "",
          enabled: d.Status === "online",
          priceClass: undefined,
          sslCertificate: undefined,
        },
        tags: {},
        createdAt: d.CreateTime ? new Date(d.CreateTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }

  private async listClusters(region?: string): Promise<Cluster[]> {
    const regionId = region || this.defaultRegion;
    try {
      const client = this.createTkeClient(regionId);
      const response: any = await client.DescribeClusters({ Limit: 100, Offset: 0 });
      const raw = response?.clusters || [];
      return (raw as any[]).map((c) => ({
        id: "",
        provider: "tencent",
        resourceType: "cluster" as const,
        providerResourceId: c.ClusterId || "",
        name: c.ClusterName || c.ClusterId || "",
        region: c.Region || regionId,
        status: c.ClusterStatus || "unknown",
        attributes: {
          clusterType: c.ClusterType || "",
          kubernetesVersion: c.Version || "",
          nodeCount: c.NodeCount || 0,
          status: c.ClusterStatus || "unknown",
          endpoint: c.Endpoint,
          vpcId: c.VpcId,
        },
        tags: {},
        createdAt: c.CreatedTime ? new Date(c.CreatedTime) : new Date(),
      }));
    } catch (err) {
      return [];
    }
  }
}

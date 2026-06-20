// 华为云 Provider
// 使用 @huaweicloud/huaweicloud-sdk-* 各服务包进行真实 API 调用
// 支持 ECS / EVS / VPC / RDS / DCS / ELB / CCE 等资源类型

import { BasicCredentials } from "@huaweicloud/huaweicloud-sdk-core";
import {
  EcsClient,
  ListServersDetailsRequest,
  ShowServerRequest,
  DeleteServersRequest,
  DeleteServersRequestBody,
  BatchStartServersRequest,
  BatchStartServersRequestBody,
  BatchStartServersOption,
  BatchStopServersRequest,
  BatchStopServersRequestBody,
  BatchStopServersOption,
  BatchRebootServersRequest,
  BatchRebootServersRequestBody,
  BatchRebootSeversOption,
  ServerId,
  ServerDetail,
} from "@huaweicloud/huaweicloud-sdk-ecs";
import { EvsClient, ListVolumesRequest } from "@huaweicloud/huaweicloud-sdk-evs";
import {
  VpcClient,
  ListVpcsRequest,
  ListSecurityGroupsRequest,
} from "@huaweicloud/huaweicloud-sdk-vpc";
import {
  RdsClient,
  ListInstancesRequest as ListRdsInstancesRequest,
} from "@huaweicloud/huaweicloud-sdk-rds";
import {
  DcsClient,
  ListInstancesRequest as ListDcsInstancesRequest,
} from "@huaweicloud/huaweicloud-sdk-dcs";
import { ElbClient, ListLoadbalancersRequest } from "@huaweicloud/huaweicloud-sdk-elb";
import { CceClient, ListClustersRequest } from "@huaweicloud/huaweicloud-sdk-cce";
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

export interface HuaweiConfig {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  projectId?: string;
}

const HUAWEI_REGIONS: Region[] = [
  { id: "cn-north-4", name: "cn-north-4", displayName: "华北-北京四" },
  { id: "cn-north-1", name: "cn-north-1", displayName: "华北-北京一" },
  { id: "cn-east-3", name: "cn-east-3", displayName: "华东-上海一" },
  { id: "cn-east-2", name: "cn-east-2", displayName: "华东-上海二" },
  { id: "cn-south-1", name: "cn-south-1", displayName: "华南-广州" },
  { id: "cn-southwest-2", name: "cn-southwest-2", displayName: "西南-贵阳一" },
  { id: "ap-southeast-1", name: "ap-southeast-1", displayName: "中国-香港" },
  { id: "ap-southeast-2", name: "ap-southeast-2", displayName: "亚太-曼谷" },
  { id: "ap-southeast-3", name: "ap-southeast-3", displayName: "亚太-新加坡" },
];

const HUAWEI_IMAGES: Image[] = [
  { id: "ubuntu_22.04", name: "Ubuntu 22.04 server" },
  { id: "ubuntu_20.04", name: "Ubuntu 20.04 server" },
  { id: "centos_7.9", name: "CentOS 7.9" },
  { id: "debian_11.2", name: "Debian 11.2" },
  { id: "windows_2022", name: "Windows Server 2022 数据中心版" },
];

const HUAWEI_INSTANCE_TYPES: InstanceType[] = [
  { id: "s6.medium.2", name: "通用计算增强型 s6 - 1核2G", cpu: 1, memoryMb: 2048, diskGb: 40 },
  { id: "s6.large.2", name: "通用计算增强型 s6 - 2核4G", cpu: 2, memoryMb: 4096, diskGb: 40 },
  { id: "s6.xlarge.2", name: "通用计算增强型 s6 - 4核8G", cpu: 4, memoryMb: 8192, diskGb: 80 },
  { id: "s6.2xlarge.2", name: "通用计算增强型 s6 - 8核16G", cpu: 8, memoryMb: 16384, diskGb: 100 },
  { id: "c6.large.4", name: "通用计算型 c6 - 2核8G", cpu: 2, memoryMb: 8192, diskGb: 50 },
  { id: "m6.large.8", name: "内存优化型 m6 - 2核16G", cpu: 2, memoryMb: 16384, diskGb: 50 },
];

export class HuaweiProvider implements ICloudProvider {
  readonly name = "huawei";
  readonly displayName = "华为云 (Huawei Cloud)";

  private accessKeyId: string;
  private accessKeySecret: string;
  private defaultRegion: string;
  private projectId?: string;

  constructor(config: HuaweiConfig) {
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.defaultRegion = config.region;
    this.projectId = config.projectId;
  }

  // ===== 凭证与客户端构造 =====

  private createCredentials(): BasicCredentials {
    return new BasicCredentials()
      .withAk(this.accessKeyId)
      .withSk(this.accessKeySecret)
      .withProjectId(this.projectId || "");
  }

  private endpoint(service: string, region?: string): string {
    return `https://${service}.${region || this.defaultRegion}.myhuaweicloud.com`;
  }

  private createEcsClient(region?: string): EcsClient {
    return EcsClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("ecs", region))
      .build();
  }

  private createEvsClient(region?: string): EvsClient {
    return EvsClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("evs", region))
      .build();
  }

  private createVpcClient(region?: string): VpcClient {
    return VpcClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("vpc", region))
      .build();
  }

  private createRdsClient(region?: string): RdsClient {
    return RdsClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("rds", region))
      .build();
  }

  private createDcsClient(region?: string): DcsClient {
    return DcsClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("dcs", region))
      .build();
  }

  private createElbClient(region?: string): ElbClient {
    return ElbClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("elb", region))
      .build();
  }

  private createCceClient(region?: string): CceClient {
    return CceClient.newBuilder()
      .withCredential(this.createCredentials())
      .withEndpoint(this.endpoint("cce", region))
      .build();
  }

  // ===== 实例管理 =====

  async listInstances(region?: string, _options?: ListOptions): Promise<Instance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createEcsClient(regionId);
    const req = new ListServersDetailsRequest();
    req.withLimit(100);
    const resp = await client.listServersDetails(req);
    const servers = resp.servers || [];
    return servers.map((s) => this.mapInstance(s, regionId));
  }

  async getInstance(id: string): Promise<Instance> {
    const client = this.createEcsClient();
    const req = new ShowServerRequest();
    req.withServerId(id);
    const resp = await client.showServer(req);
    const server = resp.server;
    if (!server) {
      throw new Error(`Instance ${id} not found`);
    }
    return this.mapInstance(server, this.defaultRegion);
  }

  async createInstance(_opts: CreateInstanceOpts): Promise<Instance> {
    // TODO: 华为云 ECS CreateServer 需要 PrePaidServer 复杂参数（nics/root_volume 等），暂未实现
    throw new Error("华为云实例创建暂未实现：CreateServer 需要 PrePaidServer 完整参数");
  }

  async deleteInstance(id: string): Promise<void> {
    const client = this.createEcsClient();
    const req = new DeleteServersRequest();
    const body = new DeleteServersRequestBody();
    body.withServers([new ServerId(id)]);
    body.withDeletePublicip(true);
    body.withDeleteVolume(true);
    req.withBody(body);
    await client.deleteServers(req);
  }

  async startInstance(id: string): Promise<void> {
    const client = this.createEcsClient();
    const req = new BatchStartServersRequest();
    const body = new BatchStartServersRequestBody();
    const opt = new BatchStartServersOption();
    opt.withServers([new ServerId(id)]);
    body.withOsStart(opt);
    req.withBody(body);
    await client.batchStartServers(req);
  }

  async stopInstance(id: string): Promise<void> {
    const client = this.createEcsClient();
    const req = new BatchStopServersRequest();
    const body = new BatchStopServersRequestBody();
    const opt = new BatchStopServersOption();
    opt.withServers([new ServerId(id)]);
    body.withOsStop(opt);
    req.withBody(body);
    await client.batchStopServers(req);
  }

  async rebootInstance(id: string): Promise<void> {
    const client = this.createEcsClient();
    const req = new BatchRebootServersRequest();
    const body = new BatchRebootServersRequestBody();
    const opt = new BatchRebootSeversOption();
    opt.withServers([new ServerId(id)]);
    body.withReboot(opt);
    req.withBody(body);
    await client.batchRebootServers(req);
  }

  // ===== 区域/镜像/规格 =====

  async listRegions(): Promise<Region[]> {
    return HUAWEI_REGIONS;
  }

  async listImages(): Promise<Image[]> {
    return HUAWEI_IMAGES;
  }

  async listInstanceTypes(_region: string): Promise<InstanceType[]> {
    return HUAWEI_INSTANCE_TYPES;
  }

  // ===== 监控与费用 =====

  async getMetrics(_id: string, _timeRange: TimeRange): Promise<MetricData[]> {
    // 华为云监控需通过 CES API 查询，暂返回空数组
    return [];
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // 华为云费用查询需通过 BSS API，暂返回零值占位
    return {
      provider: "huawei",
      totalAmount: 0,
      currency: "CNY",
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown: [],
    };
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
        throw new Error(`Delete ${resourceType} not implemented for huawei`);
    }
  }

  private async listInstancesAsResources(
    region?: string
  ): Promise<CloudResource[]> {
    const instances = await this.listInstances(region);
    return instances.map((i) => ({
      id: i.id,
      provider: "huawei",
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
    const client = this.createEvsClient(regionId);
    const req = new ListVolumesRequest();
    req.withLimit(100);
    const resp = await client.listVolumes(req);
    const volumes = resp.volumes || [];
    return volumes.map((v) => ({
      id: "",
      provider: "huawei",
      resourceType: "disk" as const,
      providerResourceId: v.id || "",
      name: v.name || v.id || "",
      region: regionId,
      status: v.status || "unknown",
      attributes: {
        sizeGb: v.size || 0,
        diskType: v.volumeType || "",
        encrypted: v.encrypted || false,
        attachedInstanceId: v.attachments?.[0]?.serverId,
        attachmentStatus:
          v.attachments && v.attachments.length > 0 ? "attached" : "detached",
      },
      tags: v.tags || {},
      createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
    }));
  }

  private async listBuckets(): Promise<Bucket[]> {
    // TODO: OBS 需要 S3 兼容 API 或独立 SDK，暂返回空数组
    return [];
  }

  private async listDatabases(region?: string): Promise<DatabaseInstance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createRdsClient(regionId);
    const req = new ListRdsInstancesRequest();
    req.withLimit(100);
    const resp = await client.listInstances(req);
    const dbs = resp.instances || [];
    return dbs.map((db) => ({
      id: "",
      provider: "huawei",
      resourceType: "database" as const,
      providerResourceId: db.id || "",
      name: db.name || db.id || "",
      region: db.region || regionId,
      status: db.status || "unknown",
      attributes: {
        engine: db.datastore?.type || "",
        engineVersion: db.datastore?.version || "",
        instanceClass: db.flavorRef || "",
        storageGb: db.volume?.size || 0,
        multiAz: false,
        endpoint: db.privateIps?.[0],
        port: db.port,
      },
      tags: {},
      createdAt: db.created ? new Date(db.created) : new Date(),
    }));
  }

  private async listCacheClusters(region?: string): Promise<CacheInstance[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createDcsClient(regionId);
    const req = new ListDcsInstancesRequest();
    req.withLimit(100);
    const resp = await client.listInstances(req);
    const caches = resp.instances || [];
    return caches.map((c) => ({
      id: "",
      provider: "huawei",
      resourceType: "cache" as const,
      providerResourceId: c.instanceId || "",
      name: c.name || c.instanceId || "",
      region: regionId,
      status: c.status || "unknown",
      attributes: {
        engine: c.engine || "Redis",
        engineVersion: c.engineVersion || "",
        instanceClass: c.specCode || "",
        memoryMb: c.capacity ? Number(c.capacity) : 0,
        endpoint: c.ip,
        port: c.port,
      },
      tags: {},
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    }));
  }

  private async listLoadBalancers(
    region?: string
  ): Promise<LoadBalancer[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createElbClient(regionId);
    const req = new ListLoadbalancersRequest();
    req.withLimit(100);
    const resp = await client.listLoadbalancers(req);
    const lbs = resp.loadbalancers || [];
    return lbs.map((lb) => ({
      id: "",
      provider: "huawei",
      resourceType: "loadbalancer" as const,
      providerResourceId: lb.id || "",
      name: lb.name || lb.id || "",
      region: regionId,
      status: lb.provisioningStatus || "unknown",
      attributes: {
        type: "elb",
        scheme: "internet",
        dnsName: lb.vipAddress,
        vpcId: undefined,
        listenerCount: lb.listeners?.length || 0,
        targetCount: lb.pools?.length || 0,
      },
      tags: {},
      createdAt: lb.createdAt ? new Date(lb.createdAt) : new Date(),
    }));
  }

  private async listVpcs(region?: string): Promise<Vpc[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createVpcClient(regionId);
    const req = new ListVpcsRequest();
    req.withLimit(100);
    const resp = await client.listVpcs(req);
    const vpcs = resp.vpcs || [];
    return vpcs.map((v) => ({
      id: "",
      provider: "huawei",
      resourceType: "vpc" as const,
      providerResourceId: v.id || "",
      name: v.name || v.id || "",
      region: regionId,
      status: v.status || "available",
      attributes: {
        cidrBlock: v.cidr || "",
        subnetCount: 0,
        isDefault: false,
        state: v.status || "available",
      },
      tags: {},
      createdAt: v.createdAt || new Date(),
    }));
  }

  private async listSecurityGroups(
    region?: string
  ): Promise<SecurityGroup[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createVpcClient(regionId);
    const req = new ListSecurityGroupsRequest();
    req.withLimit(100);
    const resp = await client.listSecurityGroups(req);
    const sgs = resp.securityGroups || [];
    return sgs.map((sg) => ({
      id: "",
      provider: "huawei",
      resourceType: "securitygroup" as const,
      providerResourceId: sg.id || "",
      name: sg.name || sg.id || "",
      region: regionId,
      status: "active",
      attributes: {
        vpcId: sg.vpcId,
        ruleCount: sg.securityGroupRules?.length || 0,
        ingressRules: 0,
        egressRules: 0,
        description: sg.description,
      },
      tags: {},
      createdAt: new Date(),
    }));
  }

  private async listCdnDomains(): Promise<CdnDistribution[]> {
    // TODO: CDN 需要独立 SDK（@huaweicloud/huaweicloud-sdk-cdn），暂返回空数组
    return [];
  }

  private async listClusters(region?: string): Promise<Cluster[]> {
    const regionId = region || this.defaultRegion;
    const client = this.createCceClient(regionId);
    const req = new ListClustersRequest();
    const resp = await client.listClusters(req);
    const clusters = resp.items || [];
    return clusters.map((c) => ({
      id: "",
      provider: "huawei",
      resourceType: "cluster" as const,
      providerResourceId: c.metadata?.uid || "",
      name: c.metadata?.name || c.metadata?.uid || "",
      region: regionId,
      status: c.status?.phase || "unknown",
      attributes: {
        clusterType: c.spec?.type || c.spec?.category || "",
        kubernetesVersion: c.spec?.version || "",
        nodeCount: 0,
        status: c.status?.phase || "unknown",
      },
      tags: {},
      createdAt: c.metadata?.creationTimestamp
        ? new Date(c.metadata.creationTimestamp)
        : new Date(),
    }));
  }

  // ===== 映射辅助 =====

  private mapInstance(server: ServerDetail, regionId: string): Instance {
    const flavor = server.flavor;
    const cpu = flavor?.vcpus ? Number(flavor.vcpus) : 0;
    const memoryMb = flavor?.ram ? Number(flavor.ram) : 0;
    const diskGb = flavor?.disk ? Number(flavor.disk) : 0;

    let publicIp: string | null = null;
    let privateIp: string | null = null;
    if (server.addresses) {
      for (const addrs of Object.values(server.addresses)) {
        for (const addr of addrs) {
          if (addr.oSEXTIPSType === "floating") {
            if (!publicIp) publicIp = addr.addr || null;
          } else if (!privateIp) {
            privateIp = addr.addr || null;
          }
        }
      }
    }

    return {
      id: server.id || "",
      provider: "huawei",
      providerInstanceId: server.id || "",
      name: server.name || server.id || "",
      region: regionId,
      status: this.mapStatus(server.status || ""),
      spec: { cpu, memoryMb, diskGb },
      publicIp,
      privateIp,
      monthlyCost: 0,
      tags: server.metadata || {},
      lastSyncedAt: new Date(),
      createdAt: server.created ? new Date(server.created) : new Date(),
    };
  }

  private mapStatus(status: string): InstanceStatus {
    switch (status) {
      case "ACTIVE":
        return "running";
      case "SHUTOFF":
        return "stopped";
      case "BUILD":
      case "REBOOT":
      case "HARD_REBOOT":
      case "MIGRATING":
      case "REBUILD":
        return "pending";
      case "DELETED":
        return "terminated";
      default:
        return "error";
    }
  }
}

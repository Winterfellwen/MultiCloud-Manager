import Ecs20140526, {
  DescribeInstancesRequest,
  DescribeInstancesResponse,
  DescribeRegionsRequest,
  DescribeRegionsResponse,
  StartInstanceRequest,
  StopInstanceRequest,
  RebootInstanceRequest,
  DeleteInstanceRequest,
  RunInstancesRequest,
} from "@alicloud/ecs20140526";
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
} from "../types.js";

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

  private createClient(regionId?: string): Ecs20140526 {
    const region = regionId || this.defaultRegion;
    const cfg = new Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      regionId: region,
      endpoint: `ecs.${region}.aliyuncs.com`,
    });
    return new Ecs20140526(cfg);
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
}

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  DescribeImagesCommand,
  DescribeInstanceTypesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";
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
  CostBreakdown,
  InstanceStatus,
} from "../types.js";

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface AWSConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  roleArn?: string;
}

export class AWSProvider implements ICloudProvider {
  readonly name = "aws";
  readonly displayName = "Amazon Web Services";

  private credentials: AwsCredentials;
  private defaultRegion: string;
  private ec2: EC2Client;
  private cloudWatch: CloudWatchClient;
  private costExplorer: CostExplorerClient;

  constructor(config: AWSConfig) {
    this.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
    this.defaultRegion = config.region;

    this.ec2 = new EC2Client({
      region: config.region,
      credentials: this.credentials,
    });
    this.cloudWatch = new CloudWatchClient({
      region: config.region,
      credentials: this.credentials,
    });
    this.costExplorer = new CostExplorerClient({
      region: "us-east-1",
      credentials: this.credentials,
    });
  }

  private ec2ForRegion(region: string): EC2Client {
    return new EC2Client({ region, credentials: this.credentials });
  }

  async listInstances(region?: string, _options?: ListOptions): Promise<Instance[]> {
    const targetRegion = region || this.defaultRegion;
    const ec2 = this.ec2ForRegion(targetRegion);

    const command = new DescribeInstancesCommand({
      Filters: [
        { Name: "instance-state-name", Values: ["running", "stopped", "pending", "stopping"] },
      ],
    });

    const response = await ec2.send(command);
    const instances: Instance[] = [];

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const name = instance.Tags?.find((t) => t.Key === "Name")?.Value || instance.InstanceId || "";
        const status = this.mapInstanceState(instance.State?.Name || "unknown");

        instances.push({
          id: instance.InstanceId || "",
          provider: "aws",
          providerInstanceId: instance.InstanceId || "",
          name,
          region: targetRegion,
          status,
          spec: {
            cpu: 0,
            memoryMb: 0,
            diskGb: 0,
          },
          publicIp: instance.PublicIpAddress || null,
          privateIp: instance.PrivateIpAddress || null,
          monthlyCost: 0,
          tags: this.convertTags(instance.Tags),
          lastSyncedAt: new Date(),
          createdAt: instance.LaunchTime || new Date(),
        });
      }
    }

    return instances;
  }

  async getInstance(id: string): Promise<Instance> {
    const command = new DescribeInstancesCommand({
      InstanceIds: [id],
    });

    const response = await this.ec2.send(command);
    const instance = response.Reservations?.[0]?.Instances?.[0];

    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }

    const name = instance.Tags?.find((t) => t.Key === "Name")?.Value || instance.InstanceId || "";
    const status = this.mapInstanceState(instance.State?.Name || "unknown");

    return {
      id: instance.InstanceId || "",
      provider: "aws",
      providerInstanceId: instance.InstanceId || "",
      name,
      region: this.defaultRegion,
      status,
      spec: { cpu: 0, memoryMb: 0, diskGb: 0 },
      publicIp: instance.PublicIpAddress || null,
      privateIp: instance.PrivateIpAddress || null,
      monthlyCost: 0,
      tags: this.convertTags(instance.Tags),
      lastSyncedAt: new Date(),
      createdAt: instance.LaunchTime || new Date(),
    };
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    const ec2 = this.ec2ForRegion(opts.region);

    const command = new RunInstancesCommand({
      ImageId: opts.imageId,
      InstanceType: opts.instanceType as any,
      MinCount: 1,
      MaxCount: 1,
      SubnetId: opts.subnetId,
      SecurityGroupIds: opts.securityGroupIds,
      TagSpecifications: opts.tags
        ? [
            {
              ResourceType: "instance",
              Tags: Object.entries(opts.tags).map(([Key, Value]) => ({
                Key,
                Value: String(Value),
              })),
            },
          ]
        : [],
    });

    const response = await ec2.send(command);
    const instance = response.Instances?.[0];

    if (!instance) {
      throw new Error("Failed to create instance");
    }

    return this.getInstance(instance.InstanceId || "");
  }

  async deleteInstance(id: string): Promise<void> {
    const command = new TerminateInstancesCommand({
      InstanceIds: [id],
    });
    await this.ec2.send(command);
  }

  async startInstance(id: string): Promise<void> {
    const command = new StartInstancesCommand({
      InstanceIds: [id],
    });
    await this.ec2.send(command);
  }

  async stopInstance(id: string): Promise<void> {
    const command = new StopInstancesCommand({
      InstanceIds: [id],
    });
    await this.ec2.send(command);
  }

  async rebootInstance(id: string): Promise<void> {
    const command = new RebootInstancesCommand({
      InstanceIds: [id],
    });
    await this.ec2.send(command);
  }

  async listRegions(): Promise<Region[]> {
    const command = new DescribeRegionsCommand({});
    const response = await this.ec2.send(command);

    return (response.Regions || []).map((r) => ({
      id: r.RegionName || "",
      name: r.RegionName || "",
      displayName: r.RegionName || "",
    }));
  }

  async listImages(): Promise<Image[]> {
    const command = new DescribeImagesCommand({
      Owners: ["amazon"],
      Filters: [
        { Name: "state", Values: ["available"] },
        { Name: "architecture", Values: ["x86_64"] },
      ],
    });

    const response = await this.ec2.send(command);

    return (response.Images || []).slice(0, 50).map((img) => ({
      id: img.ImageId || "",
      name: img.Name || img.ImageId || "",
      description: img.Description,
    }));
  }

  async listInstanceTypes(region: string): Promise<InstanceType[]> {
    const ec2 = this.ec2ForRegion(region);

    const command = new DescribeInstanceTypesCommand({});
    const response = await ec2.send(command);

    return (response.InstanceTypes || []).map((it) => ({
      id: it.InstanceType || "",
      name: it.InstanceType || "",
      cpu: it.VCpuInfo?.DefaultVCpus || 0,
      memoryMb: it.MemoryInfo?.SizeInMiB || 0,
      diskGb: it.InstanceStorageInfo?.Disks?.reduce((sum, d) => sum + (d.SizeInGB || 0), 0),
    }));
  }

  async getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]> {
    const command = new GetMetricStatisticsCommand({
      Namespace: "AWS/EC2",
      MetricName: "CPUUtilization",
      Dimensions: [{ Name: "InstanceId", Value: id }],
      StartTime: timeRange.start,
      EndTime: timeRange.end,
      Period: 300,
      Statistics: ["Average"],
    });

    const response = await this.cloudWatch.send(command);

    return (response.Datapoints || []).map((dp) => ({
      timestamp: dp.Timestamp || new Date(),
      value: dp.Average || 0,
      unit: dp.Unit || "Percent",
    }));
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    const command = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: timeRange.start.toISOString().split("T")[0],
        End: timeRange.end.toISOString().split("T")[0],
      },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    });

    const response = await this.costExplorer.send(command);
    let totalAmount = 0;
    const breakdown: CostBreakdown[] = [];

    for (const result of response.ResultsByTime || []) {
      for (const group of result.Groups || []) {
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");
        totalAmount += amount;
        breakdown.push({
          service: group.Keys?.[0] || "Unknown",
          amount,
        });
      }
    }

    return {
      provider: "aws",
      totalAmount,
      currency: "USD",
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown,
    };
  }

  private mapInstanceState(state: string): InstanceStatus {
    switch (state.toLowerCase()) {
      case "running":
        return "running";
      case "stopped":
        return "stopped";
      case "pending":
        return "pending";
      case "terminated":
        return "terminated";
      case "shutting-down":
      case "stopping":
        return "terminated";
      default:
        return "error";
    }
  }

  private convertTags(
    tags: { Key?: string; Value?: string }[] | undefined
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const tag of tags || []) {
      if (tag.Key && tag.Value) {
        result[tag.Key] = tag.Value;
      }
    }
    return result;
  }
}

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
  DescribeVolumesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DeleteVolumeCommand,
} from "@aws-sdk/client-ec2";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";
import { S3Client, ListBucketsCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { RDSClient, DescribeDBInstancesCommand, DeleteDBInstanceCommand } from "@aws-sdk/client-rds";
import { ElastiCacheClient, DescribeCacheClustersCommand, DeleteCacheClusterCommand } from "@aws-sdk/client-elasticache";
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { EKSClient, ListClustersCommand, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { CloudFrontClient, ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
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

  // ===== 通用资源管理 =====

  getSupportedResourceTypes(): ResourceType[] {
    return ['instance', 'disk', 'bucket', 'database', 'cache', 'loadbalancer', 'vpc', 'securitygroup', 'cdn', 'cluster'];
  }

  async listResources(resourceType: ResourceType, region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': return this.listInstancesAsResources(region);
      case 'disk': return this.listDisks(region);
      case 'bucket': return this.listBuckets();
      case 'database': return this.listDatabases(region);
      case 'cache': return this.listCacheClusters(region);
      case 'loadbalancer': return this.listLoadBalancers(region);
      case 'vpc': return this.listVpcs(region);
      case 'securitygroup': return this.listSecurityGroups(region);
      case 'cdn': return this.listCdnDistributions();
      case 'cluster': return this.listEksClusters(region);
      default: return [];
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
      case 'instance': return this.deleteInstance(id);
      case 'disk': {
        const ec2 = this.ec2ForRegion(this.defaultRegion);
        await ec2.send(new DeleteVolumeCommand({ VolumeId: id }));
        return;
      }
      case 'bucket': {
        const s3 = new S3Client({ region: this.defaultRegion, credentials: this.credentials });
        await s3.send(new DeleteBucketCommand({ Bucket: id }));
        return;
      }
      case 'database': return this.deleteDatabase(id);
      case 'cache': return this.deleteCache(id);
      default: throw new Error(`Delete ${resourceType} not implemented for AWS`);
    }
  }

  private async deleteDatabase(id: string): Promise<void> {
    const rds = new RDSClient({ region: this.defaultRegion, credentials: this.credentials });
    await rds.send(new DeleteDBInstanceCommand({
      DBInstanceIdentifier: id,
      SkipFinalSnapshot: true,
    }));
  }

  private async deleteCache(id: string): Promise<void> {
    const client = new ElastiCacheClient({ region: this.defaultRegion, credentials: this.credentials });
    await client.send(new DeleteCacheClusterCommand({
      CacheClusterId: id,
    }));
  }

  private async listInstancesAsResources(region?: string): Promise<CloudResource[]> {
    const instances = await this.listInstances(region);
    return instances.map(i => ({
      id: i.id,
      provider: 'aws',
      resourceType: 'instance' as const,
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
    const ec2 = this.ec2ForRegion(region || this.defaultRegion);
    const response = await ec2.send(new DescribeVolumesCommand({}));
    return (response.Volumes || []).map(vol => ({
      id: '',
      provider: 'aws',
      resourceType: 'disk' as const,
      providerResourceId: vol.VolumeId || '',
      name: vol.Tags?.find(t => t.Key === 'Name')?.Value || vol.VolumeId || '',
      region: region || this.defaultRegion,
      status: vol.State || 'unknown',
      attributes: {
        sizeGb: vol.Size || 0,
        diskType: vol.VolumeType || 'gp2',
        iops: vol.Iops,
        encrypted: vol.Encrypted || false,
        attachedInstanceId: vol.Attachments?.[0]?.InstanceId,
        attachmentStatus: vol.Attachments?.[0]?.State,
      },
      tags: this.convertTags(vol.Tags),
      createdAt: vol.CreateTime || new Date(),
    }));
  }

  private async listBuckets(): Promise<Bucket[]> {
    const s3 = new S3Client({ region: this.defaultRegion, credentials: this.credentials });
    const response = await s3.send(new ListBucketsCommand({}));
    return (response.Buckets || []).map(bucket => ({
      id: '',
      provider: 'aws',
      resourceType: 'bucket' as const,
      providerResourceId: bucket.Name || '',
      name: bucket.Name || '',
      region: this.defaultRegion,
      status: 'active',
      attributes: {
        storageClass: 'standard',
        objectCount: 0,
        sizeBytes: 0,
        versioning: false,
        publicAccess: true,
      },
      tags: {},
      createdAt: bucket.CreationDate || new Date(),
    }));
  }

  private async listDatabases(region?: string): Promise<DatabaseInstance[]> {
    const rds = new RDSClient({ region: region || this.defaultRegion, credentials: this.credentials });
    const response = await rds.send(new DescribeDBInstancesCommand({}));
    return (response.DBInstances || []).map(db => ({
      id: '',
      provider: 'aws',
      resourceType: 'database' as const,
      providerResourceId: db.DBInstanceIdentifier || '',
      name: db.DBInstanceIdentifier || '',
      region: region || this.defaultRegion,
      status: db.DBInstanceStatus || 'unknown',
      attributes: {
        engine: db.Engine || '',
        engineVersion: db.EngineVersion || '',
        instanceClass: db.DBInstanceClass || '',
        storageGb: db.AllocatedStorage || 0,
        multiAz: db.MultiAZ || false,
        endpoint: db.Endpoint?.Address,
        port: db.Endpoint?.Port,
      },
      tags: {},
      createdAt: db.InstanceCreateTime || new Date(),
    }));
  }

  private async listCacheClusters(region?: string): Promise<CacheInstance[]> {
    const client = new ElastiCacheClient({ region: region || this.defaultRegion, credentials: this.credentials });
    const response = await client.send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true }));
    return (response.CacheClusters || []).map(cache => ({
      id: '',
      provider: 'aws',
      resourceType: 'cache' as const,
      providerResourceId: cache.CacheClusterId || '',
      name: cache.CacheClusterId || '',
      region: region || this.defaultRegion,
      status: cache.CacheClusterStatus || 'unknown',
      attributes: {
        engine: cache.Engine || '',
        engineVersion: cache.EngineVersion || '',
        instanceClass: cache.CacheNodeType || '',
        memoryMb: 0,
        nodeType: cache.CacheNodeType,
        shardCount: cache.NumCacheNodes,
        endpoint: (cache.CacheNodes?.[0] as any)?.CacheNodeEndpoint?.Address,
        port: (cache.CacheNodes?.[0] as any)?.CacheNodeEndpoint?.Port,
      },
      tags: {},
      createdAt: new Date(),
    }));
  }

  private async listLoadBalancers(region?: string): Promise<LoadBalancer[]> {
    const elb = new ElasticLoadBalancingV2Client({ region: region || this.defaultRegion, credentials: this.credentials });
    const response = await elb.send(new DescribeLoadBalancersCommand({}));
    return (response.LoadBalancers || []).map(lb => ({
      id: '',
      provider: 'aws',
      resourceType: 'loadbalancer' as const,
      providerResourceId: lb.LoadBalancerArn || lb.LoadBalancerName || '',
      name: lb.LoadBalancerName || '',
      region: region || this.defaultRegion,
      status: lb.State?.Code || 'unknown',
      attributes: {
        type: lb.Type || 'application',
        scheme: lb.Scheme || 'internet-facing',
        dnsName: lb.DNSName,
        vpcId: lb.VpcId as string | undefined,
        listenerCount: 0,
        targetCount: 0,
      },
      tags: {},
      createdAt: lb.CreatedTime || new Date(),
    }));
  }

  private async listVpcs(region?: string): Promise<Vpc[]> {
    const ec2 = this.ec2ForRegion(region || this.defaultRegion);
    const response = await ec2.send(new DescribeVpcsCommand({}));
    return (response.Vpcs || []).map(vpc => ({
      id: '',
      provider: 'aws',
      resourceType: 'vpc' as const,
      providerResourceId: vpc.VpcId || '',
      name: vpc.Tags?.find(t => t.Key === 'Name')?.Value || vpc.VpcId || '',
      region: region || this.defaultRegion,
      status: vpc.State || 'available',
      attributes: {
        cidrBlock: vpc.CidrBlock || '',
        subnetCount: 0,
        isDefault: vpc.IsDefault || false,
        state: vpc.State || 'available',
      },
      tags: this.convertTags(vpc.Tags),
      createdAt: new Date(),
    }));
  }

  private async listSecurityGroups(region?: string): Promise<SecurityGroup[]> {
    const ec2 = this.ec2ForRegion(region || this.defaultRegion);
    const response = await ec2.send(new DescribeSecurityGroupsCommand({}));
    return (response.SecurityGroups || []).map(sg => ({
      id: '',
      provider: 'aws',
      resourceType: 'securitygroup' as const,
      providerResourceId: sg.GroupId || '',
      name: sg.GroupName || '',
      region: region || this.defaultRegion,
      status: 'active',
      attributes: {
        vpcId: sg.VpcId,
        ruleCount: (sg.IpPermissions?.length || 0) + (sg.IpPermissionsEgress?.length || 0),
        ingressRules: sg.IpPermissions?.length || 0,
        egressRules: sg.IpPermissionsEgress?.length || 0,
        description: sg.Description,
      },
      tags: this.convertTags(sg.Tags),
      createdAt: new Date(),
    }));
  }

  private async listCdnDistributions(): Promise<CdnDistribution[]> {
    const cf = new CloudFrontClient({ region: 'us-east-1', credentials: this.credentials });
    const response = await cf.send(new ListDistributionsCommand({}));
    return (response.DistributionList?.Items || []).map(dist => ({
      id: '',
      provider: 'aws',
      resourceType: 'cdn' as const,
      providerResourceId: dist.Id || '',
      name: dist.Id || '',
      region: 'global',
      status: dist.Status || 'unknown',
      attributes: {
        domainName: dist.DomainName || '',
        originDomain: dist.Origins?.Items?.[0]?.DomainName,
        originType: dist.Origins?.Items?.[0]?.S3OriginConfig ? 's3' : 'custom',
        enabled: dist.Enabled || false,
        priceClass: dist.PriceClass,
        sslCertificate: dist.ViewerCertificate?.ACMCertificateArn,
      },
      tags: {},
      createdAt: dist.LastModifiedTime || new Date(),
    }));
  }

  private async listEksClusters(region?: string): Promise<Cluster[]> {
    const eks = new EKSClient({ region: region || this.defaultRegion, credentials: this.credentials });
    const response = await eks.send(new ListClustersCommand({}));
    const clusterNames = response.clusters || [];
    const clusters: Cluster[] = [];
    for (const name of clusterNames) {
      const detail = await eks.send(new DescribeClusterCommand({ name }));
      if (detail.cluster) {
        const c = detail.cluster;
        clusters.push({
          id: '',
          provider: 'aws',
          resourceType: 'cluster' as const,
          providerResourceId: c.name || name,
          name: c.name || name,
          region: region || this.defaultRegion,
          status: c.status || 'unknown',
          attributes: {
            clusterType: 'eks',
            kubernetesVersion: c.version || '',
            nodeCount: 0,
            status: c.status || 'unknown',
            endpoint: c.endpoint,
            vpcId: c.resourcesVpcConfig?.vpcId,
          },
          tags: {},
          createdAt: c.createdAt || new Date(),
        });
      }
    }
    return clusters;
  }
}

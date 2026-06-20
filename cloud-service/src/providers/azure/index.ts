import { ComputeManagementClient } from "@azure/arm-compute";
import { StorageManagementClient } from "@azure/arm-storage";
import { PostgreSQLManagementFlexibleServerClient } from "@azure/arm-postgresql-flexible";
import { RedisManagementClient } from "@azure/arm-rediscache";
import { NetworkManagementClient } from "@azure/arm-network";
import { CdnManagementClient } from "@azure/arm-cdn";
import { ContainerServiceClient } from "@azure/arm-containerservice";
import { CognitiveServicesManagementClient } from "@azure/arm-cognitiveservices";
import { ClientSecretCredential } from "@azure/identity";
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
  AiService,
} from "../types.js";

export interface AzureConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

interface AzureVm {
  id?: string;
  name?: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState?: string;
    hardwareProfile?: { vmSize?: string };
    networkProfile?: {
      networkInterfaces?: { id?: string; properties?: { ipConfigurations?: { properties?: { privateIPAddress?: string } }[] } }[];
    };
  };
}

const AZURE_REGIONS: Region[] = [
  { id: "eastus", name: "eastus", displayName: "East US" },
  { id: "eastus2", name: "eastus2", displayName: "East US 2" },
  { id: "westus", name: "westus", displayName: "West US" },
  { id: "westus2", name: "westus2", displayName: "West US 2" },
  { id: "westeurope", name: "westeurope", displayName: "West Europe" },
  { id: "northeurope", name: "northeurope", displayName: "North Europe" },
  { id: "southeastasia", name: "southeastasia", displayName: "Southeast Asia" },
  { id: "eastasia", name: "eastasia", displayName: "East Asia" },
  { id: "chinaeast2", name: "chinaeast2", displayName: "China East 2" },
  { id: "chinanorth2", name: "chinanorth2", displayName: "China North 2" },
];

const AZURE_IMAGES: Image[] = [
  { id: "UbuntuLTS", name: "Ubuntu Server 22.04 LTS" },
  { id: "Debian11", name: "Debian 11" },
  { id: "CentOS85", name: "CentOS 8.5" },
  { id: "Win2022Datacenter", name: "Windows Server 2022 Datacenter" },
  { id: "RHEL9", name: "Red Hat Enterprise Linux 9" },
];

export class AzureProvider implements ICloudProvider {
  readonly name = "azure";
  readonly displayName = "Microsoft Azure";

  private client: ComputeManagementClient;
  private credential: ClientSecretCredential;
  private subscriptionId: string;

  constructor(config: AzureConfig) {
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );
    this.subscriptionId = config.subscriptionId;
    this.client = new ComputeManagementClient(this.credential, this.subscriptionId);
  }

  async listInstances(_region?: string, _options?: ListOptions): Promise<Instance[]> {
    const instances: Instance[] = [];

    for await (const vm of this.client.virtualMachines.listAll()) {
      instances.push(this.mapVm(vm as AzureVm));
    }

    return instances;
  }

  async getInstance(id: string): Promise<Instance> {
    const { resourceGroupName, vmName } = this.parseResourceId(id);
    const vm = (await this.client.virtualMachines.get(
      resourceGroupName,
      vmName
    )) as AzureVm;
    return this.mapVm(vm);
  }

  async createInstance(opts: CreateInstanceOpts): Promise<Instance> {
    // Azure 需要资源组，约定使用 region 作为默认资源组名
    const resourceGroupName = opts.tags?.resourceGroup || `cloudops-${opts.region}`;
    const vmName = opts.name;

    await this.client.virtualMachines.beginCreateOrUpdateAndWait(
      resourceGroupName,
      vmName,
      {
        location: opts.region,
        hardwareProfile: { vmSize: opts.instanceType as any },
        storageProfile: {
          imageReference: this.parseImageRef(opts.imageId),
        },
        osProfile: {
          computerName: vmName,
          adminUsername: "cloudops",
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: {
              publicKeys: [{ path: "/home/cloudops/.ssh/authorized_keys", keyData: "" }],
            },
          },
        },
        networkProfile: {
          networkInterfaces: [],
        },
        tags: opts.tags,
      } as any
    );

    return this.getInstance(`/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}`);
  }

  async deleteInstance(id: string): Promise<void> {
    const { resourceGroupName, vmName } = this.parseResourceId(id);
    await this.client.virtualMachines.beginDeleteAndWait(resourceGroupName, vmName);
  }

  async startInstance(id: string): Promise<void> {
    const { resourceGroupName, vmName } = this.parseResourceId(id);
    await this.client.virtualMachines.beginStartAndWait(resourceGroupName, vmName);
  }

  async stopInstance(id: string): Promise<void> {
    const { resourceGroupName, vmName } = this.parseResourceId(id);
    // deallocate 释放计算资源不计费，更符合"关机"语义
    await this.client.virtualMachines.beginDeallocateAndWait(resourceGroupName, vmName);
  }

  async rebootInstance(id: string): Promise<void> {
    const { resourceGroupName, vmName } = this.parseResourceId(id);
    await this.client.virtualMachines.beginRestartAndWait(resourceGroupName, vmName);
  }

  async listRegions(): Promise<Region[]> {
    return AZURE_REGIONS;
  }

  async listImages(): Promise<Image[]> {
    return AZURE_IMAGES;
  }

  async listInstanceTypes(region: string): Promise<InstanceType[]> {
    const result: InstanceType[] = [];
    for await (const size of this.client.virtualMachineSizes.list(region)) {
      result.push({
        id: size.name || "",
        name: size.name || "",
        cpu: size.numberOfCores || 0,
        memoryMb: size.memoryInMB || 0,
        diskGb: size.osDiskSizeInMB ? Math.floor(size.osDiskSizeInMB / 1024) : undefined,
      });
    }
    return result;
  }

  async getMetrics(_id: string, _timeRange: TimeRange): Promise<MetricData[]> {
    // Azure Monitor 指标查询在 Phase 3 监控服务统一实现
    return [];
  }

  async getCostSummary(timeRange: TimeRange): Promise<CostSummary> {
    // Azure Cost Management 需单独 API，Phase 2 暂返回零值占位
    return {
      provider: "azure",
      totalAmount: 0,
      currency: "USD",
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      breakdown: [],
    };
  }

  private mapVm(vm: AzureVm): Instance {
    const fullId = vm.id || "";
    const vmName = vm.name || "";
    const privateIp =
      vm.properties?.networkProfile?.networkInterfaces?.[0]?.properties?.ipConfigurations?.[0]
        ?.properties?.privateIPAddress || null;

    return {
      id: fullId,
      provider: "azure",
      providerInstanceId: vmName,
      name: vmName,
      region: vm.location || "",
      status: this.mapStatus(vm.properties?.provisioningState || ""),
      spec: {
        cpu: 0,
        memoryMb: 0,
        diskGb: 0,
      },
      publicIp: null,
      privateIp,
      monthlyCost: 0,
      tags: vm.tags || {},
      lastSyncedAt: new Date(),
      createdAt: new Date(),
    };
  }

  private mapStatus(state: string): InstanceStatus {
    switch (state.toLowerCase()) {
      case "running":
      case "succeeded":
        return "running";
      case "stopped":
        return "stopped";
      case "deallocated":
        return "stopped";
      case "starting":
      case "creating":
      case "updating":
        return "pending";
      case "deleting":
        return "terminated";
      default:
        return "error";
    }
  }

  private parseResourceId(id: string): { resourceGroupName: string; vmName: string } {
    // ARM ID 格式: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}
    const match = id.match(/resourceGroups\/([^/]+)\/providers\/Microsoft\.Compute\/virtualMachines\/([^/]+)/);
    if (match) {
      return { resourceGroupName: match[1], vmName: match[2] };
    }
    // 如果传入的是 vmName，使用默认资源组
    return { resourceGroupName: "cloudops-default", vmName: id };
  }

  private parseImageRef(imageId: string): any {
    // 支持 URN 格式 publisher:offer:sku:version 或别名
    if (imageId.includes(":")) {
      const [publisher, offer, sku, version] = imageId.split(":");
      return { publisher, offer, sku, version: version || "latest" };
    }
    // 别名映射
    const aliases: Record<string, { publisher: string; offer: string; sku: string; version: string }> = {
      UbuntuLTS: { publisher: "Canonical", offer: "0001-com-ubuntu-server-jammy", sku: "22_04-lts-gen2", version: "latest" },
      Debian11: { publisher: "Debian", offer: "debian-11", sku: "11-gen2", version: "latest" },
      CentOS85: { publisher: "OpenLogic", offer: "CentOS", sku: "8_5", version: "latest" },
      Win2022Datacenter: { publisher: "MicrosoftWindowsServer", offer: "WindowsServer", sku: "2022-datacenter-g2", version: "latest" },
      RHEL9: { publisher: "RedHat", offer: "RHEL", sku: "9_2", version: "latest" },
    };
    return aliases[imageId] || aliases.UbuntuLTS;
  }

  // ===== 通用资源管理 =====

  getSupportedResourceTypes(): ResourceType[] {
    return ['instance', 'disk', 'bucket', 'database', 'cache', 'loadbalancer', 'vpc', 'securitygroup', 'cdn', 'cluster', 'aiservice'];
  }

  async listResources(resourceType: ResourceType, region?: string): Promise<CloudResource[]> {
    switch (resourceType) {
      case 'instance': return this.listInstancesAsResources(region);
      case 'disk': return this.listDisks(region);
      case 'bucket': return this.listStorageAccounts();
      case 'database': return this.listDatabases(region);
      case 'cache': return this.listCacheClusters(region);
      case 'loadbalancer': return this.listLoadBalancers(region);
      case 'vpc': return this.listVnets(region);
      case 'securitygroup': return this.listSecurityGroups(region);
      case 'cdn': return this.listCdnProfiles();
      case 'cluster': return this.listAksClusters(region);
      case 'aiservice': return this.listCognitiveServices(region);
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
      default: throw new Error(`Delete ${resourceType} not implemented for Azure`);
    }
  }

  private async listInstancesAsResources(region?: string): Promise<CloudResource[]> {
    const instances = await this.listInstances(region);
    return instances.map(i => ({
      id: i.id,
      provider: 'azure',
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
    const disks: Disk[] = [];
    for await (const disk of this.client.disks.list()) {
      if (region && disk.location !== region) continue;
      disks.push({
        id: disk.id || '',
        provider: 'azure',
        resourceType: 'disk' as const,
        providerResourceId: disk.name || '',
        name: disk.name || '',
        region: disk.location || '',
        status: disk.provisioningState || 'unknown',
        attributes: {
          sizeGb: disk.diskSizeGB || 0,
          diskType: disk.sku?.name || '',
          iops: disk.diskIopsReadWrite,
          throughput: disk.diskMBpsReadWrite,
          encrypted: !!disk.encryptionSettingsCollection,
          attachedInstanceId: disk.managedBy,
          attachmentStatus: disk.managedBy ? 'attached' : undefined,
        },
        tags: disk.tags || {},
        createdAt: disk.timeCreated || new Date(),
      });
    }
    return disks;
  }

  private async listStorageAccounts(): Promise<Bucket[]> {
    const client = new StorageManagementClient(this.credential, this.subscriptionId);
    const buckets: Bucket[] = [];
    for await (const account of client.storageAccounts.list()) {
      buckets.push({
        id: account.id || '',
        provider: 'azure',
        resourceType: 'bucket' as const,
        providerResourceId: account.name || '',
        name: account.name || '',
        region: account.location || '',
        status: account.provisioningState || 'unknown',
        attributes: {
          storageClass: account.sku?.name || 'standard',
          objectCount: 0,
          sizeBytes: 0,
          versioning: false,
          publicAccess: false,
        },
        tags: account.tags || {},
        createdAt: new Date(),
      });
    }
    return buckets;
  }

  private async listDatabases(region?: string): Promise<DatabaseInstance[]> {
    const client = new PostgreSQLManagementFlexibleServerClient(this.credential, this.subscriptionId);
    const databases: DatabaseInstance[] = [];
    for await (const server of client.servers.listBySubscription()) {
      if (region && server.location !== region) continue;
      databases.push({
        id: server.id || '',
        provider: 'azure',
        resourceType: 'database' as const,
        providerResourceId: server.name || '',
        name: server.name || '',
        region: server.location || '',
        status: server.state || 'unknown',
        attributes: {
          engine: 'postgres',
          engineVersion: server.version || '',
          instanceClass: server.sku?.name || '',
          storageGb: server.storage?.storageSizeGB || 0,
          multiAz: !!server.highAvailability && server.highAvailability.mode !== 'Disabled',
          endpoint: server.fullyQualifiedDomainName,
          port: 5432,
        },
        tags: server.tags || {},
        createdAt: new Date(),
      });
    }
    return databases;
  }

  private async listCacheClusters(region?: string): Promise<CacheInstance[]> {
    const client = new RedisManagementClient(this.credential, this.subscriptionId);
    const caches: CacheInstance[] = [];
    for await (const redis of client.redis.listBySubscription()) {
      if (region && redis.location !== region) continue;
      caches.push({
        id: redis.id || '',
        provider: 'azure',
        resourceType: 'cache' as const,
        providerResourceId: redis.name || '',
        name: redis.name || '',
        region: redis.location || '',
        status: redis.provisioningState || 'unknown',
        attributes: {
          engine: 'redis',
          engineVersion: redis.redisVersion || '',
          instanceClass: redis.sku?.name || '',
          memoryMb: 0,
          nodeType: redis.sku?.name,
          shardCount: redis.shardCount,
          endpoint: redis.hostName,
          port: redis.sslPort,
        },
        tags: redis.tags || {},
        createdAt: new Date(),
      });
    }
    return caches;
  }

  private async listLoadBalancers(region?: string): Promise<LoadBalancer[]> {
    const client = new NetworkManagementClient(this.credential, this.subscriptionId);
    const loadBalancers: LoadBalancer[] = [];
    for await (const lb of client.loadBalancers.listAll()) {
      if (region && lb.location !== region) continue;
      loadBalancers.push({
        id: lb.id || '',
        provider: 'azure',
        resourceType: 'loadbalancer' as const,
        providerResourceId: lb.name || '',
        name: lb.name || '',
        region: lb.location || '',
        status: lb.provisioningState || 'unknown',
        attributes: {
          type: lb.sku?.name || 'Basic',
          scheme: 'internet-facing',
          listenerCount: lb.loadBalancingRules?.length || 0,
          targetCount: lb.backendAddressPools?.length || 0,
        },
        tags: lb.tags || {},
        createdAt: new Date(),
      });
    }
    return loadBalancers;
  }

  private async listVnets(region?: string): Promise<Vpc[]> {
    const client = new NetworkManagementClient(this.credential, this.subscriptionId);
    const vnets: Vpc[] = [];
    for await (const vnet of client.virtualNetworks.listAll()) {
      if (region && vnet.location !== region) continue;
      vnets.push({
        id: vnet.id || '',
        provider: 'azure',
        resourceType: 'vpc' as const,
        providerResourceId: vnet.name || '',
        name: vnet.name || '',
        region: vnet.location || '',
        status: vnet.provisioningState || 'unknown',
        attributes: {
          cidrBlock: vnet.addressSpace?.addressPrefixes?.[0] || '',
          subnetCount: vnet.subnets?.length || 0,
          isDefault: false,
          state: vnet.provisioningState || 'unknown',
        },
        tags: vnet.tags || {},
        createdAt: new Date(),
      });
    }
    return vnets;
  }

  private async listSecurityGroups(region?: string): Promise<SecurityGroup[]> {
    const client = new NetworkManagementClient(this.credential, this.subscriptionId);
    const groups: SecurityGroup[] = [];
    for await (const nsg of client.networkSecurityGroups.listAll()) {
      if (region && nsg.location !== region) continue;
      const rules = nsg.securityRules || [];
      const ingress = rules.filter(r => r.direction === 'Inbound').length;
      const egress = rules.filter(r => r.direction === 'Outbound').length;
      groups.push({
        id: nsg.id || '',
        provider: 'azure',
        resourceType: 'securitygroup' as const,
        providerResourceId: nsg.name || '',
        name: nsg.name || '',
        region: nsg.location || '',
        status: nsg.provisioningState || 'unknown',
        attributes: {
          ruleCount: rules.length,
          ingressRules: ingress,
          egressRules: egress,
        },
        tags: nsg.tags || {},
        createdAt: new Date(),
      });
    }
    return groups;
  }

  private async listCdnProfiles(): Promise<CdnDistribution[]> {
    const client = new CdnManagementClient(this.credential, this.subscriptionId);
    const profiles: CdnDistribution[] = [];
    for await (const profile of client.profiles.list()) {
      profiles.push({
        id: profile.id || '',
        provider: 'azure',
        resourceType: 'cdn' as const,
        providerResourceId: profile.name || '',
        name: profile.name || '',
        region: profile.location || 'global',
        status: profile.resourceState || 'unknown',
        attributes: {
          domainName: '',
          originType: profile.sku?.name || 'Standard',
          enabled: true,
        },
        tags: profile.tags || {},
        createdAt: new Date(),
      });
    }
    return profiles;
  }

  private async listAksClusters(region?: string): Promise<Cluster[]> {
    const client = new ContainerServiceClient(this.credential, this.subscriptionId);
    const clusters: Cluster[] = [];
    for await (const cluster of client.managedClusters.list()) {
      if (region && cluster.location !== region) continue;
      clusters.push({
        id: cluster.id || '',
        provider: 'azure',
        resourceType: 'cluster' as const,
        providerResourceId: cluster.name || '',
        name: cluster.name || '',
        region: cluster.location || '',
        status: cluster.provisioningState || 'unknown',
        attributes: {
          clusterType: 'aks',
          kubernetesVersion: cluster.kubernetesVersion || '',
          nodeCount: cluster.agentPoolProfiles?.reduce((sum, p) => sum + (p.count || 0), 0) || 0,
          status: cluster.provisioningState || 'unknown',
          endpoint: cluster.fqdn,
        },
        tags: cluster.tags || {},
        createdAt: new Date(),
      });
    }
    return clusters;
  }

  /** Azure CognitiveServices 资源（AI 服务） */
  private async listCognitiveServices(region?: string): Promise<AiService[]> {
    const client = new CognitiveServicesManagementClient(this.credential, this.subscriptionId);
    const services: AiService[] = [];
    for await (const account of client.accounts.list()) {
      if (region && account.location !== region) continue;
      services.push({
        id: account.id || '',
        provider: 'azure',
        resourceType: 'aiservice' as const,
        providerResourceId: account.name || '',
        name: account.name || '',
        region: account.location || '',
        status: account.properties?.provisioningState || 'unknown',
        attributes: {
          serviceKind: 'cognitiveServices',
          skuName: account.sku?.name,
          endpoint: account.properties?.endpoint,
          kind: account.kind,
          provisioningState: account.properties?.provisioningState,
        },
        tags: account.tags || {},
        createdAt: new Date(),
      });
    }
    return services;
  }
}

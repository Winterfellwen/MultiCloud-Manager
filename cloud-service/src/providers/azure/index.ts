import { ComputeManagementClient } from "@azure/arm-compute";
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
}

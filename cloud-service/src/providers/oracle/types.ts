// cloud-service/src/providers/oracle/types.ts

export interface OracleConfig {
  userOcid: string;         // OCID of the user
  tenancyOcid: string;      // OCID of the tenancy
  compartmentOcid: string;  // OCID of the compartment
  fingerprint: string;      // Fingerprint of the API key
  region: string;           // Oracle Cloud region (e.g., us-ashburn-1, ap-tokyo-1)
  privateKey: string;       // Private key in PEM format
}

// ===== OCI API Types =====

export interface OCIInstance {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  shape: string;
  availabilityDomain: string;
  compartmentId: string;
  timeCreated: string;
  agentConfig?: {
    isMonitoringDisabled?: boolean;
    isManagementDisabled?: boolean;
  };
}

export interface OCIBlockVolume {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  availabilityDomain: string;
  compartmentId: string;
  sizeInGBs: number;
  volumeGroupId?: string;
  timeCreated: string;
}

export interface OCIVCN {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  cidrBlock: string;
  defaultRouteTableId?: string;
  defaultSecurityListId?: string;
  timeCreated: string;
}

export interface OCISubnet {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  vcnId: string;
  cidrBlock: string;
  routeTableId?: string;
  securityListIds?: string[];
  timeCreated: string;
}

export interface OCIDBSystem {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  dbHomeId?: string;
  databaseId?: string;
  cpuCoreCount?: number;
  memorySizeInGBs?: number;
  shape?: string;
  timeCreated: string;
}

export interface OCIAutonomousDatabase {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  dbName?: string;
  dbWorkload?: string;
  cpuCoreCount?: number;
  storageSizeInTBs?: number;
  infrastructureType?: string;
  timeCreated: string;
}

export interface OCILoadBalancer {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  shapeName?: string;
  shapeMinBandwidthMbps?: number;
  shapeMaxBandwidthMbps?: number;
  ipAddresses?: Array<{
    public?: { ipAddress?: string };
    private?: { ipAddress?: string };
  }>;
  timeCreated: string;
}

export interface OCIBucket {
  id: string;
  name: string;
  namespace: string;
  region: string;
  compartmentId: string;
  lifecycleState: string;
  storageTier?: string;
  approximateCount?: number;
  approximateSizeInBytes?: number;
  timeCreated: string;
}

export interface OCIOKECluster {
  id: string;
  name: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  kubernetesVersion?: string;
  vcnId?: string;
  endpointIp?: string;
  timeCreated: string;
}

export interface OCIFunction {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  applicationId?: string;
  invokeEndpoint?: string;
  timeCreated: string;
}

export interface OCIZone {
  id: string;
  name: string;
  zoneType: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  timeCreated: string;
}

export interface OCICertificate {
  id: string;
  displayName: string;
  lifecycleState: string;
  region: string;
  compartmentId: string;
  issuerCertificateChain?: string;
  timeCreated: string;
}

// ===== API Response Types =====

export interface OCIListResponse<T> {
  data: T[];
}

export interface OCIError {
  code: string;
  message: string;
}

// ===== Region Mapping =====

export const OCI_REGIONS: { id: string; name: string }[] = [
  { id: 'us-ashburn-1', name: 'Ashburn (US East)' },
  { id: 'us-phoenix-1', name: 'Phoenix (US West)' },
  { id: 'eu-frankfurt-1', name: 'Frankfurt (EU Central)' },
  { id: 'eu-amsterdam-1', name: 'Amsterdam (EU West)' },
  { id: 'uk-london-1', name: 'London (UK)' },
  { id: 'ap-tokyo-1', name: 'Tokyo (Japan)' },
  { id: 'ap-seoul-1', name: 'Seoul (Korea)' },
  { id: 'ap-singapore-1', name: 'Singapore (Asia Pacific)' },
  { id: 'ap-mumbai-1', name: 'Mumbai (India)' },
  { id: 'ap-sydney-1', name: 'Sydney (Australia)' },
  { id: 'ca-toronto-1', name: 'Toronto (Canada)' },
  { id: 'sa-saopaulo-1', name: 'Sao Paulo (Brazil)' },
];

// ===== Instance Type Mapping =====

export const OCI_SHAPE_SPECS: Record<string, { cpu: number; memoryMb: number }> = {
  'VM.Standard2.1': { cpu: 1, memoryMb: 15360 },
  'VM.Standard2.2': { cpu: 2, memoryMb: 30720 },
  'VM.Standard2.4': { cpu: 4, memoryMb: 61440 },
  'VM.Standard2.8': { cpu: 8, memoryMb: 122880 },
  'VM.Standard2.16': { cpu: 16, memoryMb: 245760 },
  'VM.Standard2.24': { cpu: 24, memoryMb: 368640 },
  'VM.Standard.E3.Flex': { cpu: 1, memoryMb: 16384 },
  'VM.Standard.E4.Flex': { cpu: 1, memoryMb: 16384 },
  'BM.Standard2.52': { cpu: 52, memoryMb: 768000 },
  'BM.Standard.E2.64': { cpu: 64, memoryMb: 512000 },
  'BM.GPU4.8': { cpu: 52, memoryMb: 768000 },
  'VM.GPU3.1': { cpu: 6, memoryMb: 90000 },
};

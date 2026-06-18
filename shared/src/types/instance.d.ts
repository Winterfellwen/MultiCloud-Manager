export type InstanceStatus = 'running' | 'stopped' | 'terminated' | 'pending' | 'error';
export interface InstanceSpec {
    cpu: number;
    memoryMb: number;
    diskGb: number;
}
export interface Instance {
    id: string;
    provider: string;
    providerInstanceId: string;
    name: string;
    region: string;
    status: InstanceStatus;
    spec: InstanceSpec;
    publicIp: string | null;
    privateIp: string | null;
    monthlyCost: number;
    tags: Record<string, string>;
    lastSyncedAt: Date;
    createdAt: Date;
}
export interface CreateInstanceInput {
    provider: string;
    region: string;
    name: string;
    imageId: string;
    instanceType: string;
    subnetId?: string;
    securityGroupIds?: string[];
    tags?: Record<string, string>;
}
export interface CloudProvider {
    readonly name: string;
    readonly displayName: string;
    listInstances(region?: string): Promise<Instance[]>;
    getInstance(id: string): Promise<Instance>;
    createInstance(input: CreateInstanceInput): Promise<Instance>;
    deleteInstance(id: string): Promise<void>;
    startInstance(id: string): Promise<void>;
    stopInstance(id: string): Promise<void>;
    rebootInstance(id: string): Promise<void>;
}
//# sourceMappingURL=instance.d.ts.map
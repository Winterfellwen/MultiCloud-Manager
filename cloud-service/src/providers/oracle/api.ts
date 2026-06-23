// cloud-service/src/providers/oracle/api.ts
import * as crypto from 'crypto';
import type {
  OracleConfig,
  OCIInstance,
  OCIBlockVolume,
  OCIVCN,
  OCISubnet,
  OCIDBSystem,
  OCIAutonomousDatabase,
  OCILoadBalancer,
  OCIBucket,
  OCIOKECluster,
  OCIFunction,
  OCIZone,
  OCICertificate,
} from './types.js';

export class OCIAPIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(`OCI API Error ${status} (${code}): ${message}`);
    this.name = 'OCIAPIError';
  }
}

// ===== Service Endpoints =====

const OCI_ENDPOINTS: Record<string, string> = {
  compute: 'iaas',
  objectstorage: 'objectstorage',
  oke: 'oke',
  functions: 'functions',
  dns: 'dns',
  certs: 'certs',
  loadbalancer: 'loadbalancer',
  database: 'database',
};

function getEndpoint(service: string, region: string): string {
  const prefix = OCI_ENDPOINTS[service] || service;
  if (service === 'objectstorage') {
    return `https://objectstorage.${region}.oraclecloud.com`;
  }
  if (service === 'oke') {
    return `https://oke.${region}.oraclecloud.com`;
  }
  if (service === 'functions') {
    return `https://functions.${region}.oraclecloud.com`;
  }
  if (service === 'dns') {
    return `https://dns.${region}.oraclecloud.com`;
  }
  if (service === 'certs') {
    return `https://certs.${region}.oraclecloud.com`;
  }
  return `https://iaas.${region}.oraclecloud.com`;
}

// ===== OCI Request Signer =====

export class OCISigner {
  private privateKey: crypto.KeyObject;
  readonly keyId: string;

  constructor(config: OracleConfig) {
    this.privateKey = crypto.createPrivateKey({
      key: config.privateKey,
      format: 'pem',
    });
    // keyId format: {tenancy}/{user}/{fingerprint}
    this.keyId = `${config.tenancyOcid}/${config.userOcid}/${config.fingerprint}`;
  }

  /**
   * Generate the OCI request signature per v1 spec.
   * Headers to sign: (request-target), date, host, x-content-sha256
   */
  sign(method: string, path: string, host: string, body: string | null): string {
    const date = new Date().toUTCString();
    const contentSha256 = body
      ? crypto.createHash('sha256').update(body).digest('base64')
      : crypto.createHash('sha256').update('').digest('base64');

    // Signing string format:
    // (request-target): POST /v1/compartments/ocid1.compartment.oc1.../instances\n
    // date: Mon, 01 Jan 2024 00:00:00 GMT\n
    // host: iaas.us-ashburn-1.oraclecloud.com\n
    // x-content-sha256: base64-encoded-sha256\n
    // [body only if POST/PUT/PATCH]
    const signingString = [
      `(request-target): ${method.toLowerCase()} ${path}`,
      `date: ${date}`,
      `host: ${host}`,
      `x-content-sha256: ${contentSha256}`,
    ].join('\n');

    // Sign with RSA-SHA256
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingString);
    sign.end();
    const signature = sign.sign(this.privateKey, 'base64');

    return `Signature version="1",keyId="${this.keyId}",algorithm="rsa-sha256",headers="(request-target) date host x-content-sha256",signature="${signature}"`;
  }
}

// ===== OCI API Client =====

export class OCIClient {
  private signer: OCISigner;
  private region: string;
  private compartmentOcid: string;

  constructor(config: OracleConfig) {
    this.signer = new OCISigner(config);
    this.region = config.region;
    this.compartmentOcid = config.compartmentOcid;
  }

  async request<T>(
    service: string,
    method: string,
    path: string,
    body: string | null = null,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const endpoint = getEndpoint(service, this.region);
    const url = new URL(`${endpoint}${path}`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    const host = url.host;
    const actualPath = `${url.pathname}${url.search}`;

    const headers: Record<string, string> = {
      'Date': new Date().toUTCString(),
      'Content-Type': 'application/json',
      'Host': host,
      'x-content-sha256': body
        ? crypto.createHash('sha256').update(body).digest('base64')
        : crypto.createHash('sha256').update('').digest('base64'),
    };

    const authorization = this.signer.sign(method, actualPath, host, body);
    headers['Authorization'] = authorization;

    const res = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    if (!res.ok) {
      let errMsg = res.statusText;
      try {
        const errBody = await res.json() as { message?: string; code?: string };
        errMsg = errBody.message || errBody.code || errMsg;
      } catch { /* ignore */ }
      throw new OCIAPIError(res.status, 'OCI_ERROR', errMsg);
    }

    // Handle empty responses (204 No Content)
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  // ===== Compute Instances =====

  async listInstances(): Promise<OCIInstance[]> {
    const data = await this.request<{ items: OCIInstance[] }>(
      'compute',
      'GET',
      `/20160918/instances`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getInstance(id: string): Promise<OCIInstance> {
    return this.request<OCIInstance>(
      'compute',
      'GET',
      `/20160918/instances/${id}`
    );
  }

  async listShapes(): Promise<Array<{ shape: string; ocpu: number; memoryInGBs: number }>> {
    const data = await this.request<{ items: Array<{ shape: string; ocpu: number; memoryInGBs: number }> }>(
      'compute',
      'GET',
      `/20160918/shapes`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async listImages(): Promise<Array<{ id: string; displayName: string; operatingSystem: string }>> {
    const data = await this.request<{ items: Array<{ id: string; displayName: string; operatingSystem: string }> }>(
      'compute',
      'GET',
      `/20160918/images`,
      null,
      { compartmentId: this.compartmentOcid,
        operatingSystem: 'Oracle Linux',
        status: 'AVAILABLE' }
    );
    return data.items || [];
  }

  // ===== Block Volumes =====

  async listBlockVolumes(): Promise<OCIBlockVolume[]> {
    const data = await this.request<{ items: OCIBlockVolume[] }>(
      'compute',
      'GET',
      `/20160918/volumeAttachments`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    // Get standalone volumes too
    const volumes = await this.request<{ items: OCIBlockVolume[] }>(
      'compute',
      'GET',
      `/20160918/volumes`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return volumes.items || [];
  }

  async getBlockVolume(id: string): Promise<OCIBlockVolume> {
    return this.request<OCIBlockVolume>(
      'compute',
      'GET',
      `/20160918/volumes/${id}`
    );
  }

  // ===== VCN / Networking =====

  async listVCNs(): Promise<OCIVCN[]> {
    const data = await this.request<{ items: OCIVCN[] }>(
      'compute',
      'GET',
      `/20160918/vcns`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getVCN(id: string): Promise<OCIVCN> {
    return this.request<OCIVCN>(
      'compute',
      'GET',
      `/20160918/vcns/${id}`
    );
  }

  async listSubnets(): Promise<OCISubnet[]> {
    const data = await this.request<{ items: OCISubnet[] }>(
      'compute',
      'GET',
      `/20160918/subnets`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getSubnet(id: string): Promise<OCISubnet> {
    return this.request<OCISubnet>(
      'compute',
      'GET',
      `/20160918/subnets/${id}`
    );
  }

  async listLoadBalancers(): Promise<OCILoadBalancer[]> {
    const data = await this.request<{ items: OCILoadBalancer[] }>(
      'loadbalancer',
      'GET',
      `/20170115/loadBalancers`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getLoadBalancer(id: string): Promise<OCILoadBalancer> {
    return this.request<OCILoadBalancer>(
      'loadbalancer',
      'GET',
      `/20170115/loadBalancers/${id}`
    );
  }

  // ===== Database =====

  async listDBSystems(): Promise<OCIDBSystem[]> {
    const data = await this.request<{ items: OCIDBSystem[] }>(
      'database',
      'GET',
      `/20160918/dbSystems`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getDBSystem(id: string): Promise<OCIDBSystem> {
    return this.request<OCIDBSystem>(
      'database',
      'GET',
      `/20160918/dbSystems/${id}`
    );
  }

  async listAutonomousDatabases(): Promise<OCIAutonomousDatabase[]> {
    const data = await this.request<{ items: OCIAutonomousDatabase[] }>(
      'database',
      'GET',
      `/20160918/autonomousDatabases`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getAutonomousDatabase(id: string): Promise<OCIAutonomousDatabase> {
    return this.request<OCIAutonomousDatabase>(
      'database',
      'GET',
      `/20160918/autonomousDatabases/${id}`
    );
  }

  // ===== Object Storage =====

  async getObjectStorageNamespace(): Promise<string> {
    const data = await this.request<{ namespace: string }>(
      'objectstorage',
      'GET',
      `/n/`
    );
    return data.namespace;
  }

  async listBuckets(): Promise<OCIBucket[]> {
    const namespace = await this.getObjectStorageNamespace();
    const data = await this.request<{ items: OCIBucket[] }>(
      'objectstorage',
      'GET',
      `/n/${namespace}/b`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getBucket(namespace: string, name: string): Promise<OCIBucket> {
    return this.request<OCIBucket>(
      'objectstorage',
      'GET',
      `/n/${namespace}/b/${name}`
    );
  }

  // ===== OKE Clusters =====

  async listOKEClusters(): Promise<OCIOKECluster[]> {
    const data = await this.request<{ items: OCIOKECluster[] }>(
      'oke',
      'GET',
      `/20180222/clusters`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getOKECluster(id: string): Promise<OCIOKECluster> {
    return this.request<OCIOKECluster>(
      'oke',
      'GET',
      `/20180222/clusters/${id}`
    );
  }

  // ===== Functions =====

  async listApplications(): Promise<Array<{ id: string; displayName: string; compartmentId: string; timeCreated: string }>> {
    const data = await this.request<{ items: Array<{ id: string; displayName: string; compartmentId: string; timeCreated: string }> }>(
      'functions',
      'GET',
      `/20181201/applications`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async listFunctions(): Promise<OCIFunction[]> {
    const apps = await this.listApplications();
    const functions: OCIFunction[] = [];
    for (const app of apps) {
      const data = await this.request<{ items: OCIFunction[] }>(
        'functions',
        'GET',
        `/20181201/functions`,
        null,
        { applicationId: app.id }
      );
      if (data.items) {
        for (const fn of data.items) {
          fn.region = this.region;
          fn.compartmentId = app.compartmentId;
          functions.push(fn);
        }
      }
    }
    return functions;
  }

  // ===== DNS =====

  async listZones(): Promise<OCIZone[]> {
    const data = await this.request<{ items: OCIZone[] }>(
      'dns',
      'GET',
      `/20180115/zones`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getZone(id: string): Promise<OCIZone> {
    return this.request<OCIZone>(
      'dns',
      'GET',
      `/20180115/zones/${id}`
    );
  }

  // ===== Certificates =====

  async listCertificates(): Promise<OCICertificate[]> {
    const data = await this.request<{ items: OCICertificate[] }>(
      'certs',
      'GET',
      `/20210224/certificates`,
      null,
      { compartmentId: this.compartmentOcid }
    );
    return data.items || [];
  }

  async getCertificate(id: string): Promise<OCICertificate> {
    return this.request<OCICertificate>(
      'certs',
      'GET',
      `/20210224/certificates/${id}`
    );
  }

  // ===== Region =====

  getRegion(): string {
    return this.region;
  }
}

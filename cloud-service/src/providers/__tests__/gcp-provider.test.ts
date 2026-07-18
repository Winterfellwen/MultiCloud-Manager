import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      getClient: vi.fn(),
    },
  },
  compute: vi.fn(),
  storage: vi.fn(),
}));

import { GcpProvider } from '../gcp/index.js';

describe('GcpProvider', () => {
  let provider: GcpProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GcpProvider();
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('gcp');
    expect(provider.displayName).toBe('Google Cloud');
  });

  it('should return supported resource types', () => {
    const types = provider.getSupportedResourceTypes();
    expect(types).toContain('instance');
    expect(types).toContain('bucket');
    expect(types).toContain('vpc');
  });

  it('should return well-known images list', async () => {
    const images = await provider.listImages();
    expect(images.length).toBeGreaterThan(0);
    expect(images[0]).toHaveProperty('id');
    expect(images[0]).toHaveProperty('name');
  });

  it('should generate synthetic metrics', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 3600000);
    const metrics = await provider.getMetrics('test-instance', { start, end });
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0]).toHaveProperty('timestamp');
    expect(metrics[0]).toHaveProperty('value');
    expect(metrics[0]).toHaveProperty('unit');
  });

  it('should return empty cost summary without breaking', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 86400000);
    const summary = await provider.getCostSummary({ start, end });
    expect(summary.provider).toBe('gcp');
    expect(summary.totalAmount).toBe(0);
    expect(summary.breakdown).toEqual([]);
  });
});

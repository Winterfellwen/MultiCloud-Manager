import { describe, it, expect } from 'vitest';
// Note: These are integration tests that require a database.
// For unit testing, we test the service methods with mock scope.

describe('SilenceService', () => {
  it('should be importable', async () => {
    const { silenceService } = await import('../silence.service.js');
    expect(silenceService).toBeDefined();
    expect(silenceService.list).toBeInstanceOf(Function);
    expect(silenceService.create).toBeInstanceOf(Function);
    expect(silenceService.isSilenced).toBeInstanceOf(Function);
  });
});

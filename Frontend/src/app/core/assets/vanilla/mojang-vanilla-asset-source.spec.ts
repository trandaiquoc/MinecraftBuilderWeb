import { describe, expect, it } from 'vitest';
import { MojangVersionService } from './mojang-vanilla-asset-source';

describe('MojangVersionService', () => {
  it('exposes release loading state as read-only signals', () => {
    const versions = new MojangVersionService();

    for (const state of [versions.releases, versions.loading]) {
      expect(state).not.toHaveProperty('set');
      expect(state).not.toHaveProperty('update');
    }
  });
});

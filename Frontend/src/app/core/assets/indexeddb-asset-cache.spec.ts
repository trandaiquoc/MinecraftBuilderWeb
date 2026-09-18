import { describe, expect, it } from 'vitest';
import { migrateCachedVanillaAssets } from './indexeddb-asset-cache';

const legacy = {
  schemaVersion: 1,
  minecraftVersion: '1.21.1' as const,
  sourceName: 'client.jar',
  json: { 'assets/minecraft/blockstates/stone.json': { variants: {} } },
  binary: [{ path: 'assets/minecraft/textures/block/stone.png', data: new ArrayBuffer(4) }],
};

describe('vanilla asset cache migration', () => {
  it('upgrades v1 metadata without dropping the resource payload', () => {
    const migrated = migrateCachedVanillaAssets(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.json).toBe(legacy.json);
    expect(migrated.binary).toBe(legacy.binary);
  });

  it('rejects an unsupported cache without presenting it as ready', () => {
    expect(() => migrateCachedVanillaAssets({ ...legacy, schemaVersion: 99 })).toThrow('schema is unsupported');
  });
});

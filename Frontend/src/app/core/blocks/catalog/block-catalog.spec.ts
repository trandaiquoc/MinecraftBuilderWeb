import { describe, expect, it } from 'vitest';
import { BlockCatalog, normalizeSearchText } from './block-catalog';
import { representativeBlockFixture } from './block-catalog.fixture';

describe('BlockCatalog', () => {
  it('loads resource-derived entries and exposes namespace/default state', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    expect(catalog.get('minecraft:oak_stairs')?.namespace).toBe('minecraft');
    expect(catalog.get('minecraft:oak_stairs')?.defaultState['facing']).toBe('north');
  });

  it('searches normalized display name, ID, namespace and mod name', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    expect(catalog.search('OAK STAIRS')).toHaveLength(1);
    expect(catalog.search('example')).toHaveLength(1);
    expect(catalog.search('  MISSING_RENDERER ')).toHaveLength(1);
    expect(normalizeSearchText('Tiếng Việt')).toBe('tieng viet');
  });

  it('rejects unsupported versions and duplicate IDs', () => {
    const catalog = new BlockCatalog();
    expect(() => catalog.load({ ...representativeBlockFixture, minecraftVersion: '1.20.6' as '1.21.1' })).toThrow('Unsupported Minecraft version');
    expect(() => catalog.load({ ...representativeBlockFixture, blocks: [...representativeBlockFixture.blocks, representativeBlockFixture.blocks[0]] })).toThrow('Duplicate block ID');
  });
});

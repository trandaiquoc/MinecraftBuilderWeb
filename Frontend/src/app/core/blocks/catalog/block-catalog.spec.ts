import { describe, expect, it } from 'vitest';
import { BlockCatalog, normalizeSearchText } from './block-catalog';
import { representativeBlockFixture } from './block-catalog.fixture';
import { blockCapability, hasBlockCapability } from '../capabilities/block-capability-resolver';
import { buildPlaceableItems } from '../placement-palette/placeable-item';
import { ActiveBlockService } from '../placement-palette/active-block.service';
import { BlockLibraryService } from './block-library.service';

describe('BlockCatalog', () => {
  it('loads resource-derived entries and exposes namespace/default state', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    expect(catalog.get('minecraft:oak_stairs')?.namespace).toBe('minecraft');
    expect(catalog.get('minecraft:oak_stairs')?.defaultState['facing']).toBe('north');
  });

  it('normalizes orthogonal capabilities without inventing behavior for unknown content', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    const stairs = catalog.get('minecraft:oak_stairs');
    const door = catalog.get('minecraft:oak_door');
    const example = catalog.get('example:missing_renderer');
    expect(hasBlockCapability(stairs, 'directional')).toBe(true);
    expect(hasBlockCapability(stairs, 'neighbor-dependent')).toBe(true);
    expect(hasBlockCapability(stairs, 'waterloggable')).toBe(true);
    expect(blockCapability(door, 'multi-block')).toMatchObject({ mode: 'double-height', evidence: 'verified' });
    expect(hasBlockCapability(catalog.get('minecraft:red_bed'), 'special-renderer')).toBe(true);
    expect(hasBlockCapability(catalog.get('minecraft:red_bed'), 'directional')).toBe(true);
    expect(example?.capabilities).toEqual([]);
  });

  it('keeps item-backed capability at the item boundary', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    const bed = buildPlaceableItems(catalog.all()).find((item) => item.itemId === 'minecraft:red_bed');
    expect(hasBlockCapability(bed?.capabilities, 'item-backed')).toBe(true);
    expect(hasBlockCapability(catalog.get('minecraft:red_bed'), 'item-backed')).toBe(false);
  });

  it('normalizes verified semantic supplements into the block definition', () => {
    const catalog = new BlockCatalog();
    catalog.load({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{
      id: 'example:display', displayName: 'Display', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full',
      capabilities: [{ kind: 'item-storage-display', slotCount: 1, evidence: 'verified' }], supportContracts: ['decorative-support'],
    }] });
    const definition = catalog.get('example:display');
    expect(hasBlockCapability(definition, 'item-storage-display')).toBe(true);
    expect(definition?.supportContracts).toEqual(['decorative-support']);
    expect(hasBlockCapability(catalog.get('example:lookalike'), 'item-storage-display')).toBe(false);
  });

  it('searches normalized display name, ID, namespace and mod name', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    expect(catalog.search('OAK STAIRS')).toHaveLength(1);
    expect(catalog.search('example')).toHaveLength(1);
    expect(catalog.search('  MISSING_RENDERER ')).toHaveLength(1);
    expect(normalizeSearchText('Tiếng Việt')).toBe('tieng viet');
  });

  it('accepts versioned sources and rejects duplicate IDs', () => {
    const catalog = new BlockCatalog();
    expect(() => catalog.load({ ...representativeBlockFixture, minecraftVersion: '1.20.6' })).not.toThrow();
    expect(() => catalog.load({ ...representativeBlockFixture, blocks: [...representativeBlockFixture.blocks, representativeBlockFixture.blocks[0]] })).toThrow('Duplicate block ID');
  });

  it('invalidates an active block when its source is removed without touching project data', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    const source = {
      minecraftVersion: '1.21.1' as const,
      sourceId: 'example',
      sourceName: 'Example',
      blocks: [{ id: 'example:machine', displayName: 'Machine', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full' as const, sourceId: 'example' }],
    };
    library.replaceSource(source);
    active.select(library.get('example:machine')!);
    expect(active.active()?.sourceId).toBe('example');
    library.removeSource('example');
    expect(active.active()).toBeUndefined();
  });

  it('passes independent target item evidence into the placeable library', () => {
    const library = new BlockLibraryService(new ActiveBlockService());
    library.replaceSource({
      minecraftVersion: '26.3', sourceId: 'vanilla-26.3', sourceName: 'Vanilla 26.3', itemEvidenceAvailable: true,
      blocks: [
        { id: 'minecraft:water', displayName: 'Water', defaultState: { level: '0' }, stateDefinitions: [{ name: 'level', values: ['0', '1'] }], resources: { textures: [] }, support: 'partial' },
        { id: 'minecraft:lava', displayName: 'Lava', defaultState: { level: '0' }, stateDefinitions: [{ name: 'level', values: ['0', '1'] }], resources: { textures: [] }, support: 'partial' },
      ],
      targetItems: [
        { itemId: 'minecraft:water_bucket', referencedModels: [], referencedResources: [], sourceFormat: 'modern-item-definition' },
        { itemId: 'minecraft:lava_bucket', referencedModels: [], referencedResources: [], sourceFormat: 'modern-item-definition' },
      ],
    });
    expect(library.allItems().map((item) => item.itemId)).toEqual(['minecraft:lava_bucket', 'minecraft:water_bucket']);
  });
});

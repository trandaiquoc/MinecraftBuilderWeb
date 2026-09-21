import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditContentDomains, auditPaletteLeaks, auditVanillaAssets, classifyVisualSupport, coverageReportMarkdown } from './vanilla-asset-audit';
import { VanillaAssetProvider } from './vanilla-asset-provider';

describe('vanilla asset coverage audit', () => {
  beforeEach(() => { Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => `blob:${blob.size}`) }); });

  it('classifies Real, Partial and Fallback independently from behavior support', async () => {
    const report = await auditVanillaAssets(fixtureProvider(), { decodeTexture: async () => true, batchSize: 2 });
    const stone = find(report, 'minecraft:stone');
    const custom = find(report, 'example:custom');
    const missing = find(report, 'example:missing');
    expect(stone.render.visualSupport).toBe('real'); expect(stone.catalog.behaviorSupport).toBe('full'); expect(stone.thumbnail).toBe('real');
    expect(custom.render.visualSupport).toBe('real'); expect(custom.catalog.behaviorSupport).toBe('unknown'); expect(custom.render.reasons).not.toContain('DEFAULT_STATE_UNKNOWN');
    expect(missing.render.visualSupport).toBe('fallback'); expect(missing.render.reasons).toContain('BLOCKSTATE_PARSE_FAILED'); expect(missing.thumbnail).toBe('unavailable');
  });

  it('reports unknown defaults, missing textures, decode failures and thumbnail fallback', async () => {
    const report = await auditVanillaAssets(fixtureProvider(false), { decodeTexture: async () => false });
    const stone = find(report, 'minecraft:stone');
    const unresolved = find(report, 'example:unresolved_texture');
    expect(stone.render.reasons).toContain('TEXTURE_NOT_FOUND');
    expect(unresolved.thumbnail).toBe('fallback');
    expect(report.summary.defaultState.unknown).toBeGreaterThan(0);
  });

  it('produces deterministic report summaries and human-readable output', async () => {
    const report = await auditVanillaAssets(fixtureProvider(), { decodeTexture: async () => true });
    expect(report.summary.totalEntries).toBe(4);
    expect(report.summary.visual.real + report.summary.visual.partial + report.summary.visual.fallback).toBe(4);
    expect(coverageReportMarkdown(report)).toContain('Remaining Follow-ups');
  });

  it('classifies a geometry build failure as visual Fallback', () => {
    expect(classifyVisualSupport({ renderMode: 'real', defaultKnown: true, specialModel: false, texturesDecoded: true, geometryBuilt: false })).toBe('fallback');
  });

  it('detects each invalid palette domain from real world/item evidence', () => {
    const block = (id: string) => ({ id, namespace: id.split(':')[0], displayName: id, defaultState: {}, stateDefinitions: [], resources: { textures: [] }, behaviorSupport: 'unknown' as const, visualSupport: 'fallback' as const, visualClassification: 'standard-json' as const, defaultStateSource: 'unknown' as const, support: 'fallback' as const });
    const item = (itemId: string, displayBlockId: string, concreteBlockIds: readonly string[]) => ({ itemId, displayBlockId, namespace: itemId.split(':')[0], displayName: itemId, defaultState: {}, concreteBlockIds, placementKind: 'direct' as const, previewRecipe: 'single' as const, support: 'fallback' as const, visualSupport: 'fallback' as const, capabilities: [] as const, previewBlocks: [] as const });
    const definitions = [block('minecraft:stone'), block('minecraft:potted_torchflower'), block('minecraft:light'), block('minecraft:item_frame')];
    const result = auditPaletteLeaks([
      item('minecraft:item_frame', 'minecraft:item_frame', ['minecraft:item_frame']),
      item('minecraft:potted_torchflower', 'minecraft:potted_torchflower', ['minecraft:potted_torchflower']),
      item('minecraft:light', 'minecraft:light', ['minecraft:light']),
      item('example:missing', 'example:missing', ['example:missing']),
    ], definitions, [{ itemId: 'minecraft:item_frame', referencedModels: [], referencedResources: [], sourceFormat: 'modern-item-definition' }], true);
    expect(result).toEqual(expect.arrayContaining([
      { itemId: 'minecraft:item_frame', code: 'ENTITY_IN_BLOCK_PALETTE' },
      { itemId: 'minecraft:potted_torchflower', code: 'INTERNAL_BLOCK_IN_PALETTE' },
      { itemId: 'minecraft:light', code: 'TECHNICAL_BLOCK_IN_PALETTE' },
      { itemId: 'example:missing', code: 'ITEM_ONLY_IN_BLOCK_PALETTE' },
    ]));
  });
  it('audits content domains separately from visual block coverage', () => {
    const provider = new VanillaAssetProvider('target.jar', '26.3', {
      'assets/minecraft/items/item_frame.json': { model: { type: 'minecraft:model', model: 'minecraft:item/item_frame' } },
      'assets/minecraft/items/test_item.json': { model: { type: 'minecraft:model', model: 'minecraft:item/test_item' } },
      'assets/minecraft/blockstates/test_block.json': { variants: { '': { model: 'minecraft:block/test_block' } } },
      'assets/minecraft/items/test_block.json': { model: { type: 'minecraft:model', model: 'minecraft:item/test_block' } },
    }, new Map());
    const result = auditContentDomains(provider);
    expect(result.counts['decoration-entity']).toBe(1);
    expect(result.counts['item-only']).toBe(1);
    expect(result.counts['block-backed-item']).toBe(1);
    expect(result.paletteLeaks).toEqual([]);
  });
});

function fixtureProvider(includeTexture = true): VanillaAssetProvider {
  const json = {
    'assets/minecraft/lang/en_us.json': { 'block.minecraft.stone': 'Stone', 'block.example.custom': 'Custom', 'block.example.missing': 'Missing', 'block.example.unresolved_texture': 'Unresolved' },
    'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
    'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/cube_all.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }] },
    'assets/example/blockstates/custom.json': { variants: { '': { model: 'example:block/custom' } } },
    'assets/example/models/block/custom.json': { textures: { all: 'minecraft:block/stone' }, elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: '#all' } } }] },
    'assets/example/blockstates/missing.json': {},
    'assets/example/blockstates/unresolved_texture.json': { variants: { '': { model: 'example:block/unresolved_texture' } } },
    'assets/example/models/block/unresolved_texture.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#missing' } } }] },
  };
  const binary = includeTexture ? new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1, 2, 3])]]) : new Map<string, Uint8Array>();
  return new VanillaAssetProvider('fixture.jar', json, binary);
}

function find(report: Awaited<ReturnType<typeof auditVanillaAssets>>, id: string) { return report.records.find((item) => item.registryId === id)!; }

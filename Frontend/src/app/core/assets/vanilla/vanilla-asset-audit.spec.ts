import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditVanillaAssets, classifyVisualSupport, coverageReportMarkdown } from './vanilla-asset-audit';
import { VanillaAssetProvider } from './vanilla-asset-provider';

describe('vanilla asset coverage audit', () => {
  beforeEach(() => { Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => `blob:${blob.size}`) }); });

  it('classifies Real, Partial and Fallback independently from behavior support', async () => {
    const report = await auditVanillaAssets(fixtureProvider(), { decodeTexture: async () => true, batchSize: 2 });
    const stone = find(report, 'minecraft:stone');
    const custom = find(report, 'example:custom');
    const missing = find(report, 'example:missing');
    expect(stone.render.visualSupport).toBe('real'); expect(stone.catalog.behaviorSupport).toBe('full'); expect(stone.thumbnail).toBe('real');
    expect(custom.render.visualSupport).toBe('partial'); expect(custom.catalog.behaviorSupport).toBe('unknown'); expect(custom.render.reasons).toContain('DEFAULT_STATE_UNKNOWN');
    expect(missing.render.visualSupport).toBe('fallback'); expect(missing.render.reasons).toContain('MODEL_NOT_FOUND'); expect(missing.thumbnail).toBe('unavailable');
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
});

function fixtureProvider(includeTexture = true): VanillaAssetProvider {
  const json = {
    'assets/minecraft/lang/en_us.json': { 'block.minecraft.stone': 'Stone', 'block.example.custom': 'Custom', 'block.example.missing': 'Missing', 'block.example.unresolved_texture': 'Unresolved' },
    'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
    'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/cube_all.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }] },
    'assets/example/blockstates/custom.json': { variants: { '': { model: 'example:block/custom' } } },
    'assets/example/models/block/custom.json': { textures: { all: 'minecraft:block/stone' }, elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: '#all' } } }] },
    'assets/example/blockstates/missing.json': { variants: { '': { model: 'example:block/not_found' } } },
    'assets/example/blockstates/unresolved_texture.json': { variants: { '': { model: 'example:block/unresolved_texture' } } },
    'assets/example/models/block/unresolved_texture.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#missing' } } }] },
  };
  const binary = includeTexture ? new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1, 2, 3])]]) : new Map<string, Uint8Array>();
  return new VanillaAssetProvider('fixture.jar', json, binary);
}

function find(report: Awaited<ReturnType<typeof auditVanillaAssets>>, id: string) { return report.records.find((item) => item.registryId === id)!; }

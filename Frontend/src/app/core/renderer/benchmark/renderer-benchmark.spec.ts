import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from '../engine/three-viewport-engine';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { rendererBenchmarkProject, rendererBenchmarkVisualProvider } from './renderer-benchmark-fixtures';
import { interiorOpaqueFullCubeKeys } from '../visibility/interior-occlusion';
import type { OcclusionEntry } from '../visibility/interior-occlusion';
import type { BlockVisualProvider } from '../geometry/block-model-geometry';

describe('renderer incremental baseline', () => {
  it('benchmarks conservative interior culling for a deterministic 48 cubed stone volume', () => {
    const size = 48;
    const blocks = Array.from({ length: size * size * size }, (_, index) => {
      const x = index % size;
      const y = Math.floor(index / (size * size));
      const z = Math.floor(index / size) % size;
      return { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} };
    });
    const entries = blocks.map((block) => ({ block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    const culled = interiorOpaqueFullCubeKeys(entries);
    expect(blocks).toHaveLength(110_592);
    expect(culled.size).toBe(97_336);
    expect(blocks.length - culled.size).toBe(13_256);
  });

  it('does not let reference or missing voxels become occlusion evidence', () => {
    const block = (kind: 'resolved' | 'missing', x: number, y: number, z: number) => ({ kind, id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} } as const);
    const entries: import('../visibility/interior-occlusion').OcclusionEntry[] = [
      ...Array.from({ length: 27 }, (_, index) => ({ block: block('resolved', index % 3, Math.floor(index / 9), Math.floor(index / 3) % 3), role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const })),
    ];
    entries[12] = { block: block('resolved', 0, 1, 1), role: 'reference', occlusionClass: 'non-occluding' };
    entries[4] = { block: block('missing', 1, 0, 1), role: 'missing', occlusionClass: 'non-occluding' };
    const culled = interiorOpaqueFullCubeKeys(entries);
    expect(culled.size).toBe(0);
  });

  it.each([
    ['glass', 'non-occluding'],
    ['water', 'non-occluding'],
    ['slab', 'unknown'],
    ['stairs', 'unknown'],
    ['unknown mod', 'unknown'],
  ] as const)('does not cull through %s without positive full-cube evidence', (_label, replacementClass) => {
    const block = (x: number, y: number, z: number) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const entries: OcclusionEntry[] = Array.from({ length: 27 }, (_, index) => ({ block: block(index % 3, Math.floor(index / 9), Math.floor(index / 3) % 3), role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    const neighborIndex = entries.findIndex((entry) => entry.block.position.x === 1 && entry.block.position.y === 1 && entry.block.position.z === 0);
    entries[neighborIndex] = { ...entries[neighborIndex], occlusionClass: replacementClass };
    expect(interiorOpaqueFullCubeKeys(entries).has('1,1,1')).toBe(false);
  });

  it('keeps interior culling render-only in the viewport engine', () => {
    const blocks = Array.from({ length: 27 }, (_, index) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: index % 3, y: Math.floor(index / 9), z: Math.floor(index / 3) % 3 }, state: {} }));
    const project = { ...rendererBenchmarkProject('small'), size: { x: 3, y: 3, z: 3 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider({
      create: async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } }),
      occlusionClass: () => 'opaque-full-cube' as const,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider);
    engine.update(project, undefined);
    expect(engine.performanceEvidence().interiorBlocksCulled).toBe(1);
    expect(engine.visibleSceneDiagnostics().expectedVisibleVoxelCount).toBe(27);
    expect(engine.visibleSceneDiagnostics().placeholderVoxelCount).toBe(26);
    engine.dispose();
  });

  it('keeps the normal benchmark test small and deterministic', () => {
    expect(rendererBenchmarkProject('small').blocks).toHaveLength(256);
    expect(rendererBenchmarkProject('medium').blocks).toHaveLength(2048);
    expect(rendererBenchmarkProject('large').blocks).toHaveLength(8192);
  });

  it('keeps a deterministic mixed-material stress scene across multiple visual signatures', () => {
    const project = rendererBenchmarkProject('stress');
    const signatures = new Set(project.blocks.map((block) => `${block.id}|${Object.entries(block.state).sort().map(([key, value]) => `${key}=${value}`).join(',')}`));
    expect(project.blocks).toHaveLength(20_000);
    expect(signatures.size).toBeGreaterThanOrEqual(8);
  });

  it('updates a single structural entry without rebuilding unchanged entries', () => {
    const project = rendererBenchmarkProject('small');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    engine.update(project, undefined);
    const initial = diagnostics.snapshot();
    const added = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 15, y: 15, z: 15 }, state: {} };
    engine.update({ ...project, blocks: [...project.blocks, added] }, undefined);
    const after = diagnostics.snapshot();
    expect(initial.fullSceneRebuilds).toBe(1);
    expect(after.fullSceneRebuilds).toBe(1);
    expect(after.blockAdds).toBe(project.blocks.length + 1);
    expect(after.blockVisualCreations).toBe(project.blocks.length + 1);
    engine.update({ ...project, blocks: [...project.blocks, added] }, undefined, { selected: added.position });
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    engine.dispose();
  });

  it('keeps decoration selection as an overlay and reconciles one changed instance', () => {
    const project = rendererBenchmarkProject('small');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    engine.update(project, undefined);
    const initialDecorations = diagnostics.snapshot().decorationVisualCreations;
    engine.update(project, undefined, { selectedDecorationId: project.decorations?.[0]?.instanceId });
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    expect(diagnostics.snapshot().decorationVisualCreations).toBe(initialDecorations);
    const decoration = project.decorations?.[0];
    if (!decoration) throw new Error('benchmark fixture must contain a decoration');
    engine.update({ ...project, decorations: [{ ...decoration, anchor: { x: 3, y: 1, z: 0 } }] }, undefined, { selectedDecorationId: decoration.instanceId });
    expect(diagnostics.snapshot().decorationUpdates).toBe(1);
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    engine.dispose();
  });

  it('reuses safe visual templates for the 20k stress scene instead of constructing one object per block', async () => {
    const project = rendererBenchmarkProject('stress');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration();
    const counters = diagnostics.snapshot();
    // The fixture intentionally includes transparent and multipart visuals that
    // remain on the legacy path; verified opaque cubes compile into terrain
    // chunks while the remaining compatible visuals still use instancing.
    const evidence = engine.performanceEvidence();
    expect(evidence.terrainLogicalBlocks).toBeGreaterThan(0);
    expect(evidence.terrainChunkMeshes).toBeLessThan(project.blocks.length / 50);
    expect(evidence.terrainFacesEmitted).toBeGreaterThan(0);
    expect(counters.instancedMembers).toBeGreaterThan(0);
    expect(counters.instancedMembers).toBeLessThan(project.blocks.length);
    expect(counters.reusableTemplateCreations).toBeGreaterThan(0);
    expect(counters.reusableTemplateCacheHits).toBeGreaterThan(0);
    expect(evidence.terrainTemplateResolutions).toBeLessThan(project.blocks.length / 100);
    expect(counters.providerObjectCreations).toBeLessThan(project.blocks.length);
    expect(counters.instancedMeshCount).toBeLessThan(project.blocks.length / 50);
    engine.dispose();
    provider.dispose();
  }, 20_000);
});

async function settleHydration(): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

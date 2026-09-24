import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThreeViewportEngine, VIEWPORT_VISUAL_CONCURRENCY, cameraMovementDelta, cameraMovementDirection, translateVisualToVoxel } from './three-viewport-engine';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visuals';
import type { BlockVisualProvider } from '../geometry/block-model-geometry';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { PlacedBlock } from '../../domain/project.types';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';

describe('camera movement input contract', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 4); camera.lookAt(0, 2, 0);

  it('remembers brightness before initialization and updates the mapping without rebuilding visuals', () => {
    const engine = new ThreeViewportEngine();
    engine.setBlockBrightness(0);
    expect(engine.lighting().hemisphereIntensity).toBeLessThan(2.65);
    engine.setBlockBrightness(10);
    expect(engine.lighting()).toEqual({ hemisphereIntensity: 4.2, directionalIntensity: 2.1 });
    engine.dispose();
  });

  it('uses WASD on the camera plane and Space/Shift for world vertical movement', () => {
    expect(cameraMovementDirection(new Set(['KeyW']), camera).z).toBeLessThan(0);
    expect(cameraMovementDirection(new Set(['Space']), camera)).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(cameraMovementDirection(new Set(['ShiftLeft']), camera)).toMatchObject({ x: 0, y: -1, z: 0 });
  });

  it('allows simultaneous orbit-relative and vertical input without a speed modifier', () => {
    const direction = cameraMovementDirection(new Set(['KeyW', 'Space']), camera);
    expect(direction.z).toBeLessThan(0); expect(direction.y).toBe(1);
  });

  it('keeps horizontal and vertical movement speeds independent', () => {
    const horizontal = cameraMovementDelta(new Set(['KeyW']), camera, 12, 3, 1);
    const vertical = cameraMovementDelta(new Set(['Space']), camera, 12, 3, 1);
    const combined = cameraMovementDelta(new Set(['KeyW', 'Space']), camera, 12, 3, 1);
    expect(horizontal.length()).toBeCloseTo(12);
    expect(vertical.y).toBe(3);
    expect(combined.y).toBe(3);
    expect(combined.z).toBeCloseTo(horizontal.z);
  });

  it('adds voxel translation without replacing a special visual local transform', () => {
    const visual = new SpecialBlockVisualRegistry().resolve({ kind: 'resolved', id: 'minecraft:skeleton_skull', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' } })!.create({ kind: 'resolved', id: 'minecraft:skeleton_skull', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' } });
    translateVisualToVoxel(visual, { x: 7, y: 3, z: -2 });
    expect(visual.position.toArray()).toEqual([7.5, 3, -1.5]);
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.y).toBeCloseTo(3);
    expect(bounds.max.y).toBeCloseTo(3.5);
  });

  it('preserves the chest local facing transform when adding voxel translation', () => {
    const block = { kind: 'resolved' as const, id: 'minecraft:chest', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'east', type: 'single' } };
    const visual = new SpecialBlockVisualRegistry().resolve(block)!.create(block);
    translateVisualToVoxel(visual, { x: 4, y: 2, z: -3 });
    expect(visual.position.toArray()).toEqual([4, 2, -3]);
    expect(visual.children[0].position.toArray()).toEqual([.5, .5, .5]);
    expect(visual.children[0].rotation.y).toBeCloseTo(-Math.PI * 1.5);
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.y).toBeCloseTo(2);
    expect(bounds.max.y).toBeCloseTo(2.875);
  });

  it('preserves the Shulker Box local facing transform when adding voxel translation', () => {
    const block = { kind: 'resolved' as const, id: 'minecraft:shulker_box', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'up' } };
    const visual = new SpecialBlockVisualRegistry().resolve(block)!.create(block);
    translateVisualToVoxel(visual, { x: 4, y: 2, z: -3 });
    expect(visual.position.toArray()).toEqual([4, 2, -3]);
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.x).toBeCloseTo(4.00025, 5); expect(bounds.min.y).toBeCloseTo(2.00025, 5); expect(bounds.min.z).toBeCloseTo(-2.99975, 5);
    expect(bounds.max.x).toBeCloseTo(4.99975, 5); expect(bounds.max.y).toBeCloseTo(2.99975, 5); expect(bounds.max.z).toBeCloseTo(-2.00025, 5);
  });

  it('does not attach a stale async visual after its coordinate is replaced', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = {
      create: vi.fn(() => new Promise((resolve) => pending.push(resolve))),
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: [base.blocks[0]] };
    engine.update(project, undefined);
    await Promise.resolve();
    const replacement = { ...project, blocks: [{ ...project.blocks[0], id: 'minecraft:dirt' }] };
    engine.update(replacement, undefined);
    const stale = new THREE.Group(); stale.userData['stale'] = true;
    pending[0]?.({ object: stale, resolved: { diagnostics: [], support: 'full' }, mode: 'real', diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } });
    await Promise.resolve();
    const blocksGroup = (engine as unknown as { blocksGroup: THREE.Group }).blocksGroup;
    expect(blocksGroup.children.some((child) => child.userData['stale'])).toBe(false);
    engine.dispose();
  });

  it('hydrates real visuals with bounded concurrency and shared fallback resources', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const create = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    const provider = {
      create,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(base, undefined);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(VIEWPORT_VISUAL_CONCURRENCY);
    expect(create.mock.calls.length).toBeLessThanOrEqual(VIEWPORT_VISUAL_CONCURRENCY);
    expect(engine.rendererCounters().fallbackGeometryConstructions).toBe(1);
    expect(engine.rendererCounters().maxPendingVisualJobs).toBeGreaterThan(0);
    for (const resolve of pending) resolve({ object: undefined, resolved: { diagnostics: [], support: 'fallback' }, mode: 'fallback', diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } });
    engine.dispose();
  });

  it('replaces a missing-block fallback when the project block resolves', async () => {
    const provider = { create: vi.fn(async () => ({ object: new THREE.Group(), resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const missing = { ...base, blocks: [{ kind: 'missing' as const, id: 'example:marble', namespace: 'example', position: { x: 0, y: 0, z: 0 }, state: {} }] };
    const resolved = { ...missing, blocks: [{ ...missing.blocks[0], kind: 'resolved' as const, namespace: 'example' }] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(missing, undefined);
    expect(provider.create).not.toHaveBeenCalled();
    engine.update(resolved, undefined);
    await Promise.resolve();
    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resolved', id: 'example:marble' }), expect.anything());
    engine.dispose();
  });

  it('does not dispose provider-owned shared geometry when one entry is removed', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1); geometry.userData['providerOwnedGeometry'] = true; const dispose = vi.spyOn(geometry, 'dispose');
    const provider = { create: vi.fn(async () => { const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())); return { object, resolved: { diagnostics: [], support: 'full' }, mode: 'real', diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small'); const blocks = [base.blocks[0], { ...base.blocks[1], position: { x: 2, y: 0, z: 0 } }];
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update({ ...base, blocks }, undefined); await Promise.resolve();
    engine.update({ ...base, blocks: [blocks[1]] }, undefined); expect(dispose).not.toHaveBeenCalled(); engine.dispose(); expect(dispose).not.toHaveBeenCalled(); geometry.dispose();
  });

  it.each([
    ['example:wall_sign', 'example:standing_sign'],
    ['example:wall_hanging_sign', 'example:hanging_sign'],
  ])('registers the planned concrete special visual before creating a ghost (%s)', async (concreteId, activeId) => {
    const base = rendererBenchmarkProject('small');
    const registeredIds: string[] = [];
    const create = vi.fn(async (block: PlacedBlock) => ({
      object: new THREE.Group(),
      resolved: { diagnostics: [], support: 'full' as const },
      mode: 'real' as const,
      diagnostics: [],
      trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true },
    }));
    const descriptor = (id: string): ContentSpecialVisualDescriptor | undefined => id === concreteId ? { contractId: 'common-sign', resources: { default: `${id}/sign` }, stateDependencies: ['facing'], variant: concreteId.includes('hanging') ? 'wall-hanging' : 'wall', provenance: 'trusted-data' } : undefined;
    const provider = {
      create,
      thumbnailUrl: () => undefined,
      setSpecialVisualDescriptors: (descriptors: readonly { contentId: string }[]) => { registeredIds.splice(0, registeredIds.length, ...descriptors.map((entry) => entry.contentId)); },
    };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider as unknown as BlockVisualProvider);
    engine.setSpecialVisualDescriptorResolver(descriptor);
    engine.update({ ...base, blocks: [base.blocks[0]] }, undefined);
    const active: ActiveBlock = { id: activeId, state: {}, support: 'full' };
    const planned: PlacedBlock = { kind: 'resolved', id: concreteId, namespace: 'example', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } };
    const plan: PlacementPlan = { request: planned, blocks: [planned], validation: { status: 'valid', reason: 'ok', affectedPositions: [] } };
    const internal = engine as unknown as { syncSpecialVisualDescriptors: (blocks: readonly PlacedBlock[]) => void; updateGhostModel: (block: ActiveBlock, plan: PlacementPlan) => void };
    internal.syncSpecialVisualDescriptors(plan.blocks);
    internal.updateGhostModel(active, plan);
    await Promise.resolve();
    expect(registeredIds).toContain(concreteId);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: concreteId }), expect.anything());
    engine.dispose();
  });
});

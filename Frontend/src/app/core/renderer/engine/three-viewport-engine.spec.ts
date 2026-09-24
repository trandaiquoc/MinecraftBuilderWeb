import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThreeViewportEngine, VIEWPORT_INSTANCE_THRESHOLD, VIEWPORT_VISUAL_CONCURRENCY, blockCoordinateFromHit, cameraMovementDelta, cameraMovementDirection, translateVisualToVoxel } from './three-viewport-engine';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visuals';
import type { BlockVisualProvider } from '../geometry/block-model-geometry';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
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

  it('keeps camera movement pure with respect to the project document', () => {
    const project = rendererBenchmarkProject('small');
    const before = JSON.stringify(project);
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) cameraMovementDelta(new Set([key]), camera, 9, 9, 1);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('moves the camera without translating OrbitControls focus or rendered membership', async () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    engine.update(project, undefined);
    await settleHydration();
    const internal = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; minDistance: number; maxDistance: number; update: () => void; removeEventListener: () => void; dispose: () => void }; renderedBlocks: Map<string, unknown>; placeholderIndices: Map<string, unknown>; moveCamera: (keys: ReadonlySet<string>, delta: number) => void };
    internal.camera.position.set(8, 6, 8);
    internal.controls = { target: new THREE.Vector3(0, 0, 0), minDistance: 1, maxDistance: 100, update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    const projectBlockCount = project.blocks.length;
    for (const options of [
      { selectionKind: 'none', selectionCount: 0 },
      { selectionKind: 'explicit', selectionCount: 1, selectedPositions: [project.blocks[0].position] },
      { selectionKind: 'all', selectionCount: project.blocks.length, selectionBounds: { min: project.blocks[0].position, max: project.blocks.at(-1)!.position } },
    ]) {
      engine.update(project, undefined, options);
      const targetBefore = internal.controls.target.clone();
      const renderedBefore = internal.renderedBlocks.size;
      const placeholdersBefore = internal.placeholderIndices.size;
      internal.camera.position.set(8, 6, 8);
      for (let frame = 0; frame < 8; frame += 1) internal.moveCamera(new Set(['move-right']), .05);
      expect(internal.controls.target).toEqual(targetBefore);
      expect(project.blocks).toHaveLength(projectBlockCount);
      expect(internal.renderedBlocks.size).toBe(renderedBefore);
      expect(internal.placeholderIndices.size).toBe(placeholdersBefore);
      expect(internal.camera.position.distanceTo(targetBefore)).toBeGreaterThan(.1);
    }
    engine.dispose();
  });

  it('resolves every instanced hit from the authoritative instance voxel table', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3);
    const voxels = [{ x: 2, y: 0, z: 0 }, { x: 7, y: 1, z: 0 }, { x: 9, y: 2, z: 3 }];
    mesh.userData['instanceVoxels'] = voxels;
    expect(blockCoordinateFromHit({ object: mesh, instanceId: 0 } as unknown as THREE.Intersection)).toEqual(voxels[0]);
    expect(blockCoordinateFromHit({ object: mesh, instanceId: 1 } as unknown as THREE.Intersection)).toEqual(voxels[1]);
    expect(blockCoordinateFromHit({ object: mesh, instanceId: 2 } as unknown as THREE.Intersection)).toEqual(voxels[2]);
    voxels[1] = voxels[2];
    expect(blockCoordinateFromHit({ object: mesh, instanceId: 1 } as unknown as THREE.Intersection)).toEqual({ x: 9, y: 2, z: 3 });
    mesh.geometry.dispose(); mesh.material.dispose();
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

  it('reports actual hydration completion and does not let an old generation update it', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = { create: vi.fn(() => new Promise((resolve) => pending.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 20) };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await Promise.resolve();
    const firstGeneration = engine.hydrationProgress().generation;
    expect(engine.hydrationProgress()).toMatchObject({ status: 'hydrating', total: 21, blocksTotal: 20, decorationsTotal: 1 });
    const replacement = { ...project, blocks: project.blocks.slice(0, 1) };
    engine.update(replacement, undefined);
    const secondGeneration = engine.hydrationProgress().generation;
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    for (const resolve of pending) resolve({ object: undefined, resolved: { diagnostics: [], support: 'fallback' }, mode: 'fallback', diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } });
    await settleHydration();
    expect(engine.hydrationProgress().generation).toBe(secondGeneration);
    expect(engine.hydrationProgress().blocksCompleted).toBeLessThanOrEqual(1);
    engine.dispose();
  });

  it('reaches exactly 100 percent when every fallback visual is finalized', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update({ ...base, blocks: base.blocks.slice(0, 20), decorations: [] }, undefined);
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', completed: 20, total: 20, blocksCompleted: 20, percent: 100 });
    engine.dispose();
  });

  it('collapses repeated opaque full cubes into a chunked instance group', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => { const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({ color: 0x8a94a6 }))); return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }),
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: VIEWPORT_INSTANCE_THRESHOLD + 44 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 20, y: Math.floor(index / 20), z: 0 } }));
    const project = { ...base, size: { x: 20, y: 20, z: 1 }, blocks };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration();
    const counters = engine.rendererCounters();
    expect(counters.instancedBatchCreations).toBeGreaterThan(0);
    expect(counters.instancedMembers).toBe(blocks.length);
    expect(counters.instancedMeshCount).toBeLessThanOrEqual(2);
    const blocksGroup = (engine as unknown as { blocksGroup: THREE.Group }).blocksGroup;
    const instances = blocksGroup.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(instances.reduce((total, instance) => total + (instance.userData['instanceVoxels'] as VoxelCoordinate[]).length, 0)).toBe(blocks.length);
    expect(instances.every((instance) => instance.boundingBox !== null && instance.boundingSphere !== null)).toBe(true);
    const edited = { ...project, blocks: blocks.filter((_, index) => index !== 1) };
    engine.update(edited, undefined);
    await settleHydration();
    expect(engine.rendererCounters().instancedMembers).toBe(blocks.length - 1);
    expect(engine.rendererCounters().instancedBlockRemovals).toBeGreaterThan(0);
    const remainingInstances = blocksGroup.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    for (const instance of remainingInstances) {
      const voxels = instance.userData['instanceVoxels'] as VoxelCoordinate[];
      const keys = instance.userData['instanceKeys'] as string[];
      expect(voxels).toHaveLength(keys.length);
      expect(instance.boundingBox).not.toBeNull();
      expect(instance.boundingSphere).not.toBeNull();
    }
    engine.dispose();
    sharedGeometry.dispose();
  });

  it('flushes expanded bounds when progressive hydration adds an instance outside the initial bounds', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => { const object = new THREE.Group(); const mesh = new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({ color: 0x8a94a6 })); mesh.position.set(.5, .5, .5); object.add(mesh); return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }),
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const initialBlocks = Array.from({ length: VIEWPORT_INSTANCE_THRESHOLD + 1 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 16, y: Math.floor(index / 16), z: 0 } }));
    const initial = { ...base, size: { x: 16, y: 32, z: 16 }, blocks: initialBlocks };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(initial, undefined); await settleHydration();
    const blocksGroup = (engine as unknown as { blocksGroup: THREE.Group }).blocksGroup;
    const first = blocksGroup.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)!;
    const initialMaxZ = first.boundingBox!.max.z;
    const expanded = { ...initial, blocks: [...initialBlocks, { ...base.blocks[0], position: { x: 0, y: 0, z: 15 } }] };
    engine.update(expanded, undefined); await settleHydration();
    const expandedInstance = blocksGroup.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)!;
    expect(initialMaxZ).toBeCloseTo(1);
    expect(expandedInstance.boundingBox!.max.z).toBeCloseTo(16);
    expect(expandedInstance.boundingSphere!.radius).toBeGreaterThan(0);
    engine.dispose(); sharedGeometry.dispose();
  });

  it('shows complete coarse occupancy before exact hydration and clears it on cancellation', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = { create: vi.fn(() => new Promise((resolve) => pending.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('stress');
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined);
    const internal = engine as unknown as { placeholderIndices: Map<string, unknown>; placeholderBatches: Map<string, { mesh: THREE.InstancedMesh }>; renderedBlocks: Map<string, unknown> };
    expect(internal.placeholderIndices.size + internal.renderedBlocks.size).toBe(project.blocks.length);
    expect(internal.placeholderBatches.size).toBeLessThan(project.blocks.length);
    expect([...internal.placeholderBatches.values()].every((batch) => batch.mesh.count > 0)).toBe(true);
    engine.update(undefined, undefined);
    expect(internal.placeholderIndices.size).toBe(0);
    expect(internal.placeholderBatches.size).toBe(0);
    engine.dispose();
  });

  it('removes every coarse placeholder when hydration reaches completion', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('small'); const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined); await settleHydration();
    const internal = engine as unknown as { placeholderIndices: Map<string, unknown>; placeholderBatches: Map<string, unknown> };
    expect(engine.hydrationProgress().status).toBe('complete');
    expect(internal.placeholderIndices.size).toBe(0);
    expect(internal.placeholderBatches.size).toBe(0);
    engine.dispose();
  });

  it('does not rebuild structure visuals when only selection options change', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('small'); const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider);
    engine.update(project, undefined, { selectionKind: 'none', selectionCount: 0 }); await settleHydration();
    const before = engine.rendererCounters();
    engine.update(project, undefined, { selectionKind: 'all', selectionCount: project.blocks.length, selectionBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 1, z: 3 } } }); await settleHydration();
    const after = engine.rendererCounters();
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(after.blockVisualCreations).toBe(before.blockVisualCreations);
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

describe('selection visualization scalability', () => {
  it('uses one aggregate bounds helper for the existing 20k fixture', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('stress');
    engine.update(project, undefined, { selectionKind: 'all', selectionCount: project.blocks.length, selectionBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } } });
    const internals = engine as unknown as { logicalSelectionGroup: THREE.Group; selectionBox: THREE.Box3Helper };
    expect(internals.logicalSelectionGroup.children).toHaveLength(0);
    expect(internals.selectionBox.visible).toBe(true);
    engine.dispose();
  });

  it('keeps repeated select-all and clear bounded to the shared aggregate resources', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('stress');
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } };
    for (let index = 0; index < 8; index += 1) {
      engine.update(project, undefined, { selectionKind: 'all', selectionCount: project.blocks.length, selectionBounds: bounds });
      engine.update(project, undefined, { selectionKind: 'none', selectionCount: 0 });
    }
    const internals = engine as unknown as { logicalSelectionGroup: THREE.Group; selectionBox: THREE.Box3Helper; logicalSelectionGeometry: THREE.BufferGeometry; logicalSelectionMaterial: THREE.Material };
    expect(internals.logicalSelectionGroup.children).toHaveLength(0);
    expect(internals.selectionBox.visible).toBe(false);
    expect(internals.logicalSelectionGeometry).toBeDefined();
    expect(internals.logicalSelectionMaterial).toBeDefined();
    engine.dispose();
  });

  it('keeps detailed small selection outlines on shared geometry/material', () => {
    const engine = new ThreeViewportEngine();
    const positions = Array.from({ length: 50 }, (_, index) => ({ x: index, y: 0, z: 0 }));
    engine.update(undefined, undefined, { selectionKind: 'explicit', selectionCount: positions.length, selectedPositions: positions });
    const internals = engine as unknown as { logicalSelectionGroup: THREE.Group };
    expect(internals.logicalSelectionGroup.children).toHaveLength(50);
    const geometries = internals.logicalSelectionGroup.children.map((child) => (child as THREE.LineSegments).geometry);
    expect(geometries.every((geometry) => geometry === geometries[0])).toBe(true);
    engine.dispose();
  });
});

async function settleHydration(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

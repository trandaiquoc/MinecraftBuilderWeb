import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThreeViewportEngine, VIEWPORT_INSTANCE_THRESHOLD, VIEWPORT_VISUAL_CONCURRENCY, blockCoordinateFromHit, cameraMovementDelta, cameraMovementDirection, translateVisualToVoxel } from './three-viewport-engine';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visuals';
import type { BlockVisualProvider } from '../geometry/block-model-geometry';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import { coordinateKey } from '../../domain/coordinates';

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

  it('keeps a seven-block selection and render membership intact for every camera movement action', async () => {
    const engine = new ThreeViewportEngine();
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 7), decorations: [] };
    const selectedPositions = project.blocks.map((block) => block.position);
    engine.update(project, undefined, { selectionKind: 'explicit', selectionCount: selectedPositions.length, selectedPositions });
    await settleHydration();
    const internal = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void }; renderedBlocks: Map<string, unknown>; placeholderIndices: Map<string, unknown>; moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void };
    internal.camera.position.set(8, 6, 8);
    internal.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    const projectBefore = JSON.stringify(project);
    const selectionBefore = JSON.stringify(selectedPositions);
    const renderedBefore = [...internal.renderedBlocks.keys()].sort();
    const placeholdersBefore = [...internal.placeholderIndices.keys()].sort();
    for (const action of ['move-forward', 'move-backward', 'move-left', 'move-right', 'move-up', 'move-down'] as const) {
      const before = internal.camera.position.clone();
      internal.moveCamera(new Set([action]), .05);
      expect(internal.camera.position.distanceTo(before)).toBeGreaterThan(.1);
    }
    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(JSON.stringify(selectedPositions)).toBe(selectionBefore);
    expect([...internal.renderedBlocks.keys()].sort()).toEqual(renderedBefore);
    expect([...internal.placeholderIndices.keys()].sort()).toEqual(placeholdersBefore);
    engine.dispose();
  });

  it('keeps the compact all-selection contract intact for the 20k fixture during camera movement', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('stress');
    const selection = { selectionKind: 'all' as const, selectionCount: project.blocks.length, selectionBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } } };
    engine.update(project, undefined, selection);
    const internal = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void }; moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void };
    internal.camera.position.set(8, 6, 8);
    internal.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    const projectBefore = JSON.stringify(project);
    for (const action of ['move-forward', 'move-left', 'move-backward', 'move-right', 'move-up', 'move-down'] as const) internal.moveCamera(new Set([action]), .02);
    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(selection.selectionKind).toBe('all');
    expect(selection.selectionCount).toBe(20000);
    engine.dispose();
  });

  it('restores OrbitControls mouse mappings after an editor gesture is captured by the host', () => {
    const engine = new ThreeViewportEngine();
    const internal = engine as unknown as { controls: { mouseButtons: Record<string, THREE.MOUSE>; removeEventListener: () => void; dispose: () => void }; temporaryMouseButton: { key: 'LEFT' | 'MIDDLE' | 'RIGHT'; previous: THREE.MOUSE | null | undefined } | undefined };
    internal.controls = { mouseButtons: { LEFT: THREE.MOUSE.PAN }, removeEventListener: vi.fn(), dispose: vi.fn() };
    internal.temporaryMouseButton = { key: 'LEFT', previous: THREE.MOUSE.ROTATE };
    engine.endEditorPointerGesture();
    expect(internal.controls.mouseButtons['LEFT']).toBe(THREE.MOUSE.ROTATE);
    expect(internal.temporaryMouseButton).toBeUndefined();
    internal.temporaryMouseButton = { key: 'RIGHT', previous: undefined };
    internal.controls.mouseButtons['RIGHT'] = THREE.MOUSE.PAN;
    engine.endEditorPointerGesture();
    expect(internal.controls.mouseButtons['RIGHT']).toBeUndefined();
    engine.dispose();
  });

  it('translates camera and OrbitControls focus together without touching rendered membership', async () => {
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
      const targetBefore = new THREE.Vector3(0, 0, 0);
      internal.controls.target.copy(targetBefore);
      internal.camera.position.set(8, 6, 8);
      const cameraBefore = internal.camera.position.clone();
      const offsetBefore = cameraBefore.clone().sub(targetBefore);
      const renderedBefore = internal.renderedBlocks.size;
      const placeholdersBefore = internal.placeholderIndices.size;
      for (let frame = 0; frame < 8; frame += 1) internal.moveCamera(new Set(['move-right']), .05);
      const cameraDelta = internal.camera.position.clone().sub(cameraBefore);
      const targetDelta = internal.controls.target.clone().sub(targetBefore);
      expect(targetDelta.x).toBeCloseTo(cameraDelta.x);
      expect(targetDelta.y).toBeCloseTo(cameraDelta.y);
      expect(targetDelta.z).toBeCloseTo(cameraDelta.z);
      expect(internal.camera.position.clone().sub(internal.controls.target).x).toBeCloseTo(offsetBefore.x);
      expect(internal.camera.position.clone().sub(internal.controls.target).y).toBeCloseTo(offsetBefore.y);
      expect(internal.camera.position.clone().sub(internal.controls.target).z).toBeCloseTo(offsetBefore.z);
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

  it('picks normal meshes and placeholder/final instanced meshes through voxel ownership metadata', () => {
    const normal = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    normal.userData['voxel'] = { x: 1, y: 2, z: 3 };
    expect(blockCoordinateFromHit({ object: normal } as unknown as THREE.Intersection)).toEqual({ x: 1, y: 2, z: 3 });
    const placeholder = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    placeholder.userData['placeholder'] = true;
    placeholder.userData['instanceVoxels'] = [{ x: 4, y: 5, z: 6 }];
    expect(blockCoordinateFromHit({ object: placeholder, instanceId: 0 } as unknown as THREE.Intersection)).toEqual({ x: 4, y: 5, z: 6 });
    const final = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    final.userData['realModel'] = true;
    final.userData['instanceVoxels'] = [{ x: 7, y: 8, z: 9 }];
    expect(blockCoordinateFromHit({ object: final, instanceId: 0 } as unknown as THREE.Intersection)).toEqual({ x: 7, y: 8, z: 9 });
    normal.geometry.dispose(); normal.material.dispose(); placeholder.geometry.dispose(); placeholder.material.dispose(); final.geometry.dispose(); final.material.dispose();
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

  it('requeues every visible block after a provider-generation cancellation', async () => {
    const pendingA: Array<(value: unknown) => void> = [];
    const fallback = () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } });
    const providerA = { create: vi.fn(() => new Promise((resolve) => pendingA.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const providerB = { create: vi.fn(async () => fallback()), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 24), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(providerA);
    engine.update(project, undefined);
    await Promise.resolve();
    engine.setVisualProvider(providerB);
    for (const resolve of pendingA) resolve(fallback());
    await settleHydration();
    const internal = engine as unknown as { renderedBlocks: Map<string, unknown>; placeholderIndices: Map<string, unknown> };
    expect(providerB.create).toHaveBeenCalledTimes(project.blocks.length);
    expect(internal.renderedBlocks.size).toBe(project.blocks.length);
    expect(internal.placeholderIndices.size).toBe(0);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: project.blocks.length, percent: 100 });
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

  it('contains a synchronous cached-visual failure and continues hydration', async () => {
    let throwCachedFailure = false;
    const provider = {
      create: vi.fn(async () => {
        const geometry = new THREE.BoxGeometry(); geometry.userData['providerOwnedGeometry'] = true;
        const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: (block: PlacedBlock) => { if (throwCachedFailure && block.position.x === 1) throw new Error('cached visual insertion failed'); return 'fixture-cube'; },
      thumbnailUrl: () => undefined,
    };
    const base = rendererBenchmarkProject('stress');
    const project = { ...base, blocks: base.blocks.slice(0, 700), decorations: [] };
    const previousProject = { ...project, blocks: [], decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider as unknown as BlockVisualProvider);
    engine.update(project, undefined);
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 700, percent: 100 });
    expect((engine as unknown as { reusableInstanceTemplates: Map<string, unknown> }).reusableInstanceTemplates.size).toBeGreaterThan(0);
    engine.update(previousProject, undefined);
    throwCachedFailure = true;
    engine.update(project, undefined);
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 700, percent: 100 });
    expect(engine.hydrationDiagnostics()).toMatchObject({ queued: 0, globalRunning: 0, orphanedHydrationCount: 0 });
    const failedEntry = (engine as unknown as { renderedBlocks: Map<string, { fallback: THREE.Mesh }> }).renderedBlocks.get('1,0,0');
    expect(failedEntry?.fallback.userData['renderMode']).toBe('fallback');
    expect(failedEntry?.fallback.userData['diagnostics']).toEqual([expect.objectContaining({ code: 'GEOMETRY_BUILD_FAILED' })]);
    engine.dispose();
  });

  it('completes repeated full hydration after Undo/Redo with retained mixed templates', async () => {
    const provider = {
      create: vi.fn(async (block: PlacedBlock) => {
        const geometry = new THREE.BoxGeometry(); geometry.userData['providerOwnedGeometry'] = true;
        const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true }, blockId: block.id } as unknown as Awaited<ReturnType<BlockVisualProvider['create']>>;
      }),
      reusableVisualKey: (block: PlacedBlock) => block.id.endsWith(':glass') ? undefined : block.id,
      thumbnailUrl: () => undefined,
    };
    const base = rendererBenchmarkProject('stress');
    const project = { ...base, blocks: base.blocks.slice(0, 700), decorations: [] };
    const previousProject = { ...project, blocks: [], decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider as unknown as BlockVisualProvider);
    engine.update(project, undefined);
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 700, percent: 100 });
    const initialCounters = engine.rendererCounters();
    expect(initialCounters.reusableTemplateCreations).toBeGreaterThan(1);

    const internals = engine as unknown as { renderedBlocks: Map<string, unknown>; placeholderIndices: Map<string, unknown>; instanceBatches: Map<string, unknown>; reusableInstanceTemplates: Map<string, unknown> };
    expect(internals.reusableInstanceTemplates.size).toBeGreaterThan(1);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      engine.update(previousProject, undefined);
      expect(internals.renderedBlocks.size).toBe(0);
      expect(internals.placeholderIndices.size).toBe(0);
      expect(internals.instanceBatches.size).toBe(0);
      const emptyDiagnostics = engine.rendererOwnershipDiagnostics();
      expect(emptyDiagnostics).toMatchObject({
        authoritativeProjectBlockCount: 0,
        authoritativeVisibleBlockCount: 0,
        renderedBlockCount: 0,
        placeholderVisualCount: 0,
        placeholderBatchCount: 0,
        placeholderIndexCount: 0,
        instanceBatchCount: 0,
        instanceMemberCount: 0,
        blocksGroupChildCount: 0,
        blockLikeSceneObjectsOutsideBlocksGroup: 0,
        visibleMeshesOutsideBlocksGroup: 0,
        visibleMeshCount: 0,
        staleVoxelKeys: [],
        batchInvariantViolations: [],
        hydrationState: { queued: 0, running: 0, pendingSignatureCount: 0, placeholderSignatureCount: 0, runningOwnershipCount: 0 },
        previewState: { ghostVisible: false, ghostModelVisible: false, movePreviewChildren: 0, decorationGhostChildren: 0 },
      });
      expect(emptyDiagnostics.visibleMeshSample).toEqual([]);
      engine.update(project, undefined);
      await settleHydration();
      expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 700, percent: 100 });
      expect(engine.hydrationDiagnostics()).toMatchObject({ queued: 0, running: 0, orphanedHydrationCount: 0, expectedVisibleBlockCount: 700 });
    }
    engine.update(previousProject, undefined);
    const finalEmptyDiagnostics = engine.rendererOwnershipDiagnostics();
    expect(finalEmptyDiagnostics).toMatchObject({ authoritativeProjectBlockCount: 0, authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, placeholderVisualCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, visibleMeshesOutsideBlocksGroup: 0, visibleMeshCount: 0, staleVoxelKeys: [], batchInvariantViolations: [] });
    expect(finalEmptyDiagnostics.visibleMeshSample).toEqual([]);
    expect(engine.rendererCounters().reusableTemplateCacheHits).toBeGreaterThan(100);
    expect(engine.visibleSceneDiagnostics().representedVoxelKeys).toHaveLength(0);
    engine.dispose();
  });

  it('reports markerless textured ghost meshes by their actual scene owner', async () => {
    const texture = new THREE.Texture({ src: 'fixture:cobblestone.png' });
    const geometry = new THREE.BoxGeometry();
    const ghostMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
    const provider = {
      create: vi.fn(async () => ({ object: ghostMesh, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: ['minecraft:block/cobblestone'], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } })),
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('small');
    const emptyProject = { ...project, blocks: [], decorations: [] };
    const active: ActiveBlock = { id: 'minecraft:cobblestone', state: {}, support: 'full' };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(emptyProject, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const internal = engine as unknown as {
      updateGhost: (target: VoxelCoordinate | undefined, project: ProjectDocument | undefined, active: ActiveBlock | undefined) => void;
    };
    internal.updateGhost({ x: 4, y: 2, z: 7 }, emptyProject, active);

    const diagnostics = engine.rendererOwnershipDiagnostics();
    const ghostDiagnostic = diagnostics.visibleMeshSample.find((mesh) => mesh.owner === 'ghostModel');
    expect(ghostDiagnostic).toMatchObject({
      owner: 'ghostModel',
      objectType: 'Mesh',
      localPosition: { x: 0, y: 0, z: 0 },
      worldPosition: { x: 4, y: 2, z: 7 },
      parentPath: [
        expect.objectContaining({ type: 'Scene' }),
        expect.objectContaining({ type: 'Group' }),
        expect.objectContaining({ type: 'Mesh' }),
      ],
      materials: [expect.objectContaining({ type: 'MeshBasicMaterial', texture: expect.objectContaining({ sourceIdentity: 'fixture:cobblestone.png' }) })],
      userData: {},
    });
    expect(diagnostics.visibleMeshesOutsideBlocksGroupSample).toContainEqual(ghostDiagnostic);
    expect(diagnostics.visibleMeshesOutsideBlocksGroup).toBeGreaterThanOrEqual(1);
    expect(diagnostics.previewState).toMatchObject({ ghostVisible: true, ghostModelPresent: true, ghostModelVisible: true, ghostTarget: { x: 4, y: 2, z: 7 } });
    const runtimeCapture = engine.runtimeGhostDiagnostics();
    expect(runtimeCapture.current.visibleMeshes.find((mesh) => mesh.owner === 'ghostModel')).toMatchObject({
      directSceneRoot: 'ghostModel',
      descendantsOf: { ghostModel: true, blocksGroup: false },
      worldBounds: { min: { x: 3.5, y: 1.5, z: 6.5 }, max: { x: 4.5, y: 2.5, z: 7.5 } },
    });
    expect(JSON.parse(JSON.stringify(runtimeCapture)).current.activeBlock).toEqual({ id: 'minecraft:cobblestone', state: {} });
    engine.dispose();
    geometry.dispose();
    texture.dispose();
  });

  it('retains the last two populated-to-empty runtime snapshots as JSON-safe data', () => {
    const base = rendererBenchmarkProject('small');
    const populated = { ...base, blocks: base.blocks.slice(0, 8), decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine();
    engine.setRuntimeDiagnosticsEnabled(true);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      engine.update(populated, undefined);
      engine.update(empty, undefined);
    }
    const capture = engine.runtimeGhostDiagnostics();
    expect(capture.emptyTransitions.firstEmpty?.authoritativeProjectBlockCount).toBe(0);
    expect(capture.emptyTransitions.secondEmpty?.authoritativeProjectBlockCount).toBe(0);
    expect(capture.emptyTransitions.differences).toMatchObject({ visibleMeshCountDelta: 0, renderedBlockCountDelta: 0, visibleMeshesAdded: [], visibleMeshesRemoved: [], previewStateChanged: false, suspiciousVisualsAdded: [], suspiciousVisualsRemoved: [] });
    expect(JSON.parse(JSON.stringify(capture)).emptyTransitions.secondEmpty.ownership).toMatchObject({ renderedBlockCount: 0, visibleMeshCount: 0, instanceMemberCount: 0 });
    engine.dispose();
  });

  it('captures instanced world positions and suspicious ownership from the actual scene graph', () => {
    const project = rendererBenchmarkProject('small');
    const empty = { ...project, blocks: [], decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(empty, undefined);
    const geometry = new THREE.BoxGeometry();
    const instanced = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1);
    instanced.count = 1;
    instanced.userData['instanceBatchKey'] = 'fixture-batch';
    instanced.userData['instanceKeys'] = ['9,2,3'];
    instanced.userData['instanceVoxels'] = [{ x: 9, y: 2, z: 3 }];
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(9.5, 2.5, 3.5));
    const internal = engine as unknown as { scene: THREE.Scene; blocksGroup: THREE.Group };
    internal.scene.add(internal.blocksGroup);
    internal.blocksGroup.add(instanced);

    const snapshot = engine.runtimeGhostDiagnostics().current;
    expect(snapshot.suspiciousVisuals).toContainEqual(expect.objectContaining({ owner: 'instanceBatches', reason: 'Block-renderer mesh remains while the project has zero blocks', position: { x: 0, y: 0, z: 0 } }));
    expect(snapshot.visibleMeshes.find((mesh) => mesh.uuid === instanced.uuid)).toMatchObject({
      owner: 'instanceBatches',
      directSceneRoot: 'blocksGroup',
      instanceCount: 1,
      instances: { count: 1, batchKey: 'fixture-batch', instanceKeys: ['9,2,3'], instanceVoxels: [{ x: 9, y: 2, z: 3 }], worldPositions: [{ x: 9.5, y: 2.5, z: 3.5 }] },
      worldBounds: { min: { x: 9, y: 2, z: 3 }, max: { x: 10, y: 3, z: 4 } },
    });
    engine.dispose();
  });

  it('keeps a second asynchronous mixed-visual build from restoring visuals after removal', async () => {
    const pending: Array<(value: Awaited<ReturnType<BlockVisualProvider['create']>>) => void> = [];
    const textures = new Map(['minecraft:stone', 'minecraft:oak_planks', 'minecraft:glass'].map((id) => [id, new THREE.Texture({ src: `fixture:${id}.png` })]));
    let delayGlass = false;
    const createVisual = (block: PlacedBlock) => {
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial({ map: textures.get(block.id) });
      const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, material));
      return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [block.id], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } } as unknown as Awaited<ReturnType<BlockVisualProvider['create']>>;
    };
    const provider = {
      create: vi.fn((block: PlacedBlock) => delayGlass && block.id === 'minecraft:glass'
        ? new Promise<Awaited<ReturnType<BlockVisualProvider['create']>>>((resolve) => pending.push(resolve))
        : Promise.resolve(createVisual(block))),
      reusableVisualKey: (block: PlacedBlock) => block.id === 'minecraft:glass' ? undefined : block.id,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 512 }, (_, index) => ({
      ...base.blocks[0],
      id: index % 3 === 0 ? 'minecraft:glass' : index % 2 === 0 ? 'minecraft:stone' : 'minecraft:oak_planks',
      position: { x: index % 32, y: 0, z: Math.floor(index / 32) },
    }));
    const populated = { ...base, size: { x: 32, y: 1, z: 16 }, blocks, decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider);

    engine.update(populated, undefined);
    await settleHydration(100, engine);
    expect(engine.hydrationProgress().status).toBe('complete');
    engine.update(empty, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, visibleMeshesOutsideBlocksGroup: 0 });

    delayGlass = true;
    engine.update(populated, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.rendererCounters().reusableTemplateCacheHits).toBeGreaterThan(0);
    expect(pending.length).toBeGreaterThan(0);

    engine.update(empty, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({
      authoritativeProjectBlockCount: 0,
      authoritativeVisibleBlockCount: 0,
      renderedBlockCount: 0,
      placeholderVisualCount: 0,
      placeholderBatchCount: 0,
      placeholderIndexCount: 0,
      instanceMemberCount: 0,
      visibleMeshesOutsideBlocksGroup: 0,
      visibleMeshCount: 0,
    });
    for (const resolve of pending) resolve(createVisual(blocks.find((block) => block.id === 'minecraft:glass')!));
    await settleHydration(100, engine);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, instanceMemberCount: 0, visibleMeshesOutsideBlocksGroup: 0, visibleMeshCount: 0, staleVoxelKeys: [] });
    expect(engine.rendererOwnershipDiagnostics().visibleMeshSample).toEqual([]);
    engine.dispose();
    for (const texture of textures.values()) texture.dispose();
  });

  it('drains every instance batch when a populated project becomes empty', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group();
        object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial({ color: 0x8a94a6 })));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'shared-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 768 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 32, y: Math.floor(index / 32) % 2, z: Math.floor(index / 64) } }));
    const populated = { ...base, size: { x: 32, y: 2, z: 12 }, blocks, decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(populated, undefined);
    await settleHydration();
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: blocks.length, renderedBlockCount: blocks.length, instanceMemberCount: blocks.length, staleVoxelKeys: [], batchInvariantViolations: [] });
    let current = populated;
    for (const index of [0, 511, 127, 700, 256, 767, 42]) {
      const removedKey = coordinateKey(blocks[index].position);
      current = { ...current, blocks: current.blocks.filter((block) => coordinateKey(block.position) !== removedKey) };
      engine.update(current, undefined);
      expect(engine.rendererOwnershipDiagnostics().batchInvariantViolations).toEqual([]);
    }
    engine.update(empty, undefined);
    const ownership = engine.rendererOwnershipDiagnostics();
    expect(ownership).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, placeholderVisualCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, blockLikeSceneObjectsOutsideBlocksGroup: 0, staleVoxelKeys: [], batchInvariantViolations: [] });
    engine.dispose();
    sharedGeometry.dispose();
  });

  it('drains the complete 20k mixed visible ownership set to empty', () => {
    const populated = rendererBenchmarkProject('stress');
    const empty = { ...populated, blocks: [], decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(populated, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: populated.blocks.length, placeholderVisualCount: populated.blocks.length, staleVoxelKeys: [], batchInvariantViolations: [] });
    engine.update(empty, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, placeholderVisualCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, blockLikeSceneObjectsOutsideBlocksGroup: 0, staleVoxelKeys: [], batchInvariantViolations: [] });
    engine.dispose();
  });

  it('drains a fully hydrated 20k instanced scene without leaving a final member', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async (block: PlacedBlock) => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true }, blockId: block.id };
      }),
      reusableVisualKey: (block: PlacedBlock) => block.id,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const populated = { ...rendererBenchmarkProject('stress'), decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await settleHydration(500, engine);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: populated.blocks.length });
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: populated.blocks.length, renderedBlockCount: populated.blocks.length, instanceMemberCount: populated.blocks.length, staleVoxelKeys: [], batchInvariantViolations: [] });
    engine.update(empty, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, placeholderVisualCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, staleVoxelKeys: [], batchInvariantViolations: [] });
    engine.dispose(); sharedGeometry.dispose();
  });

  it('retains only known coordinates after a large-to-small transition', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'shared-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 512 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 32, y: Math.floor(index / 32) % 2, z: Math.floor(index / 64) } }));
    const populated = { ...base, size: { x: 32, y: 2, z: 8 }, blocks, decorations: [] };
    const retained = [blocks[7], blocks[257], blocks[511]];
    const small = { ...populated, blocks: retained };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await settleHydration();
    engine.update(small, undefined); await settleHydration();
    const ownership = engine.rendererOwnershipDiagnostics();
    expect(ownership).toMatchObject({ authoritativeVisibleBlockCount: retained.length, renderedBlockCount: retained.length, instanceMemberCount: retained.length, staleVoxelKeys: [], batchInvariantViolations: [] });
    expect([...engine.visibleSceneDiagnostics().renderedVoxelKeys].sort()).toEqual(retained.map((block) => coordinateKey(block.position)).sort());
    engine.dispose(); sharedGeometry.dispose();
  });

  it('does not reinsert a removed block after a late provider completion', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = { create: vi.fn(() => new Promise((resolve) => pending.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const populated = { ...base, blocks: [base.blocks[0]], decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await Promise.resolve();
    engine.update(empty, undefined);
    for (const resolve of pending) resolve({ object: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), resolved: { diagnostics: [], support: 'full' }, mode: 'real', diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } });
    await settleHydration();
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, placeholderVisualCount: 0, blocksGroupChildCount: 0, staleVoxelKeys: [] });
    engine.dispose();
  });

  it('reconciles an authoritative in-place bulk removal', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    sharedGeometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'shared-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: [base.blocks[0]], decorations: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined); await settleHydration();
    (project.blocks as PlacedBlock[]).length = 0;
    engine.update(project, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ authoritativeVisibleBlockCount: 0, renderedBlockCount: 0, instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, staleVoxelKeys: [] });
    engine.dispose(); sharedGeometry.dispose();
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

  it('keeps one physical instance per key across boundary-heavy randomized removals', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({ color: 0x8a94a6 })));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'boundary-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 700 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 64, y: Math.floor(index / 64) % 2, z: Math.floor(index / 128) } }));
    const populated = { ...base, size: { x: 64, y: 2, z: 8 }, blocks, decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await settleHydration(200, engine);
    const assertOwnership = () => expect(engine.rendererOwnershipDiagnostics().batchInvariantViolations).toEqual([]);
    assertOwnership();
    let current = populated;
    const order = Array.from({ length: blocks.length }, (_, index) => (index * 397) % blocks.length);
    for (const index of order) {
      const removedKey = coordinateKey(blocks[index].position);
      current = { ...current, blocks: current.blocks.filter((block) => coordinateKey(block.position) !== removedKey) };
      engine.update(current, undefined);
      assertOwnership();
    }
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ instanceBatchCount: 0, instanceMemberCount: 0, renderedBlockCount: 0 });
    for (let cycle = 0; cycle < 3; cycle += 1) { engine.update(populated, undefined); await settleHydration(200, engine); assertOwnership(); engine.update(empty, undefined); expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ instanceBatchCount: 0, instanceMemberCount: 0, renderedBlockCount: 0, blocksGroupChildCount: 0 }); }
    engine.dispose(); sharedGeometry.dispose();
  }, 30_000);

  it('tears down every part of a multi-part instanced visual as one membership', async () => {
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group();
        const left = new THREE.Mesh(new THREE.BoxGeometry(.5, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8a94a6 })); left.position.x = -.25;
        const right = new THREE.Mesh(new THREE.BoxGeometry(.5, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6f7f90 })); right.position.x = .25;
        object.add(left, right);
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'multi-part-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: VIEWPORT_INSTANCE_THRESHOLD + 4 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 20, y: Math.floor(index / 20), z: 0 } }));
    const populated = { ...base, size: { x: 20, y: 20, z: 1 }, blocks, decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await settleHydration(200, engine);
    const internal = engine as unknown as { instanceBatches: Map<string, { keys: string[]; parts: THREE.InstancedMesh[] }> };
    expect([...internal.instanceBatches.values()].every((batch) => batch.parts.length === 2)).toBe(true);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ instanceMemberCount: blocks.length, batchInvariantViolations: [] });
    engine.update(empty, undefined);
    expect(engine.rendererOwnershipDiagnostics()).toMatchObject({ instanceBatchCount: 0, instanceMemberCount: 0, blocksGroupChildCount: 0, batchInvariantViolations: [] });
    engine.dispose();
  }, 20_000);

  it('repairs stale entry indexes and rejects duplicate physical insertion', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const provider = {
      create: vi.fn(async () => { const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({ color: 0x8a94a6 }))); return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }),
      reusableVisualKey: () => 'duplicate-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: VIEWPORT_INSTANCE_THRESHOLD + 2 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 32, y: Math.floor(index / 32), z: 0 } }));
    const project = { ...base, size: { x: 32, y: 16, z: 1 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine(); engine.setRuntimeDiagnosticsEnabled(true); engine.setVisualProvider(provider); engine.update(project, undefined); await settleHydration(200, engine);
    const internal = engine as unknown as { renderedBlocks: Map<string, { instanceBatchKey?: string; instanceIndex?: number }>; instanceBatches: Map<string, { templates: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] }>; removeBlockEntry: (key: string, entry: { instanceBatchKey?: string; instanceIndex?: number }) => void; addInstanceVisualFromTemplates: (templates: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[], block: PlacedBlock, key: string, source: 'cached-template') => { batchKey: string; index: number } | undefined };
    const first = blocks[0]; const firstKey = coordinateKey(first.position); const entry = internal.renderedBlocks.get(firstKey)!; const oldIndex = entry.instanceIndex!;
    const batch = internal.instanceBatches.get(entry.instanceBatchKey!)!;
    entry.instanceIndex = oldIndex + 1;
    internal.removeBlockEntry(firstKey, entry);
    expect(engine.rendererOwnershipDiagnostics().batchInvariantViolations).toEqual([]);
    expect(engine.rendererOwnershipDiagnostics().renderedBlockCount).toBe(blocks.length - 1);
    const replacementEntry = internal.renderedBlocks.get(coordinateKey(blocks[1].position))!;
    const inserted = internal.addInstanceVisualFromTemplates(batch.templates, blocks[1], coordinateKey(blocks[1].position), 'cached-template');
    expect(inserted).toBeDefined();
    replacementEntry.instanceBatchKey = inserted!.batchKey; replacementEntry.instanceIndex = inserted!.index;
    expect(engine.rendererOwnershipDiagnostics().batchInvariantViolations).toEqual([]);
    expect(engine.rendererOwnershipDiagnostics().instanceMemberCount).toBe(blocks.length - 1);
    expect(engine.runtimeGhostDiagnostics().current.instanceOwnershipTrace.some((event) => event.phase === 'before-insert' && event.source === 'cached-template')).toBe(true);
    engine.dispose(); sharedGeometry.dispose();
  }, 20_000);

  it('removes a physical member whose authoritative entry disappeared before reconcile', async () => {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const provider = {
      create: vi.fn(async () => { const object = new THREE.Group(); object.add(new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial())); return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }),
      reusableVisualKey: () => 'orphan-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: VIEWPORT_INSTANCE_THRESHOLD + 1 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 32, y: Math.floor(index / 32), z: 0 } }));
    const populated = { ...base, size: { x: 32, y: 16, z: 1 }, blocks, decorations: [] };
    const empty = { ...populated, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(populated, undefined); await settleHydration(200, engine);
    const internal = engine as unknown as { renderedBlocks: Map<string, unknown>; instanceBatches: Map<string, unknown> };
    internal.renderedBlocks.delete(coordinateKey(blocks[0].position));
    engine.update(empty, undefined);
    expect(internal.instanceBatches.size).toBe(0);
    expect(engine.rendererOwnershipDiagnostics().batchInvariantViolations).toEqual([]);
    engine.dispose(); sharedGeometry.dispose();
  }, 20_000);

  it('keeps conservative chunk bounds stable when progressive hydration adds an instance outside the initial members', async () => {
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
    const initialBoundsComputations = engine.rendererCounters().instancedBoundsComputations;
    const expanded = { ...initial, blocks: [...initialBlocks, { ...base.blocks[0], position: { x: 0, y: 0, z: 15 } }] };
    engine.update(expanded, undefined); await settleHydration();
    const expandedInstance = blocksGroup.children.find((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)!;
    expect(initialMaxZ).toBeCloseTo(16);
    expect(expandedInstance.boundingBox!.max.z).toBeCloseTo(16);
    expect(expandedInstance.boundingSphere!.radius).toBeGreaterThan(0);
    expect(engine.rendererCounters().instancedBoundsComputations).toBeLessThanOrEqual(initialBoundsComputations + 1);
    engine.dispose(); sharedGeometry.dispose();
  });

  it('keeps hydrated non-instanced objects inside the real camera frustum while WASD translates camera and target together', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1); geometry.userData['providerOwnedGeometry'] = true;
    const provider = { create: vi.fn(async () => { const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())); return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }; }), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small'); const project = { ...base, blocks: base.blocks.slice(0, 12), decorations: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined); await settleHydration();
    const internals = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void }; moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void; renderedBlocks: Map<string, { object: THREE.Object3D }> };
    internals.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    internals.camera.position.set(10, 8, 12); internals.controls.target.set(2, 1, 2); internals.camera.lookAt(2, 1, 2); internals.controls.update();
    const representative = internals.renderedBlocks.values().next().value?.object;
    if (!representative) throw new Error('expected hydrated mesh');
    for (let frame = 0; frame < 12; frame += 1) {
      internals.moveCamera(new Set(['move-forward' as const, frame % 2 ? 'move-right' as const : 'move-left' as const]), .04);
      const frustum = cameraFrustum(internals.camera);
      expect(frustumIntersectsObject(frustum, representative)).toBe(true);
      expect([...internals.renderedBlocks.values()].every((entry) => entry.object.visible)).toBe(true);
    }
    expect(engine.rendererCounters().fullSceneRebuilds).toBe(1);
    engine.dispose(); geometry.dispose();
  });

  it('keeps placeholder chunk bounds frustum-visible during hydration and camera movement', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = { create: vi.fn(() => new Promise((resolve) => pending.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('stress'); const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined);
    const internals = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void }; moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void; placeholderBatches: Map<string, { mesh: THREE.InstancedMesh }> };
    internals.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    internals.camera.position.set(20, 18, 24); internals.controls.target.set(8, 2, 8); internals.controls.update();
    const representativeBatch = internals.placeholderBatches.values().next().value?.mesh;
    if (!representativeBatch) throw new Error('expected placeholder batch');
    for (let frame = 0; frame < 8; frame += 1) {
      internals.moveCamera(new Set(['move-forward' as const]), .03);
      const frustum = cameraFrustum(internals.camera);
      expect(frustum.intersectsObject(representativeBatch)).toBe(true);
    }
    expect(engine.visibleSceneDiagnostics().representedVoxelKeys).toHaveLength(project.blocks.length);
    for (const resolve of pending) resolve({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } });
    await settleHydration(); engine.dispose();
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

  it('keeps decoration resolver changes out of the block-scene rebuild path', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const project = rendererBenchmarkProject('small');
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(project, undefined); await settleHydration();
    const before = engine.rendererCounters();
    const first = (_resource: string) => undefined;
    const second = (_resource: string) => undefined;
    engine.setDecorationTextureProvider(first); await settleHydration();
    engine.setDecorationTextureProvider(second); await settleHydration();
    engine.setDecorationTextureProvider(second); await settleHydration();
    const after = engine.rendererCounters();
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(after.blockVisualCreations).toBe(before.blockVisualCreations);
    expect(after.decorationVisualCreations).toBeGreaterThan(before.decorationVisualCreations);
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

describe('provider handoff hydration ownership', () => {
  const resolvedVisual = () => ({
    object: new THREE.Group(),
    resolved: { diagnostics: [], support: 'full' as const },
    mode: 'real' as const,
    diagnostics: [],
    trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true },
  });

  it('promotes restored placeholder-only blocks when a provider becomes available', async () => {
    const project = { ...rendererBenchmarkProject('small'), blocks: rendererBenchmarkProject('small').blocks.slice(0, 1), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    expect(engine.visibleSceneDiagnostics()).toMatchObject({ renderedVoxelCount: 0, placeholderVoxelCount: 1, pendingVoxelCount: 0 });

    const create = vi.fn(async () => resolvedVisual());
    engine.setVisualProvider({ create, thumbnailUrl: () => undefined } as unknown as BlockVisualProvider);
    await settleHydration();

    expect(create).toHaveBeenCalledTimes(1);
    expect(engine.visibleSceneDiagnostics()).toMatchObject({ renderedVoxelCount: 1, placeholderVoxelCount: 0, pendingVoxelCount: 0, representedVoxelKeys: [expect.any(String)] });
    expect(engine.ownershipDiagnostics()).toEqual([expect.objectContaining({ renderedEntry: true, placeholderEntry: false, queuedJob: false })]);
    engine.dispose();
  });

  it('hydrates every restored block after provider handoff without duplicate work', async () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 3), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    const create = vi.fn(async () => resolvedVisual());
    engine.setVisualProvider({ create, thumbnailUrl: () => undefined } as unknown as BlockVisualProvider);
    await settleHydration();
    expect(create).toHaveBeenCalledTimes(3);
    const callsAfterHandoff = create.mock.calls.length;

    engine.update({ ...project, blocks: project.blocks.map((block) => ({ ...block })) }, undefined);
    await settleHydration();
    expect(create).toHaveBeenCalledTimes(callsAfterHandoff);
    expect(engine.visibleSceneDiagnostics()).toMatchObject({ renderedVoxelCount: 3, placeholderVoxelCount: 0, pendingVoxelCount: 0 });
    engine.dispose();
  });

  it('re-hydrates stale representations when the provider generation changes', async () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 1), decorations: [] };
    const engine = new ThreeViewportEngine();
    const firstCreate = vi.fn(async () => resolvedVisual());
    engine.setVisualProvider({ create: firstCreate, thumbnailUrl: () => undefined } as unknown as BlockVisualProvider);
    engine.update(project, undefined);
    await settleHydration();
    const secondCreate = vi.fn(async () => resolvedVisual());
    engine.setVisualProvider({ create: secondCreate, thumbnailUrl: () => undefined } as unknown as BlockVisualProvider);
    await settleHydration();
    expect(firstCreate).toHaveBeenCalledTimes(1);
    expect(secondCreate).toHaveBeenCalledTimes(1);
    expect(engine.visibleSceneDiagnostics()).toMatchObject({ renderedVoxelCount: 1, placeholderVoxelCount: 0, pendingVoxelCount: 0 });
    engine.dispose();
  });

  it('keeps placeholders stable without a provider and does not create a runaway queue', async () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 2), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    engine.update({ ...project, blocks: project.blocks.map((block) => ({ ...block })) }, undefined);
    await settleHydration();
    expect(engine.hydrationDiagnostics()).toMatchObject({ queued: 0, running: 0 });
    expect(engine.visibleSceneDiagnostics()).toMatchObject({ renderedVoxelCount: 0, placeholderVoxelCount: 2, pendingVoxelCount: 0 });
    engine.dispose();
  });
});

describe('selection visualization scalability', () => {
  it('kicks a small block hydration queue without decoration or pointer work', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const provider = { create: vi.fn(() => new Promise((resolve) => pending.push(resolve))), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 3), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    expect(engine.visibleSceneDiagnostics().representedVoxelKeys).toHaveLength(3);
    expect(engine.hydrationDiagnostics()).toMatchObject({ queued: 3, running: 0, scheduled: true });
    expect(engine.ownershipDiagnostics()).toEqual(expect.arrayContaining([expect.objectContaining({ expectedVisible: true, placeholderEntry: true, queuedJob: true })]));
    await Promise.resolve();
    expect(engine.hydrationDiagnostics().running).toBeGreaterThan(0);
    for (const resolve of pending) resolve({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } });
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 3, blocksTotal: 3 });
    expect(engine.hydrationDiagnostics().queued).toBe(0);
    engine.dispose();
  });

  it('keeps the hydration pump progressing during camera movement without a new generation', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const engine = new ThreeViewportEngine();
    const project = { ...rendererBenchmarkProject('small'), blocks: rendererBenchmarkProject('small').blocks.slice(0, 7), decorations: [] };
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    const generation = engine.hydrationDiagnostics().generation;
    const internal = engine as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void; }; moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void };
    internal.camera.position.set(8, 6, 8);
    internal.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    for (let index = 0; index < 5; index += 1) internal.moveCamera(new Set(['move-forward' as const]), .05);
    await settleHydration();
    expect(engine.hydrationDiagnostics().generation).toBe(generation);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 7 });
    engine.dispose();
  });

  it('does not rehydrate blocks when a catalog revision leaves effective descriptors unchanged', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined, setSpecialVisualDescriptors: vi.fn() } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const descriptor = (id: string): ContentSpecialVisualDescriptor | undefined => id === base.blocks[0].id ? { contractId: 'example', resources: { default: 'example:block' }, stateDependencies: [], provenance: 'trusted-data' } : undefined;
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.setSpecialVisualDescriptorResolver(descriptor, 1);
    engine.update(base, undefined);
    await settleHydration();
    const before = engine.rendererCounters();
    engine.setSpecialVisualDescriptorResolver(descriptor, 2);
    const after = engine.rendererCounters();
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(after.blockVisualCreations).toBe(before.blockVisualCreations);
    engine.dispose();
  });

  it('reports one represented ownership state per expected visible voxel', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    engine.update(project, undefined);
    const diagnostics = engine.visibleSceneDiagnostics();
    expect(diagnostics.expectedVisibleVoxelCount).toBe(project.blocks.length);
    expect(diagnostics.renderedVoxelCount + diagnostics.placeholderVoxelCount).toBe(project.blocks.length);
    expect(diagnostics.representedVoxelKeys).toHaveLength(project.blocks.length);
    engine.dispose();
  });

  it('keeps selection overlays above depth and in world space', () => {
    const engine = new ThreeViewportEngine();
    engine.update(undefined, undefined, { selected: { x: 3, y: 4, z: 5 }, selectionKind: 'explicit', selectionCount: 1 });
    const internals = engine as unknown as { selectionOutline: THREE.LineSegments; selectionBox: THREE.Box3Helper; logicalSelectionMaterial: THREE.LineBasicMaterial };
    expect((internals.selectionOutline.material as THREE.LineBasicMaterial).depthTest).toBe(false);
    expect((internals.selectionOutline.material as THREE.LineBasicMaterial).depthWrite).toBe(false);
    expect(internals.selectionOutline.renderOrder).toBeGreaterThan(1000);
    expect(internals.selectionOutline.position.toArray()).toEqual([3.5, 4.5, 5.5]);
    expect(internals.logicalSelectionMaterial.depthTest).toBe(false);
    expect((internals.selectionBox.material as THREE.LineBasicMaterial).depthTest).toBe(false);
    engine.dispose();
  });

  it('does not draw a misleading selection overlay for a block filtered out of Y-layer view', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    const selected = project.blocks.find((block) => block.position.y === 0)!.position;
    engine.update(project, undefined, { layerY: 1, visibility: 'current-only', selected, selectionKind: 'explicit', selectionCount: 1 });
    const internals = engine as unknown as { selectionOutline: THREE.LineSegments; logicalSelectionGroup: THREE.Group; selectionBox: THREE.Box3Helper };
    expect(internals.selectionOutline.visible).toBe(false);
    expect(internals.logicalSelectionGroup.children).toHaveLength(0);
    expect(internals.selectionBox.visible).toBe(false);
    engine.dispose();
  });

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
  }, 20_000);

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

async function settleHydration(rounds = 20, engine?: ThreeViewportEngine): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    if (engine?.hydrationProgress().status === 'complete') return;
  }
}

function cameraFrustum(camera: THREE.PerspectiveCamera): THREE.Frustum {
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

function frustumIntersectsObject(frustum: THREE.Frustum, object: THREE.Object3D): boolean {
  object.updateMatrixWorld(true);
  let intersects = false;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || intersects) return;
    child.geometry.computeBoundingSphere();
    const sphere = child.geometry.boundingSphere?.clone();
    if (sphere) intersects = frustum.intersectsSphere(sphere.applyMatrix4(child.matrixWorld));
  });
  return intersects;
}

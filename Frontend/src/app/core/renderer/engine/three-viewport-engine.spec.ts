import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThreeViewportEngine, VIEWPORT_INSTANCE_THRESHOLD, VIEWPORT_VISUAL_CONCURRENCY, blockCoordinateFromHit, cameraMovementDelta, cameraMovementDirection, compileInstanceTemplates, surfaceFaceDirectionFromHit, surfaceFaceNormal, translateVisualToVoxel } from './three-viewport-engine';
import type { InstancePartTemplate } from './three-viewport-engine';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visual-registry';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import { rendererBenchmarkProject, rendererBenchmarkVisualProvider } from '../benchmark/renderer-benchmark-fixtures';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import { coordinateKey } from '../../domain/coordinates';
import { viewportThemePalette } from './viewport-theme';
import { RendererDiagnostics } from './renderer-diagnostics';
import { blockMutationHint, metadataMutationHint } from '../../editor/mutations/project-mutation-hint';
import { vanillaFluidRenderResolver } from '../fluids/fluid-state';
import { ViewportRuntimeTrace } from '../diagnostics/viewport-runtime-trace';
import { GroupIsolationPresentation, type GroupIsolationSnapshot } from '../isolation/group-isolation-presentation';

describe('camera movement input contract', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 4); camera.lookAt(0, 2, 0);

  it('suspends viewport work without disposing the retained engine', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    engine.suspend();
    engine.update(project, undefined);

    expect(engine.isSuspended).toBe(true);
    expect(engine.performanceEvidence().hydrationQueue).toBe(0);
    engine.cameraKeyDown('move-forward');
    expect(engine.performanceEvidence().cameraMovementFrames).toBe(0);

    engine.resume();
    expect(engine.isSuspended).toBe(false);
    engine.update(project, undefined);
    expect(engine.performanceEvidence().hydrationQueue).toBeGreaterThanOrEqual(0);
    engine.dispose();
  });

  it('remembers brightness before initialization and updates the mapping without rebuilding visuals', () => {
    const engine = new ThreeViewportEngine();
    engine.setBlockBrightness(0);
    expect(engine.lighting().hemisphereIntensity).toBeLessThan(2.65);
    engine.setBlockBrightness(10);
    expect(engine.lighting()).toEqual({ hemisphereIntensity: 4.2, directionalIntensity: 2.1 });
    engine.dispose();
  });

  it('updates placeholder and hydrated instanced block materials without affecting overlays', async () => {
    const engine = new ThreeViewportEngine();
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 300), decorations: [] };
    const internals = engine as unknown as {
      fallbackMaterials: { normal: THREE.MeshLambertMaterial };
      placeholderMaterials: { normal: THREE.MeshBasicMaterial };
      logicalSelectionMaterial: THREE.LineBasicMaterial;
      instanceBatches: Map<string, { parts: THREE.InstancedMesh[] }>;
    };
    engine.update(project, undefined);
    const placeholderBase = internals.placeholderMaterials.normal.color.clone();
    engine.applyTheme(viewportThemePalette('light'));
    expect(internals.placeholderMaterials.normal.color.getHex()).toBe(viewportThemePalette('light').block);
    expect(internals.fallbackMaterials.normal.color.getHex()).toBe(viewportThemePalette('light').block);
    engine.applyTheme(viewportThemePalette('dark'));
    expect(internals.placeholderMaterials.normal.color.getHex()).toBe(viewportThemePalette('dark').block);
    expect(internals.fallbackMaterials.normal.color.getHex()).toBe(viewportThemePalette('dark').block);
    engine.setBlockBrightness(0);
    const placeholderDark = internals.placeholderMaterials.normal.color.clone();
    engine.setBlockBrightness(10);
    expect(placeholderDark.equals(placeholderBase)).toBe(false);
    const overlayBase = internals.logicalSelectionMaterial.color.clone();
    expect(internals.logicalSelectionMaterial.color.equals(overlayBase)).toBe(true);

    const geometry = new THREE.BoxGeometry(1, 1, 1); geometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x6688aa })));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'brightness-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    engine.setBlockBrightness(3);
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration(20, engine);
    const batch = [...internals.instanceBatches.values()][0];
    expect(batch).toBeDefined();
    const hydratedMaterial = batch.parts[0].material as THREE.MeshBasicMaterial;
    const hydratedBase = hydratedMaterial.color.clone();
    expect(hydratedBase.getHex()).toBe(0x6688aa);
    engine.applyTheme(viewportThemePalette('light'));
    expect(hydratedMaterial.color.equals(hydratedBase)).toBe(true);
    engine.setBlockBrightness(0);
    const hydratedDark = hydratedMaterial.color.clone();
    engine.setBlockBrightness(10);
    expect(hydratedDark.equals(hydratedBase)).toBe(false);
    engine.setBlockBrightness(3);
    expect(hydratedMaterial.color.equals(hydratedBase)).toBe(true);
    engine.dispose(); geometry.dispose();
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

  it('uses the same translation speed for horizontal and vertical movement', () => {
    const horizontal = cameraMovementDelta(new Set(['KeyW']), camera, 12, 3, 1);
    const vertical = cameraMovementDelta(new Set(['Space']), camera, 12, 3, 1);
    const combined = cameraMovementDelta(new Set(['KeyW', 'Space']), camera, 12, 3, 1);
    expect(horizontal.length()).toBeCloseTo(12);
    expect(vertical.y).toBe(12);
    expect(combined.y).toBe(12);
    expect(combined.z).toBeCloseTo(horizontal.z);
  });

  it('keeps vertical movement aligned with adaptive speed at near, medium, and far distances', async () => {
    const { effectiveCameraMovementSpeed } = await import('../scheduling/camera-movement-speed');
    for (const distance of [8, 16, 40]) {
      const speed = effectiveCameraMovementSpeed(15, distance);
      const horizontal = cameraMovementDelta(new Set(['KeyD']), camera, speed, 1, 1);
      const vertical = cameraMovementDelta(new Set(['Space']), camera, speed, 1, 1);
      expect(vertical.length() / horizontal.length()).toBeCloseTo(1);
    }
  });

  it('coalesces hover pointer moves and suppresses them during camera gestures', async () => {
    const engine = new ThreeViewportEngine();
    const pointer = (clientX: number) => ({ clientX, clientY: 10 } as PointerEvent);
    const hits: number[] = [];
    engine.hover(pointer(1), undefined, undefined, undefined, false, () => hits.push(1));
    engine.hover(pointer(2), undefined, undefined, undefined, false, () => hits.push(2));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(hits).toEqual([2]);
    const internal = engine as unknown as { cameraGestureInProgress: boolean };
    internal.cameraGestureInProgress = true;
    engine.hover(pointer(3), undefined, undefined, undefined, false, () => hits.push(3));
    expect(engine.rendererCounters()).toMatchObject({ hoverRaycasts: 1, hoverPointerMovesCoalesced: 1, hoverRaycastsSuppressedDuringCamera: 1 });
    engine.dispose();
  });

  it('keeps camera movement pure with respect to the project document', () => {
    const project = rendererBenchmarkProject('small');
    const before = JSON.stringify(project);
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) cameraMovementDelta(new Set([key]), camera, 9, 9, 1);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('stops the movement RAF after the final action release', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const request = vi.fn((callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    try {
      const engine = new ThreeViewportEngine();
      const internal = engine as unknown as { pressedActions: Set<string>; cameraMoveFrame?: number };
      engine.cameraKeyDown('move-forward');
      engine.cameraKeyUp('move-forward');
      expect(internal.pressedActions.size).toBe(0);
      const pending = [...callbacks.values()][0];
      pending?.(performance.now() + 16);
      expect(internal.cameraMoveFrame).toBeUndefined();
      expect(request).toHaveBeenCalledTimes(1);
      engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cancels the movement RAF when camera input is invalidated atomically', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    try {
      const engine = new ThreeViewportEngine();
      const internal = engine as unknown as { pressedActions: Set<string>; cameraMoveFrame?: number };
      engine.cameraKeyDown('move-forward');
      expect(internal.pressedActions.size).toBe(1);
      engine.clearInput();
      expect(internal.pressedActions.size).toBe(0);
      expect(internal.cameraMoveFrame).toBeUndefined();
      expect(callbacks.size).toBe(0);
      engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
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
      const directionBefore = internal.camera.getWorldDirection(new THREE.Vector3());
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
      expect(internal.camera.getWorldDirection(new THREE.Vector3()).angleTo(directionBefore)).toBeCloseTo(0);
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

  it('precisely picks a committed placeholder candidate before a block behind it', () => {
    const engine = new ThreeViewportEngine();
    const wall: PlacedBlock = { kind: 'resolved', id: 'minecraft:cobblestone_wall', namespace: 'minecraft', position: { x: 1, y: 0, z: 0 }, state: { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true', waterlogged: 'false' } };
    const solid: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 3, y: 0, z: 0 }, state: {} };
    const project = { ...rendererBenchmarkProject('small'), size: { x: 6, y: 1, z: 1 }, blocks: [wall, solid], decorations: [] };
    engine.update(project, undefined);
    const internal = engine as unknown as {
      raycaster: THREE.Raycaster;
      ddaPick: (project: ProjectDocument) => { position: VoxelCoordinate } | undefined;
    };
    internal.raycaster.set(new THREE.Vector3(-1, .5, .5), new THREE.Vector3(1, 0, 0));
    expect(internal.ddaPick(project)?.position).toEqual({ x: 1, y: 0, z: 0 });
    engine.dispose();
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

  it('traces the reason and pre-clear ownership when a project identity restarts hydration', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 8), decorations: [] };
    const reopened = { ...project, metadata: { ...project.metadata, updatedAt: '2026-10-05T00:00:01.000Z' } };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration();
    const trace = new ViewportRuntimeTrace({ metadata: () => engine.runtimeTraceMetadata(), sample: () => engine.runtimeTraceSample() });
    engine.setRuntimeTrace(trace);
    trace.start('hydration-restart-diagnostic');
    engine.update(reopened, undefined);
    const event = trace.stop()?.timeline.find((entry) => entry.type === 'hydration-generation-start');
    expect(event?.payload).toMatchObject({ reason: 'project-identity-changed', previousGeneration: 2, generation: 3, projectIdentityChanged: true, structureSyncKeyChanged: false, previousProjectId: project.id, nextProjectId: reopened.id, renderedBlockCount: project.blocks.length });
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

  it('uses cached reusable templates without allocating a throwaway fallback mesh', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1); geometry.userData['providerOwnedGeometry'] = true;
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group(); object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => 'cached-cube',
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 300), decorations: [] };
    const empty = { ...project, blocks: [] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider);
    engine.update(project, undefined); await settleHydration(8);
    const first = engine.rendererCounters();
    engine.update(empty, undefined); engine.update(project, undefined); await settleHydration(8);
    const second = engine.rendererCounters();
    expect(second.reusableTemplateCacheHits).toBeGreaterThan(first.reusableTemplateCacheHits);
    expect(second.cachedTemplateInsertions).toBeGreaterThan(0);
    expect(second.fallbackMeshCreations).toBe(first.fallbackMeshCreations);
    const internals = engine as unknown as { placeholderMaterials: { normal: THREE.Material } };
    expect(internals.placeholderMaterials.normal.type).toBe('MeshBasicMaterial');
    expect(internals.placeholderMaterials.normal.transparent).toBe(false);
    expect(internals.placeholderMaterials.normal.depthWrite).toBe(true);
    engine.dispose(); geometry.dispose();
  });

  it('suppresses the OrbitControls change render during an explicit keyboard movement frame', () => {
    const engine = new ThreeViewportEngine();
    const internals = engine as unknown as { cameraMovementInProgress: boolean; renderOnControlChange: () => void };
    internals.cameraMovementInProgress = true;
    internals.renderOnControlChange();
    expect(engine.rendererCounters().cameraChangeEventsDuringMovement).toBe(1);
    expect(engine.rendererCounters().cameraRenderRequestsSuppressed).toBe(1);
    expect(engine.rendererCounters().cameraMovementRenderCalls).toBe(0);
    engine.dispose();
  });

  it('keeps hydration progress monotonic across camera-only interaction', () => {
    const engine = new ThreeViewportEngine();
    const internals = engine as unknown as {
      hydrationGeneration: number;
      publishHydrationProgress: (progress: unknown) => void;
      onControlStart: () => void;
      onControlEnd: () => void;
      renderOnControlChange: () => void;
      applyWheelZoom: (action: 'zoom-in' | 'zoom-out', deltaY: number, deltaMode: number) => void;
      camera: THREE.PerspectiveCamera;
      controls: { target: THREE.Vector3; minDistance: number; maxDistance: number; update: () => void; removeEventListener: () => void; dispose: () => void };
    };
    internals.hydrationGeneration = 7;
    internals.publishHydrationProgress({ generation: 7, status: 'hydrating', completed: 70, total: 100, blocksCompleted: 70, blocksTotal: 100, decorationsCompleted: 0, decorationsTotal: 0, percent: 70 });
    internals.onControlStart();
    internals.renderOnControlChange();
    internals.camera.position.set(8, 6, 8);
    internals.controls = { target: new THREE.Vector3(), minDistance: 1, maxDistance: 100, update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    internals.applyWheelZoom('zoom-in', 3, 1);
    internals.onControlEnd();
    expect(engine.hydrationProgress()).toMatchObject({ generation: 7, total: 100, blocksTotal: 100, blocksCompleted: 70, completed: 70 });
    expect(engine.rendererCounters()).toMatchObject({ hydrationGenerations: 0, cameraOnlyGenerationChanges: 0, hydrationProgressRegressions: 0 });
    engine.dispose();
  });

  it('scales horizontal WASD distance continuously with camera-target distance', () => {
    const engine = new ThreeViewportEngine();
    const internals = engine as unknown as {
      camera: THREE.PerspectiveCamera;
      controls: { target: THREE.Vector3; update: () => void; removeEventListener: () => void; dispose: () => void };
      moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void;
    };
    internals.controls = { target: new THREE.Vector3(), update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    internals.camera.position.set(0, 0, 8);
    internals.camera.lookAt(internals.controls.target);
    const nearBefore = internals.camera.position.clone();
    internals.moveCamera(new Set(['move-forward']), .1);
    const nearDistance = internals.camera.position.distanceTo(nearBefore);
    internals.controls.target.set(0, 0, 0);
    internals.camera.position.set(0, 0, 24);
    internals.camera.lookAt(internals.controls.target);
    const farBefore = internals.camera.position.clone();
    internals.moveCamera(new Set(['move-forward']), .1);
    const farDistance = internals.camera.position.distanceTo(farBefore);
    expect(farDistance).toBeGreaterThan(nearDistance);
    expect(farDistance / nearDistance).toBeLessThan(3.1);
    engine.dispose();
  });

  it('coalesces repeated OrbitControls changes into one camera render request per frame', async () => {
    const engine = new ThreeViewportEngine();
    const internals = engine as unknown as { renderOnControlChange: () => void };
    internals.renderOnControlChange(); internals.renderOnControlChange(); internals.renderOnControlChange();
    expect(engine.rendererCounters()).toMatchObject({ controlChangeEvents: 3, cameraRenderRequests: 3, cameraRenderRequestsCoalesced: 2 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(engine.rendererCounters().cameraRendersExecuted).toBe(1);
    engine.dispose();
  });

  it('keeps DPR, backing dimensions, and projection stable across camera input', () => {
    const previousDevicePixelRatio = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
    const engine = new ThreeViewportEngine();
    let pixelRatio = 1;
    const domElement = {
      width: 0,
      height: 0,
      getBoundingClientRect: () => ({ width: 1200, height: 800, left: 0, top: 0, right: 1200, bottom: 800 }),
      removeEventListener: vi.fn(),
      remove: vi.fn(),
    };
    const setPixelRatio = vi.fn((value: number) => { pixelRatio = value; });
    const setSize = vi.fn((width: number, height: number) => {
      domElement.width = Math.round(width * pixelRatio);
      domElement.height = Math.round(height * pixelRatio);
    });
    const renderer = {
      getPixelRatio: () => pixelRatio,
      setPixelRatio,
      setSize,
      render: vi.fn(),
      dispose: vi.fn(),
      info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 }, memory: { geometries: 0, textures: 0 } },
      domElement,
    } as unknown as THREE.WebGLRenderer;
    const internals = engine as unknown as {
      renderer: THREE.WebGLRenderer;
      container: { getBoundingClientRect: () => { width: number; height: number } };
      canvasSize: { width: number; height: number };
      camera: THREE.PerspectiveCamera;
      controls: { target: THREE.Vector3; minDistance: number; maxDistance: number; update: () => void; removeEventListener: () => void; dispose: () => void };
      onControlStart: () => void;
      renderOnControlChange: () => void;
      onControlEnd: () => void;
      applyWheelZoom: (action: 'zoom-in' | 'zoom-out', deltaY: number, deltaMode: number) => void;
      moveCamera: (keys: ReadonlySet<import('../../editor/input/keyboard-bindings').MovementAction>, delta: number) => void;
    };
    internals.renderer = renderer;
    internals.container = { getBoundingClientRect: () => ({ width: 1200, height: 800 }) };
    internals.controls = { target: new THREE.Vector3(1, 2, 3), minDistance: 1, maxDistance: 100, update: vi.fn(), removeEventListener: vi.fn(), dispose: vi.fn() };
    internals.camera.position.set(8, 6, 8);
    internals.camera.lookAt(internals.controls.target);
    engine.resize();
    expect(pixelRatio).toBe(1.25);
    const backingSize = { width: domElement.width, height: domElement.height };
    setPixelRatio.mockClear(); setSize.mockClear();
    const poseBefore = {
      position: internals.camera.position.clone(),
      target: internals.controls.target.clone(),
      quaternion: internals.camera.quaternion.clone(),
      projection: internals.camera.projectionMatrix.clone(),
      fov: internals.camera.fov,
      aspect: internals.camera.aspect,
    };

    internals.onControlStart();
    internals.renderOnControlChange();
    internals.onControlEnd();
    expect(internals.camera.position.distanceTo(poseBefore.position)).toBe(0);
    expect(internals.controls.target.distanceTo(poseBefore.target)).toBe(0);
    expect(internals.camera.quaternion.angleTo(poseBefore.quaternion)).toBe(0);
    expect(internals.camera.fov).toBe(poseBefore.fov);
    expect(internals.camera.aspect).toBe(poseBefore.aspect);
    expect(internals.camera.projectionMatrix.equals(poseBefore.projection)).toBe(true);

    const distanceBeforeWheel = internals.camera.position.distanceTo(internals.controls.target);
    internals.applyWheelZoom('zoom-in', 3, 1);
    expect(internals.camera.position.distanceTo(internals.controls.target)).toBeLessThan(distanceBeforeWheel);
    internals.moveCamera(new Set(['move-forward']), .016);
    engine.cameraKeyDown('move-forward');
    engine.cameraKeyUp('move-forward');
    engine.clearInput();

    expect(pixelRatio).toBe(1.25);
    expect(setPixelRatio).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
    expect({ width: domElement.width, height: domElement.height }).toEqual(backingSize);
    expect(engine.rendererCounters()).toMatchObject({ interactiveResolutionEntries: 0, staticResolutionRestores: 0 });
    engine.dispose();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: previousDevicePixelRatio });
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

  it('keeps the fallback outline visible while an async ghost model is unavailable', () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: [], decorations: [] };
    const active: ActiveBlock = { id: 'minecraft:stone', state: {}, support: 'full' };
    const engine = new ThreeViewportEngine();
    engine.update(project, active);
    const internal = engine as unknown as {
      updateGhost: (target: VoxelCoordinate | undefined, project: ProjectDocument | undefined, active: ActiveBlock | undefined, status?: 'valid' | 'warning' | 'invalid' | 'unknown') => void;
    };
    internal.updateGhost({ x: 2, y: 1, z: 3 }, project, active, 'valid');

    expect(engine.rendererOwnershipDiagnostics().previewState).toMatchObject({ ghostVisible: true, ghostModelPresent: false, ghostTarget: { x: 2, y: 1, z: 3 } });
    engine.dispose();
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

  it('adopts committed ownership when the same logical project is reopened', async () => {
    const provider = {
      create: vi.fn(async () => {
        const object = new THREE.Group();
        object.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
        return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
      }),
      reusableVisualKey: () => undefined,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 1), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration(40, engine);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', completed: 1, total: 1 });

    const reopened = { ...project, blocks: project.blocks.map((block) => ({ ...block, state: { ...block.state } })) };
    engine.update(reopened, undefined);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', completed: 1, total: 1, blocksCompleted: 1 });
    expect(engine.hydrationDiagnostics()).toMatchObject({ queued: 0, running: 0, orphanedHydrationCount: 0 });
    engine.dispose();
  });

  it('adopts an already-culled block when a structural generation re-enters', async () => {
    const provider = rendererBenchmarkVisualProvider();
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 27 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 3, y: Math.floor(index / 9), z: Math.floor(index / 3) % 3 } }));
    const project = { ...base, size: { x: 3, y: 3, z: 3 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration();
    const rendered = (engine as unknown as { renderedBlocks: Map<string, unknown> }).renderedBlocks;
    expect(rendered.has('1,1,1')).toBe(false);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 27, blocksTotal: 27 });

    const generation = engine.hydrationProgress().generation;
    engine.update({ ...project, metadata: { ...project.metadata, name: 'Reopened' } }, undefined);
    await settleHydration();
    expect(engine.hydrationProgress().generation).toBeGreaterThan(generation);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 27, blocksTotal: 27, percent: 100 });
    engine.dispose();
  });

  it('invalidates culling completion when a previously hidden block becomes exposed', async () => {
    const provider = rendererBenchmarkVisualProvider();
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 27 }, (_, index) => ({ ...base.blocks[0], position: { x: index % 3, y: Math.floor(index / 9), z: Math.floor(index / 3) % 3 } }));
    const project = { ...base, size: { x: 3, y: 3, z: 3 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration();
    const edited = { ...project, blocks: blocks.filter((block) => !(block.position.x === 1 && block.position.y === 1 && block.position.z === 0)) };
    engine.update(edited, undefined);
    await settleHydration();
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 26, blocksTotal: 26, percent: 100 });
    const rendered = (engine as unknown as { renderedBlocks: Map<string, unknown> }).renderedBlocks;
    expect(rendered.has('1,1,1')).toBe(true);
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
    expect(initialMaxZ).toBeCloseTo(32);
    expect(expandedInstance.boundingBox!.max.z).toBeCloseTo(32);
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
    expect(engine.rendererCounters().cameraMovementFrames).toBe(12);
    expect(engine.rendererCounters().cameraMovementRenderCalls).toBe(12);
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

  it('adopts visible-group membership as metadata without a structural scan', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const before = rendererBenchmarkProject('small');
    const beforeBlock = before.blocks[0];
    const afterBlock = { ...beforeBlock, groupIds: ['roof'] };
    const after = { ...before, blocks: before.blocks.map((block, index) => index === 0 ? afterBlock : block), groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(before, undefined); await settleHydration();
    const counters = engine.rendererCounters();
    engine.update(after, undefined, {}, metadataMutationHint([{ position: beforeBlock.position, before: beforeBlock, after: afterBlock }], [], 'group-membership'));
    const next = engine.rendererCounters();
    expect(next.fullVisibleScans).toBe(counters.fullVisibleScans);
    expect(next.fullSceneRebuilds).toBe(counters.fullSceneRebuilds);
    expect(next.terrainChunkRebuilds).toBe(counters.terrainChunkRebuilds);
    engine.dispose();
  });

  it('applies group hide/show as a bounded visibility delta', async () => {
    const provider = { create: vi.fn(async () => ({ object: undefined, resolved: { diagnostics: [], support: 'fallback' as const }, mode: 'fallback' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: false, textureDecoded: false, geometryBuilt: false, meshBuilt: false } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const block = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {}, groupIds: ['roof'] };
    const visible = { ...rendererBenchmarkProject('small'), blocks: [block], groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }] };
    const hidden = { ...visible, groups: [{ ...visible.groups[0], visible: false }] };
    const engine = new ThreeViewportEngine(); engine.setVisualProvider(provider); engine.update(visible, undefined); await settleHydration();
    const before = engine.rendererCounters();
    engine.update(hidden, undefined, {}, metadataMutationHint([{ position: block.position, before: block, after: block }], [], 'group-visibility', 'visibility'));
    const afterHide = engine.rendererCounters();
    expect(afterHide.fullVisibleScans).toBe(before.fullVisibleScans);
    expect(afterHide.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    engine.update(visible, undefined, {}, metadataMutationHint([{ position: block.position, before: block, after: block }], [], 'group-visibility', 'visibility'));
    const afterShow = engine.rendererCounters();
    expect(afterShow.fullVisibleScans).toBe(before.fullVisibleScans);
    expect(afterShow.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
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

  it('applies missing-to-resolved content as a bounded incremental delta', async () => {
    const provider = { create: vi.fn(async () => ({ object: new THREE.Group(), resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } })), thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const resolvedBlocks = Array.from({ length: 100 }, (_, index) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: index % 16, y: 0, z: Math.floor(index / 16) }, state: {} }));
    const missingBlocks = Array.from({ length: 20 }, (_, index) => ({ kind: 'missing' as const, id: 'example:marble', namespace: 'example', position: { x: index % 16, y: 1, z: Math.floor(index / 16) }, state: {} }));
    const before = { ...base, blocks: [...resolvedBlocks, ...missingBlocks], decorations: [] };
    const resolvedMissingBlocks = missingBlocks.map((block) => ({ ...block, kind: 'resolved' as const }));
    const after = { ...before, blocks: [...resolvedBlocks, ...resolvedMissingBlocks] };
    const changes = missingBlocks.map((block, index) => ({ position: block.position, before: block, after: resolvedMissingBlocks[index] }));
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(before, undefined);
    await settleHydration(20, engine);
    engine.setMissingBlocksTerminal(true);
    expect(engine.hydrationProgress().finalization?.permanentMissingBlocks).toBe(20);
    const beforeCounters = engine.rendererCounters();
    engine.update(after, undefined, {}, blockMutationHint(changes, 'content-resolution', 'content-resolution'));
    expect(engine.hydrationProgress().finalization?.permanentMissingBlocks).toBe(0);
    await settleHydration(20, engine);
    const counters = engine.rendererCounters();
    expect(counters.incrementalBlockReconciles).toBe(beforeCounters.incrementalBlockReconciles + 1);
    expect(counters.fullSceneRebuilds).toBe(beforeCounters.fullSceneRebuilds);
    expect(counters.fullVisibleScans).toBe(beforeCounters.fullVisibleScans);
    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resolved', id: 'example:marble' }), expect.anything());
    expect(engine.hydrationProgress().finalization).toMatchObject({ expectedBlocks: 120, finalReadyBlocks: 120, permanentMissingBlocks: 0, provisionalMissingBlocks: 0, pendingBlocks: 0 });
    expect(engine.hydrationProgress().lane).toBe('content');
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

describe('group isolation presentation', () => {
  it('disposes replaced block-usage InstancedMeshes without disposing shared resources early', async () => {
    const source = rendererBenchmarkProject('stress');
    const project: ProjectDocument = {
      ...source,
      blocks: source.blocks.map((block) => ({ ...block, id: 'minecraft:stone', state: {} })),
      decorations: [],
    };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    await settleHydration(20, engine);
    const internal = engine as unknown as {
      blockUsageHighlight?: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
      blockUsageHighlightGeometry: THREE.BoxGeometry;
      blockUsageHighlightMaterial: THREE.MeshBasicMaterial;
      blockUsageHighlightCapacity: number;
      scene: THREE.Scene;
    };
    const initial = new THREE.InstancedMesh(internal.blockUsageHighlightGeometry, internal.blockUsageHighlightMaterial, 1);
    internal.blockUsageHighlight = initial;
    internal.blockUsageHighlightCapacity = 0;
    internal.scene.add(initial);
    const geometryDispose = vi.spyOn(internal.blockUsageHighlightGeometry, 'dispose');
    const materialDispose = vi.spyOn(internal.blockUsageHighlightMaterial, 'dispose');
    const positions = project.blocks.map((block) => ({ ...block.position }));
    let current = initial;
    const currentDispose = new Map<THREE.InstancedMesh, ReturnType<typeof vi.spyOn>>();
    for (const size of [100, 2_000, 20_000, 5_000, 20_000]) {
      const previous = current;
      const dispose = currentDispose.get(previous) ?? vi.spyOn(previous, 'dispose');
      currentDispose.set(previous, dispose);
      engine.setBlockUsageHighlight('minecraft:stone', positions.slice(0, size));
      const next = internal.blockUsageHighlight!;
      if (next !== previous) {
        expect(dispose).toHaveBeenCalledTimes(1);
        current = next;
      }
    }
    engine.setBlockUsageHighlight(undefined, undefined);
    expect(currentDispose.get(current)).not.toHaveBeenCalled();
    expect(countObjectsWithUserData(internal.scene, 'blockUsageHighlight')).toBe(1);
    expect(internal.blockUsageHighlight).toBe(current);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    const finalDispose = currentDispose.get(current) ?? vi.spyOn(current, 'dispose');
    currentDispose.set(current, finalDispose);
    engine.dispose();
    expect(finalDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps structural identity and canonical hydration ownership across isolate cycles', () => {
    const base = rendererBenchmarkProject('small');
    const project: ProjectDocument = {
      ...base,
      blocks: base.blocks.slice(0, 2).map((block, index) => ({ ...block, position: { x: index, y: 0, z: 0 }, groupIds: index === 0 ? ['roof'] : [] })),
      groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }],
      decorations: [],
    };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    const internal = engine as unknown as { structureSyncKey: string; hydrationGeneration: number; yLayerProjection: { visibleEntriesByKey: ReadonlyMap<string, unknown> } };
    const beforeKey = internal.structureSyncKey;
    const beforeGeneration = internal.hydrationGeneration;
    const beforeVisibleKeys = [...internal.yLayerProjection.visibleEntriesByKey.keys()];
    const before = engine.rendererCounters();

    engine.update(project, undefined, { isolatedGroupId: 'roof', isolatedGroupPositions: [{ x: 0, y: 0, z: 0 }] });
    expect(internal.structureSyncKey).toBe(beforeKey);
    expect(engine.rendererCounters().fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(engine.rendererCounters().fullReconcileFallbacks).toBe(before.fullReconcileFallbacks);
    expect(engine.rendererCounters().fullVisibleScans).toBe(before.fullVisibleScans);
    expect(internal.hydrationGeneration).toBe(beforeGeneration);
    expect([...internal.yLayerProjection.visibleEntriesByKey.keys()]).toEqual(beforeVisibleKeys);
    expect(engine.isolationDiagnostics()).toMatchObject({ active: true, targetBlocks: 1 });

    engine.update(project, undefined, {});
    expect(internal.structureSyncKey).toBe(beforeKey);
    expect(engine.rendererCounters().fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(engine.rendererCounters().fullReconcileFallbacks).toBe(before.fullReconcileFallbacks);
    expect(engine.rendererCounters().fullVisibleScans).toBe(before.fullVisibleScans);
    expect(internal.hydrationGeneration).toBe(beforeGeneration);
    expect([...internal.yLayerProjection.visibleEntriesByKey.keys()]).toEqual(beforeVisibleKeys);
    expect(engine.isolationDiagnostics()).toMatchObject({ active: false, targetBlocks: 0 });
    engine.dispose();
  });

  it('builds a bounded terrain presentation from canonical records without rebuilding canonical terrain', async () => {
    const base = rendererBenchmarkProject('small');
    const first: PlacedBlock = { ...base.blocks[0], id: 'minecraft:oak_log', position: { x: 1, y: 0, z: 1 }, groupIds: ['roof'] };
    const neighbor: PlacedBlock = { ...base.blocks[1], id: 'minecraft:oak_log', position: { x: 2, y: 0, z: 1 }, groupIds: [] };
    const project: ProjectDocument = { ...base, size: { x: 6, y: 2, z: 6 }, blocks: [first, neighbor], groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }], decorations: [] };
    const engine = new ThreeViewportEngine(undefined, { terrainAtlasMode: 'on' });
    engine.setVisualProvider(axisCubeProvider());
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(40, engine);
    const key = coordinateKey(first.position);
    const beforeOwnership = engine.terrainOwnershipFor(key);
    expect(beforeOwnership).toBeDefined();
    const before = engine.rendererCounters();

    engine.update(project, undefined, { exposedFaceRendering: true, isolatedGroupId: 'roof', isolatedGroupPositions: [first.position] });
    expect(engine.isolationDiagnostics()).toMatchObject({ active: true, targetBlocks: 1, terrainChunks: 1 });
    expect(engine.rendererOwnershipDiagnostics().blockLikeSceneObjectsOutsideBlocksGroup).toBe(0);
    expect(engine.terrainOwnershipFor(key)).toEqual(beforeOwnership);
    expect(engine.rendererCounters().terrainBulkBatches).toBe(before.terrainBulkBatches);

    engine.update(project, undefined, { exposedFaceRendering: true });
    const after = engine.rendererCounters();
    expect(engine.isolationDiagnostics()).toMatchObject({ active: false, targetBlocks: 0 });
    expect(engine.terrainOwnershipFor(key)).toEqual(beforeOwnership);
    expect(after.terrainChunkRebuilds).toBe(before.terrainChunkRebuilds);
    expect(after.terrainBulkBatches).toBe(before.terrainBulkBatches);
    engine.dispose();
  });

  it('disposes temporary isolate presentations across repeated cycles and tolerates double engine teardown', async () => {
    const base = rendererBenchmarkProject('small');
    const project: ProjectDocument = {
      ...base,
      blocks: base.blocks.slice(0, 8).map((block, index) => ({ ...block, position: { x: index, y: 0, z: 0 }, groupIds: ['roof'] })),
      groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }],
      decorations: [],
    };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    const positions = project.blocks.map((block) => ({ ...block.position }));
    for (let cycle = 0; cycle < 20; cycle += 1) {
      engine.update(project, undefined, { isolatedGroupId: 'roof', isolatedGroupPositions: positions });
      engine.update(project, undefined, {});
      await Promise.resolve();
    }
    const isolation = engine.isolationDiagnostics();
    expect(isolation).toMatchObject({ active: false, state: 'inactive', targetBlocks: 0, requestedTargetBlocks: 0, activeTargetBlocks: 0, activeBundleCount: 0, stagingBundleCount: 0 });
    expect(isolation.createdBundleCount).toBe(20);
    expect(isolation.disposeRequestedCount).toBe(20);
    expect(isolation.disposedBundleCount).toBe(20);
    expect(isolation.disposeCount).toBe(20);
    expect(isolation.createdBundleCount).toBe(isolation.activeBundleCount + isolation.stagingBundleCount + isolation.disposedBundleCount);
    engine.dispose();
    engine.dispose();
    expect(engine.diagnostics().disposed).toBe(true);
  });

  it('keeps lightweight isolate disposal bookkeeping bounded across 100 cycles', async () => {
    const canonicalRoot = new THREE.Group();
    const presentation = new GroupIsolationPresentation(canonicalRoot);
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} };

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const key = `cycle-${cycle}`;
      presentation.prepare({ blocks: [{ key, block, standalone: new THREE.Group() }], decorations: [], fluidWorld: { getBlock: () => undefined }, isolateKeys: new Set([key]) });
      presentation.deactivate();
      await Promise.resolve();
    }

    const diagnostics = presentation.diagnostics();
    expect(diagnostics).toMatchObject({ createdBundleCount: 100, disposeRequestedCount: 100, disposedBundleCount: 100, disposeCount: 100, activeBundleCount: 0, stagingBundleCount: 0 });
    expect(diagnostics.createdBundleCount).toBe(diagnostics.disposedBundleCount);
    expect('disposedBundleGenerations' in (presentation as unknown as object)).toBe(false);
    presentation.dispose();
  });

  it('disposes cancelled isolate generations exactly once and never commits stale work', async () => {
    const canonicalRoot = new THREE.Group();
    const presentation = new GroupIsolationPresentation(canonicalRoot);
    const water: PlacedBlock = { kind: 'resolved', id: 'minecraft:water', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { level: '0' } };
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    const makeSnapshot = (provider: { texture: (resource: string) => Promise<THREE.Texture | undefined> }, key: string): GroupIsolationSnapshot => ({
      blocks: [{ key, block: water, fluid: { block: water, state: vanillaFluidRenderResolver.resolve(water)! } }],
      decorations: [],
      fluidProvider: { contractKey: key, resolver: vanillaFluidRenderResolver, texture: provider.texture },
      fluidWorld: { getBlock: () => water },
      isolateKeys: new Set([key]),
    });

    const first = deferred<THREE.Texture | undefined>();
    const firstProvider = { texture: vi.fn(() => first.promise) };
    presentation.prepare(makeSnapshot(firstProvider, 'A'));
    await Promise.resolve();
    presentation.deactivate();
    first.resolve(texture);
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    expect(presentation.diagnostics()).toMatchObject({ state: 'inactive', activeBundleCount: 0, stagingBundleCount: 0, createdBundleCount: 1, disposedBundleCount: 1, disposeCount: 1, commitCount: 0 });

    const secondA = deferred<THREE.Texture | undefined>();
    const secondB = deferred<THREE.Texture | undefined>();
    let calls = 0;
    const secondProvider = { texture: vi.fn(() => (++calls === 1 ? secondA.promise : secondB.promise)) };
    presentation.prepare(makeSnapshot(secondProvider, 'B'));
    await Promise.resolve();
    presentation.prepare(makeSnapshot(secondProvider, 'C'));
    secondA.resolve(texture);
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    expect(presentation.diagnostics()).toMatchObject({ activeBundleCount: 0, stagingBundleCount: 1, createdBundleCount: 3, disposedBundleCount: 2, disposeCount: 2, commitCount: 0 });
    secondB.resolve(texture);
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    expect(presentation.diagnostics()).toMatchObject({ state: 'active', activeBundleCount: 1, stagingBundleCount: 0, disposedBundleCount: 2, commitCount: 1 });
    presentation.dispose();
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    expect(presentation.diagnostics()).toMatchObject({ activeBundleCount: 0, stagingBundleCount: 0, createdBundleCount: 3, disposedBundleCount: 3 });
    texture.dispose();
  });
});

describe('incremental project mutation reconciliation', () => {
  it('keeps an oak-log terrain voxel physically owned across y to x to z to y transitions', async () => {
    const provider = axisCubeProvider();
    const position = { x: 2, y: 2, z: 2 };
    const before: PlacedBlock = { kind: 'resolved', id: 'minecraft:oak_log', namespace: 'minecraft', position, state: { axis: 'y' } };
    const engine = new ThreeViewportEngine(undefined, { terrainAtlasMode: 'on' });
    engine.setVisualProvider(provider);
    let currentBlock = before;
    let project: ProjectDocument = { ...rendererBenchmarkProject('small'), blocks: [currentBlock], decorations: [] };
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(40, engine);
    const key = coordinateKey(position);
    expect(engine.terrainOwnershipFor(key)).toBeDefined();
    for (const axis of ['x', 'z', 'y'] as const) {
      const after = { ...currentBlock, state: { axis } };
      const next = { ...project, blocks: [after] };
      engine.update(next, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: currentBlock, after }], 'state-edit'));
      await settleHydration(40, engine);
      expect(engine.terrainOwnershipFor(key)).toBeDefined();
      expect(engine.visibleSceneDiagnostics().representedVoxelKeys).toContain(key);
      (engine as unknown as { render: () => void }).render();
      expect(engine.terrainOwnershipFor(key)).toBeDefined();
      project = next;
      currentBlock = after;
    }
    engine.dispose();
  });

  it('keeps a stone delete/undo/redo transition represented across later renders', async () => {
    const provider = axisCubeProvider();
    const position = { x: 1, y: 1, z: 1 };
    const stone: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} };
    const engine = new ThreeViewportEngine(undefined, { terrainAtlasMode: 'on' });
    engine.setVisualProvider(provider);
    const base = { ...rendererBenchmarkProject('small'), decorations: [] };
    const present = { ...base, blocks: [stone] };
    const absent = { ...base, blocks: [] };
    const key = coordinateKey(position);
    engine.update(present, undefined, { exposedFaceRendering: true });
    await settleHydration(40, engine);
    expect(engine.terrainOwnershipFor(key)).toBeDefined();
    engine.update(absent, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: stone, after: undefined }], 'delete'));
    expect(engine.terrainOwnershipFor(key)).toBeUndefined();
    engine.update(present, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: undefined, after: stone }], 'undo'));
    await settleHydration(40, engine);
    expect(engine.terrainOwnershipFor(key)).toBeDefined();
    (engine as unknown as { render: () => void }).render();
    expect(engine.terrainOwnershipFor(key)).toBeDefined();
    engine.update(absent, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: stone, after: undefined }], 'redo'));
    expect(engine.terrainOwnershipFor(key)).toBeUndefined();
    engine.update(present, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: undefined, after: stone }], 'undo'));
    await settleHydration(40, engine);
    (engine as unknown as { render: () => void }).render();
    expect(engine.terrainOwnershipFor(key)).toBeDefined();
    engine.dispose();
  });

  it('keeps fallback ownership when a local terrain chunk commit is rejected', async () => {
    const provider = axisCubeProvider('fallback', false);
    const blocks = [0, 1].map((x) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 1, z: 1 }, state: {} }));
    const engine = new ThreeViewportEngine(undefined, { terrainAtlasMode: 'on', terrainShouldCommitChunk: () => false });
    engine.setVisualProvider(provider);
    const project = { ...rendererBenchmarkProject('small'), blocks, decorations: [] };
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(40, engine);
    const internal = engine as unknown as { renderedBlocks: Map<string, { terrainChunkKey?: string }> };
    expect(engine.terrainOwnershipFor(coordinateKey(blocks[0].position))).toBeUndefined();
    expect(engine.terrainOwnershipFor(coordinateKey(blocks[1].position))).toBeUndefined();
    expect([...internal.renderedBlocks.values()].every((entry) => entry.terrainChunkKey === undefined)).toBe(true);
    expect(engine.performanceEvidence().staticModelBatchedMembers).toBe(blocks.length);
    expect(engine.visibleSceneDiagnostics().representedVoxelKeys).toEqual(expect.arrayContaining(blocks.map((block) => coordinateKey(block.position))));
    engine.dispose();
  });

  it('re-enters an existing static batch after an incremental local edit', async () => {
    const base = rendererBenchmarkProject('small');
    const before = { ...base, blocks: base.blocks.slice(0, 256), decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(axisCubeProvider());
    engine.update(before, undefined);
    await settleHydration(100, engine);
    const changed = { ...before.blocks[0], state: { axis: 'x' } };
    const after = { ...before, blocks: before.blocks.map((block, index) => index === 0 ? changed : block) };
    engine.update(after, undefined, {}, blockMutationHint([{ position: changed.position, before: before.blocks[0], after: changed }], 'state-edit'));
    await settleHydration(100, engine);
    expect(engine.performanceEvidence().staticModelBatchedMembers).toBe(after.blocks.length);
    expect(engine.performanceEvidence().standaloneBlockObjects).toBe(0);
    engine.dispose();
  });

  it('updates a hinted local voxel without a full visible scan or spatial-index rebuild', () => {
    const engine = new ThreeViewportEngine();
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 8), decorations: [] };
    engine.update(project, undefined, { exposedFaceRendering: true });
    const beforeCounters = engine.rendererCounters();
    const before = project.blocks[0];
    const after = { ...before, state: { ...before.state, powered: 'true' } };
    const next = { ...project, blocks: project.blocks.map((block, index) => index === 0 ? after : block) };
    engine.update(next, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position: before.position, before, after }], 'state-edit'));
    const counters = engine.rendererCounters();
    expect(counters.fullSceneRebuilds).toBe(beforeCounters.fullSceneRebuilds);
    expect(counters.fullVisibleScans).toBe(beforeCounters.fullVisibleScans);
    expect(counters.spatialIndexBuilds).toBe(beforeCounters.spatialIndexBuilds);
    expect(counters.incrementalBlockReconciles).toBe(beforeCounters.incrementalBlockReconciles + 1);
    expect(counters.incrementalChangedVoxels).toBeGreaterThan(0);
    const spatialIndex = (engine as unknown as { spatialIndex: { get: (position: VoxelCoordinate) => PlacedBlock | undefined } }).spatialIndex;
    expect(spatialIndex.get(before.position)).toEqual(after);
    engine.dispose();
  });

  it('keeps a stale structural terrain promise in the local lane after an edit', async () => {
    const requests = [deferred<Awaited<ReturnType<BlockVisualProvider['create']>>>(), deferred<Awaited<ReturnType<BlockVisualProvider['create']>>>()];
    let requestIndex = 0;
    const provider = {
      reusableVisualKey: (block: PlacedBlock) => `state-${block.state['axis'] ?? 'y'}`,
      occlusionClass: () => 'opaque-full-cube',
      create: vi.fn(() => (requests[requestIndex++] ?? requests[1]).promise),
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const position = { x: 1, y: 1, z: 1 };
    const before = { ...base, blocks: [{ ...base.blocks[0], position, state: { axis: 'y' } }], decorations: [] };
    const afterBlock = { ...before.blocks[0], state: { axis: 'x' } };
    const after = { ...before, blocks: [afterBlock] };
    const engine = new ThreeViewportEngine(undefined, { terrainAtlasMode: 'on' });
    engine.setVisualProvider(provider);
    engine.update(before, undefined, { exposedFaceRendering: true });
    await Promise.resolve();
    engine.update(after, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position, before: before.blocks[0], after: afterBlock }], 'state-edit'));
    expect(engine.hydrationProgress().lane).toBe('local');

    requests[0].resolve({ object: new THREE.Group(), resolved: { diagnostics: [], support: 'full' }, mode: 'real', diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } } as unknown as Awaited<ReturnType<BlockVisualProvider['create']>>);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.hydrationProgress().lane).toBe('local');
    engine.dispose();
  });

  it('keeps a 100k local mutation on the bounded incremental path', () => {
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 10; y += 1) for (let z = 0; z < 100; z += 1) for (let x = 0; x < 100; x += 1) blocks.push({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const project = { ...rendererBenchmarkProject('small'), id: 'hint-100k', size: { x: 100, y: 10, z: 100 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    engine.update(project, undefined);
    const beforeCounters = engine.rendererCounters();
    const before = blocks[50_000];
    const after = { ...before, state: { powered: 'true' } };
    const next = { ...project, blocks: blocks.map((block, index) => index === 50_000 ? after : block) };
    engine.update(next, undefined, {}, blockMutationHint([{ position: before.position, before, after }], '100k-local'));
    const counters = engine.rendererCounters();
    expect(counters.fullVisibleScans).toBe(beforeCounters.fullVisibleScans);
    expect(counters.spatialIndexBuilds).toBe(beforeCounters.spatialIndexBuilds);
    expect(counters.fullSceneRebuilds).toBe(beforeCounters.fullSceneRebuilds);
    expect(counters.occupancyFullRebuilds).toBe(beforeCounters.occupancyFullRebuilds);
    expect(counters.incrementalBlockReconciles).toBe(beforeCounters.incrementalBlockReconciles + 1);
    engine.dispose();
  }, 30_000);
});

describe('reusable instance template compilation', () => {
  it('merges six compatible cube face parts into one template without losing geometry attributes', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0x8f6b3f });
    const templates = cubeFaceTemplates([material, material, material, material, material, material]);
    const diagnostics = new RendererDiagnostics();
    const compiled = compileInstanceTemplates(templates, diagnostics);
    expect(compiled.templates).toHaveLength(1);
    expect(diagnostics.snapshot()).toMatchObject({ rawInstanceTemplateParts: 6, mergedInstanceTemplateParts: 1, templateMergeOperations: 1, templatePartsEliminated: 5 });
    const geometry = compiled.templates[0].geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeCloseTo(0); expect(geometry.boundingBox?.min.y).toBeCloseTo(0); expect(geometry.boundingBox?.min.z).toBeCloseTo(0);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(1); expect(geometry.boundingBox?.max.y).toBeCloseTo(1); expect(geometry.boundingBox?.max.z).toBeCloseTo(1);
    expect(geometry.getAttribute('position').count).toBe(36);
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.getAttribute('uv')).toBeDefined();
    disposeTemplateFixture(templates, compiled.templates, material);
  });

  it('keeps three compatible material groups separate while merging within each group', () => {
    const materials = [new THREE.MeshBasicMaterial({ color: 0x8f6b3f }), new THREE.MeshBasicMaterial({ color: 0x4f8f38 }), new THREE.MeshBasicMaterial({ color: 0xd8d0b8 })];
    const compiled = compileInstanceTemplates(cubeFaceTemplates([materials[0], materials[1], materials[2], materials[0], materials[1], materials[2]]));
    expect(compiled.templates).toHaveLength(3);
    expect(compiled.templates.every((template) => template.ownsGeometry)).toBe(true);
    disposeTemplateFixture([], compiled.templates, ...materials);
  });

  it('does not merge transparent or depth-disabled material groups with opaque parts', () => {
    const opaque = new THREE.MeshBasicMaterial({ color: 0x8f6b3f });
    const transparent = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const compiled = compileInstanceTemplates(cubeFaceTemplates([opaque, opaque, opaque, opaque, opaque, transparent]));
    expect(compiled.templates).toHaveLength(2);
    disposeTemplateFixture([], compiled.templates, opaque, transparent);
  });
});

describe('3D exposed surface batches', () => {
  it('keeps voxel ownership and explicit face direction for surface picking', () => {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 1);
    mesh.userData['surfaceFaceBatch'] = true;
    mesh.userData['instanceVoxels'] = [{ x: 4, y: 5, z: 6 }];
    mesh.userData['instanceFaceDirections'] = ['north'];
    const hit = { object: mesh, instanceId: 0 } as unknown as THREE.Intersection;
    expect(blockCoordinateFromHit(hit)).toEqual({ x: 4, y: 5, z: 6 });
    expect(surfaceFaceDirectionFromHit(hit)).toBe('north');
    expect(surfaceFaceNormal('north').toArray()).toEqual([0, 0, -1]);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });

  it('renders only exposed faces and reveals the neighbor face after deletion across a chunk boundary', async () => {
    const base = rendererBenchmarkProject('small');
    const stone = (x: number) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state: {} });
    const project = { ...base, size: { x: 32, y: 1, z: 1 }, blocks: [stone(15), stone(16)], decorations: [] };
    const engine = new ThreeViewportEngine();
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration();
    const initialEvidence = engine.performanceEvidence();
    expect(initialEvidence).toMatchObject({ terrainChunks: 2, terrainChunkMeshes: 2, terrainLogicalBlocks: 2, terrainTemplateResolutions: 1, providerObjectCreations: 1, surfaceFaceBatches: 0, surfaceFaceInstancedMeshes: 0 });
    expect(initialEvidence.terrainFacesEmitted).toBeGreaterThanOrEqual(10);
    expect(initialEvidence.terrainFacesCulled).toBeGreaterThanOrEqual(2);
    const blocksGroup = (engine as unknown as { blocksGroup: THREE.Group }).blocksGroup;
    const emittedFaces = () => blocksGroup.children.filter((child) => child.userData['terrainChunk']).reduce((total, child) => total + Number(child.userData['terrainFaces'] ?? 0), 0);
    expect(emittedFaces()).toBe(10);
    const afterDelete = { ...project, blocks: [stone(16)] };
    engine.update(afterDelete, undefined, { exposedFaceRendering: true });
    await settleHydration();
    const finalEvidence = engine.performanceEvidence();
    expect(finalEvidence).toMatchObject({ terrainChunks: 1, terrainChunkMeshes: 1, terrainLogicalBlocks: 1, surfaceFaceBatches: 0 });
    expect(finalEvidence.terrainFacesEmitted).toBeGreaterThanOrEqual(initialEvidence.terrainFacesEmitted + 6);
    expect(emittedFaces()).toBe(6);
    engine.dispose();
    provider.dispose();
  });

  it('ingests a homogeneous 100k terrain scene by signature instead of voxel hydration jobs', async () => {
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 10; y += 1) for (let z = 0; z < 100; z += 1) for (let x = 0; x < 100; x += 1) blocks.push({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const project = { ...rendererBenchmarkProject('small'), id: 'terrain-100k', size: { x: 100, y: 10, z: 100 }, blocks, decorations: [] };
    const provider = rendererBenchmarkVisualProvider();
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(provider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(80, engine);
    const evidence = engine.performanceEvidence();
    expect(evidence.terrainLogicalBlocks).toBe(100_000);
    expect(evidence.terrainChunks).toBe(49);
    expect(evidence.terrainChunkRebuilds).toBeLessThanOrEqual(60);
    expect(evidence.terrainTemplateResolutions).toBe(1);
    expect(evidence.terrainBulkBatches).toBe(1);
    expect(engine.rendererCounters().providerObjectCreations).toBe(1);
    expect(engine.hydrationDiagnostics().queued).toBe(0);
    expect(evidence.terrainFacesEmitted).toBe(24_000);
    const blocksGroup = (engine as unknown as { blocksGroup: THREE.Group }).blocksGroup;
    const triangles = blocksGroup.children.filter((child) => child.userData['terrainChunk']).reduce((total, child) => total + ((child as THREE.Mesh).geometry.getAttribute('position')?.count ?? 0) / 3, 0);
    expect(triangles).toBe(48_000);
    engine.dispose();
    provider.dispose();
  }, 30_000);
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

  it('re-enters static batching when a provider refresh is queued with instancing disabled', async () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 256), decorations: [] };
    const engine = new ThreeViewportEngine();
    const firstProvider = axisCubeProvider('provider-a');
    const secondProvider = axisCubeProvider('provider-b');
    engine.setVisualProvider(firstProvider);
    engine.update(project, undefined);
    await settleHydration(100, engine);
    engine.setVisualProvider(secondProvider);
    await settleHydration(100, engine);
    expect(engine.performanceEvidence().staticModelBatchedMembers).toBe(project.blocks.length);
    expect(engine.performanceEvidence().standaloneBlockObjects).toBe(0);
    engine.dispose();
  });

  it('keeps keyed terrain and logical progress intact across a live provider handoff', async () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: base.blocks.slice(0, 32), decorations: [] };
    const firstProvider = rendererBenchmarkVisualProvider();
    const secondProvider = rendererBenchmarkVisualProvider();
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(firstProvider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(40, engine);
    const before = engine.rendererCounters();
    const progress = engine.hydrationProgress();
    const evidence = engine.performanceEvidence();

    engine.setVisualProvider(secondProvider);
    await settleHydration(40, engine);

    const after = engine.rendererCounters();
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(after.fullReconcileFallbacks).toBe(before.fullReconcileFallbacks);
    expect(after.hydrationGenerations).toBe(before.hydrationGenerations);
    expect(engine.hydrationProgress().blocksCompleted).toBeGreaterThanOrEqual(progress.blocksCompleted);
    expect(engine.performanceEvidence().terrainBulkBatches).toBe(evidence.terrainBulkBatches);
    expect(engine.visibleSceneDiagnostics().renderedVoxelCount + engine.visibleSceneDiagnostics().placeholderVoxelCount).toBe(project.blocks.length);
    engine.dispose();
    firstProvider.dispose();
    secondProvider.dispose();
  });

  it('keeps fluids chunk-owned across provider replacement and completes their hydration', async () => {
    const texture = new THREE.DataTexture(new Uint8Array([80, 140, 220, 255]), 1, 1); texture.needsUpdate = true;
    const makeProvider = (contractKey: string) => ({
      create: vi.fn(async () => resolvedVisual()),
      fluidRenderContractKey: contractKey,
      fluidRenderResolver: vanillaFluidRenderResolver,
      fluidTexture: async () => texture,
      thumbnailUrl: () => undefined,
    }) as unknown as BlockVisualProvider;
    const base = rendererBenchmarkProject('small');
    const blocks: PlacedBlock[] = [0, 1, 16].map((x) => ({ kind: 'resolved', id: 'minecraft:water', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state: { level: '0' } }));
    const project = { ...base, size: { x: 17, y: 1, z: 1 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    const providerA = makeProvider('fluid-A');
    engine.setVisualProvider(providerA);
    engine.update(project, undefined);
    await settleHydration(200, engine);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 3, total: 3, percent: 100 });
    expect(engine.runtimeTraceSample().fluids).toMatchObject({ fluidDetectedVoxels: 3, fluidCommittedVoxels: 3, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0, fluidStandaloneMeshes: 0 });
    const providerB = makeProvider('fluid-B');
    engine.setVisualProvider(providerB);
    await settleHydration(200, engine);
    expect(providerB.create).not.toHaveBeenCalled();
    expect(engine.runtimeTraceSample().fluids).toMatchObject({ fluidDetectedVoxels: 3, fluidCommittedVoxels: 3, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0, fluidStandaloneMeshes: 0 });
    expect(engine.performanceEvidence().standaloneBlockObjects).toBe(0);
    engine.dispose(); texture.dispose();
  });

  it('terminates fluid ownership with placeholders when the provider is removed', async () => {
    const texture = new THREE.DataTexture(new Uint8Array([80, 140, 220, 255]), 1, 1); texture.needsUpdate = true;
    const base = rendererBenchmarkProject('small');
    const blocks: PlacedBlock[] = [0, 1].map((x) => ({ kind: 'resolved', id: 'minecraft:water', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state: { level: '0' } }));
    const project = { ...base, size: { x: 2, y: 1, z: 1 }, blocks, decorations: [] };
    const engine = new ThreeViewportEngine();
    const provider = {
      create: vi.fn(async () => resolvedVisual()),
      fluidRenderContractKey: 'fluid-removal',
      fluidRenderResolver: vanillaFluidRenderResolver,
      fluidTexture: async () => texture,
      thumbnailUrl: () => undefined,
    } as unknown as BlockVisualProvider;
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration(200, engine);
    engine.setVisualProvider(undefined);
    await settleHydration(200, engine);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 2, total: 2, percent: 100 });
    expect(engine.runtimeTraceSample().fluids).toMatchObject({ fluidDetectedVoxels: 0, fluidLogicalVoxels: 0, fluidChunks: 0, fluidOrphanedLogicalCount: 0, fluidStandaloneMeshes: 0 });
    expect(provider.create).not.toHaveBeenCalled();
    engine.dispose(); texture.dispose();
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
    await new Promise((resolve) => setTimeout(resolve, 190));
    await settleHydration();
    expect(engine.hydrationDiagnostics().generation).toBe(generation);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksCompleted: 7 });
    expect(engine.rendererCounters().hydrationPausesForCamera).toBe(0);
    expect(engine.rendererCounters().hydrationJobsStartedWhileCamera).toBeGreaterThan(0);
    engine.dispose();
  });

  it('reports logical block totals when terrain candidates share one reusable signature', async () => {
    const base = rendererBenchmarkProject('small');
    const blocks = Array.from({ length: 100 }, (_, index) => ({
      ...base.blocks[0],
      id: 'minecraft:stone',
      position: { x: index % 10, y: Math.floor(index / 100), z: Math.floor(index / 10) },
    }));
    const engine = new ThreeViewportEngine();
    engine.setVisualProvider(rendererBenchmarkVisualProvider());
    engine.update({ ...base, size: { x: 10, y: 1, z: 10 }, blocks, decorations: [] }, undefined, { exposedFaceRendering: true });
    await settleHydration(100, engine);
    expect(engine.hydrationProgress()).toMatchObject({ status: 'complete', blocksTotal: 100, blocksCompleted: 100, total: 100, completed: 100 });
    expect(engine.performanceEvidence().terrainLogicalBlocks).toBe(100);
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

  it('changes whole-structure Y-layer roles through a bounded layer delta', async () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('stress');
    const byY = new Map<number, PlacedBlock[]>();
    for (const block of project.blocks) (byY.get(block.position.y) ?? (byY.set(block.position.y, []), byY.get(block.position.y)!)).push(block);
    const layerIndex = { blocksAtY: (y: number) => byY.get(y) ?? [], occupiedLayers: () => [...byY.keys()].sort((left, right) => left - right), allBlocks: () => project.blocks };
    engine.setLayerIndex(layerIndex);
    const options = { layerY: 0, visibility: 'whole-structure' as const, exposedFaceRendering: true };
    engine.update(project, undefined, options);
    const before = engine.rendererCounters();
    const next = { ...project, editorSettings: { ...project.editorSettings, currentY: 1 } };
    engine.update(next, undefined, { ...options, layerY: 1 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = engine.rendererCounters();
    expect(after.fullVisibleScans).toBe(before.fullVisibleScans);
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(after.structuralReconciles).toBe(before.structuralReconciles);
    expect(after.incrementalBlockReconciles).toBe(before.incrementalBlockReconciles);
    expect(after.yLayerProjectionCommits).toBe(before.yLayerProjectionCommits + 1);
    expect(after.yLayerProjectionChangedBlocks - before.yLayerProjectionChangedBlocks).toBe(8192);
    expect(after.blockSignatureComputations - before.blockSignatureComputations).toBe(8192);
    expect(after.yLayerProjectionMaxCommitMs).toBeGreaterThanOrEqual(0);
    engine.dispose();
  });

  it('coalesces rapid whole-structure Y-layer requests and commits only the latest projection', async () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    const options = { layerY: 0, visibility: 'whole-structure' as const };
    engine.update(project, undefined, options);
    const before = engine.rendererCounters();

    engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 1 } }, undefined, { ...options, layerY: 1 });
    engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 2 } }, undefined, { ...options, layerY: 2 });
    engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 3 } }, undefined, { ...options, layerY: 3 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const after = engine.rendererCounters();
    expect(after.yLayerProjectionRequests).toBe(before.yLayerProjectionRequests + 3);
    expect(after.yLayerProjectionRequestsCoalesced).toBe(before.yLayerProjectionRequestsCoalesced + 2);
    expect(after.yLayerProjectionCommits).toBe(before.yLayerProjectionCommits + 1);
    expect(after.incrementalBlockReconciles).toBe(before.incrementalBlockReconciles);
    engine.dispose();
  });

  it('reports projection activity until changed Y-layer ownership settles', async () => {
    const engine = new ThreeViewportEngine();
    const states: string[] = [];
    const unsubscribe = engine.onProjectionActivity((state) => states.push(state.activity));
    const project = rendererBenchmarkProject('small');
    const options = { layerY: 0, visibility: 'whole-structure' as const };

    engine.update(project, undefined, options);
    engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 1 } }, undefined, { ...options, layerY: 1 });
    expect(engine.projectionActivity().activity).toBe('applying');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(states).toContain('applying');
    expect(states).toContain('settling');
    expect(engine.projectionActivity().activity).toBe('idle');
    unsubscribe();
    engine.dispose();
  });

  it('moves only the existing Y-layer guides for a preview value', () => {
    const engine = new ThreeViewportEngine();
    const project = rendererBenchmarkProject('small');
    engine.update(project, undefined, { layerY: 0, visibility: 'whole-structure' });
    const before = engine.rendererCounters();
    const internals = engine as unknown as { editingPlane?: THREE.Mesh; editingGrid?: THREE.LineSegments };

    engine.setEditingPlanePreviewY(5);

    expect(internals.editingPlane?.position.y).toBeCloseTo(5.002);
    expect(internals.editingGrid?.position.y).toBeCloseTo(5.004);
    const after = engine.rendererCounters();
    expect(after.yLayerProjectionRequests).toBe(before.yLayerProjectionRequests);
    expect(after.regularHydrationStarted).toBe(before.regularHydrationStarted);
    engine.dispose();
  });

  it('updates reference opacity without structural or hydration work', () => {
    const engine = new ThreeViewportEngine();
    const base = rendererBenchmarkProject('small');
    const project = { ...base, editorSettings: { ...base.editorSettings, layerVisibility: 'whole-structure' as const, currentY: 0, referenceLayerOpacity: .28 } };
    engine.update(project, undefined, { layerY: 0, visibility: 'whole-structure', referenceOpacity: .28 });
    const before = engine.rendererCounters();
    const generation = engine.hydrationDiagnostics().generation;
    const next = { ...project, editorSettings: { ...project.editorSettings, referenceLayerOpacity: .45 } };
    engine.update(next, undefined, { layerY: 0, visibility: 'whole-structure', referenceOpacity: .45 });
    const after = engine.rendererCounters();
    const internals = engine as unknown as { fallbackMaterials: { reference: THREE.MeshLambertMaterial }; placeholderMaterials: { reference: THREE.MeshBasicMaterial } };
    expect(after.structuralReconciles).toBe(before.structuralReconciles);
    expect(after.fullSceneRebuilds).toBe(before.fullSceneRebuilds);
    expect(engine.hydrationDiagnostics().generation).toBe(generation);
    expect(internals.fallbackMaterials.reference.opacity).toBe(.45);
    expect(internals.placeholderMaterials.reference.opacity).toBe(.45);
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

function cubeFaceTemplates(materials: readonly THREE.Material[]): readonly InstancePartTemplate[] {
  const transforms = [
    new THREE.Matrix4().setPosition(.5, .5, 1),
    new THREE.Matrix4().makeRotationY(Math.PI).setPosition(.5, .5, 0),
    new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(.5, 1, .5),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(.5, 0, .5),
    new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(1, .5, .5),
    new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0, .5, .5),
  ];
  return transforms.map((matrix, index) => ({ geometry: new THREE.PlaneGeometry(1, 1), material: materials[index], matrix }));
}

function axisCubeProvider(keyPrefix = 'oak-log', fullCubeFaces = true): BlockVisualProvider {
  const directions = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
  const transforms = [
    new THREE.Matrix4().setPosition(.5, .5, 1),
    new THREE.Matrix4().makeRotationY(Math.PI).setPosition(.5, .5, 0),
    new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(.5, 1, .5),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(.5, 0, .5),
    new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(1, .5, .5),
    new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0, .5, .5),
  ];
  return {
    reusableVisualKey: (block: PlacedBlock) => `${keyPrefix}-${String(block.state['axis'] ?? 'y')}`,
    occlusionClass: () => 'opaque-full-cube',
    thumbnailUrl: () => undefined,
    create: async () => {
      const object = new THREE.Group();
      if (fullCubeFaces) directions.forEach((direction, index) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x887766 }));
        mesh.applyMatrix4(transforms[index]);
        mesh.userData['face'] = direction;
        mesh.userData['cullface'] = direction;
        object.add(mesh);
      });
      else object.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x887766 })));
      return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
    },
  } as unknown as BlockVisualProvider;
}

function disposeTemplateFixture(raw: readonly InstancePartTemplate[], compiled: readonly InstancePartTemplate[], ...materials: readonly THREE.Material[]): void {
  const geometries = new Set([...raw, ...compiled].map((template) => template.geometry));
  for (const geometry of geometries) geometry.dispose();
  for (const material of new Set(materials)) material.dispose();
}

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

function countObjectsWithUserData(root: THREE.Object3D, key: string): number {
  let count = 0;
  root.traverse((object) => { if (object.userData[key] === true) count += 1; });
  return count;
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

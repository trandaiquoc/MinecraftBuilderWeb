import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  clampVoxelBox,
  exposedSurfaceSelectionSeeds,
  faceLockedSelectionPlane,
  normalizeVoxelBox,
  voxelBoxSize,
  voxelInBox,
  voxelOnFaceLockedPlane,
} from './selection';
import { SelectionService } from './selection.service';
import { rendererBenchmarkProject } from '../../renderer/benchmark/renderer-benchmark-fixtures';
import { ProjectBlockRuntimeIndex } from '../runtime/project-block-runtime-index';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { createBlockVisibilityPredicate } from '../viewport/visible-blocks';
import { HistoryService } from '../history/history.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { SelectionOverlayPresenter } from '../../renderer/presentation/selection-overlay-presenter';
import { selectionFocusBounds } from '../../renderer/presentation/selection-bounds';
import { viewportThemePalette } from '../../renderer/engine/viewport-theme';
import { createScreenSpaceMarqueeQuery } from '../../renderer/interaction/screen-space-marquee-selection';

describe('voxel box selection', () => {
  it('normalizes inclusive integer corners and counts its size', () => {
    const box = normalizeVoxelBox({ x: 4.8, y: 3.2, z: 8.9 }, { x: 1.1, y: 5.7, z: 2.4 });
    expect(box).toEqual({ min: { x: 1, y: 3, z: 2 }, max: { x: 4, y: 5, z: 8 } });
    expect(voxelBoxSize(box)).toEqual({ x: 4, y: 3, z: 7 });
    expect(voxelInBox({ x: 4, y: 5, z: 8 }, box)).toBe(true);
  });

  it('clamps box bounds to project dimensions', () => {
    expect(
      clampVoxelBox(normalizeVoxelBox({ x: -3, y: 1, z: 2 }, { x: 8, y: 9, z: 20 }), {
        x: 4,
        y: 5,
        z: 6,
      }),
    ).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 3, y: 4, z: 5 } });
  });

  it('locks a 3D drag to the starting face and keeps integer coordinates', () => {
    const plane = faceLockedSelectionPlane({ x: 2, y: 3, z: 4 }, { x: 0, y: 1, z: 0 });
    expect(plane).toEqual({ axis: 'y', coordinate: 4, normal: { x: 0, y: 1, z: 0 } });
    expect(voxelOnFaceLockedPlane({ x: 5.9, y: 4, z: 1.2 }, plane!)).toEqual({ x: 5, y: 3, z: 1 });
    const side = faceLockedSelectionPlane({ x: 2, y: 3, z: 4 }, { x: -1, y: 0, z: 0 });
    expect(side).toEqual({ axis: 'x', coordinate: 2, normal: { x: -1, y: 0, z: 0 } });
    expect(voxelOnFaceLockedPlane({ x: 2, y: 6.8, z: 7.1 }, side!)).toEqual({ x: 2, y: 6, z: 7 });
  });

  it('selects voxel geometry under a screen rectangle across depth with no 3D gesture box', () => {
    const base = rendererBenchmarkProject('small');
    const blocks = [
      { ...base.blocks[0], position: { x: 8, y: 0, z: 8 } },
      { ...base.blocks[0], position: { x: 8, y: 28, z: 8 } },
      { ...base.blocks[0], position: { x: 0, y: 28, z: 0 } },
    ];
    const project = { ...base, size: { x: 16, y: 32, z: 16 }, blocks };
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(8, 64, 8);
    camera.up.set(0, 0, -1);
    camera.lookAt(8, 24, 8);
    camera.updateMatrixWorld(true);
    const viewport = { width: 400, height: 400 };
    const point = new THREE.Vector3(8.5, 0.5, 8.5).project(camera);
    const center = {
      x: ((point.x + 1) / 2) * viewport.width,
      y: ((1 - point.y) / 2) * viewport.height,
    };
    const query = createScreenSpaceMarqueeQuery(
      camera,
      viewport,
      { left: center.x - 15, top: center.y - 15, width: 30, height: 30 },
      project.size,
    );
    expect(query).toBeDefined();

    const selection = new SelectionService();
    selection.selectMarqueeLogical(query, project, () => undefined);

    expect(selection.selectedBlocks(project).map((block) => block.position)).toEqual([
      { x: 8, y: 0, z: 8 },
      { x: 8, y: 28, z: 8 },
    ]);
    expect(selection.count(project)).toBe(2);
    const bounds = {
      min: { x: 8, y: 0, z: 8 },
      max: { x: 8, y: 28, z: 8 },
    };
    expect(selection.bounds(project)).toEqual(bounds);
    expect(selection.renderState(project)).toMatchObject({ count: 2, bounds });
    expect(selection.box()).toBeUndefined();
    expect(selectionFocusBounds(selection.bounds(project), selection.box())).toEqual({
      min: bounds.min,
      max: { x: 9, y: 29, z: 9 },
    });

    const renderState = selection.renderState(project);
    const overlay = new SelectionOverlayPresenter(
      new THREE.Scene(),
      viewportThemePalette('dark'),
      256,
    );
    overlay.update({
      kind: renderState.kind,
      count: renderState.count,
      selectedPositions: renderState.positions,
      aggregateBounds: renderState.bounds,
      box: selection.box(),
    });
    expect(overlay.selectionBox.visible).toBe(false);
    expect(overlay.logicalSelectionGroup.children.map((child) => child.position.toArray())).toEqual(
      [
        [8.5, 0.5, 8.5],
        [8.5, 28.5, 8.5],
      ],
    );
    overlay.dispose();
  });

  it('applies hidden-group and isolation visibility before selecting screen-space seeds', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 4, y: 1, z: 1 },
      groups: [
        { id: 'hidden', name: 'Hidden', visible: false, locked: false },
        { id: 'locked', name: 'Locked', visible: true, locked: true },
        { id: 'active', name: 'Active', visible: true, locked: false },
      ],
      blocks: [
        {
          ...base.blocks[0],
          id: 'example:hidden',
          position: { x: 0, y: 0, z: 0 },
          groupIds: ['hidden'],
        },
        {
          ...base.blocks[0],
          id: 'example:locked',
          position: { x: 1, y: 0, z: 0 },
          groupIds: ['locked'],
        },
        {
          ...base.blocks[0],
          id: 'example:active',
          position: { x: 2, y: 0, z: 0 },
          groupIds: ['active'],
        },
        {
          ...base.blocks[0],
          id: 'example:ungrouped',
          position: { x: 3, y: 0, z: 0 },
          groupIds: [],
        },
      ],
    };
    const query = {
      candidateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } },
      intersectsVoxel: () => true,
    };
    const selection = new SelectionService();

    selection.selectMarqueeLogical(
      query,
      project,
      () => undefined,
      createBlockVisibilityPredicate(project),
    );
    expect(selection.selectedBlocks(project).map((block) => block.id)).toEqual([
      'example:locked',
      'example:active',
      'example:ungrouped',
    ]);

    selection.selectMarqueeLogical(
      query,
      project,
      () => undefined,
      createBlockVisibilityPredicate(project, {
        isolatedGroupId: 'active',
        isolatedGroupPositions: [project.blocks[2].position],
      }),
    );
    expect(selection.selectedBlocks(project).map((block) => block.id)).toEqual(['example:active']);
  });

  it('keeps logical-object closure when only one visible door half intersects the marquee', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 4, y: 4, z: 4 },
      blocks: [
        {
          ...base.blocks[0],
          id: 'example:door',
          position: { x: 2, y: 1, z: 1 },
          state: { half: 'lower' },
        },
        {
          ...base.blocks[0],
          id: 'example:door',
          position: { x: 2, y: 2, z: 1 },
          state: { half: 'upper' },
        },
      ],
    };
    const door = {
      behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true },
    } as BlockDefinition;
    const selection = new SelectionService();

    selection.selectMarqueeLogical(
      {
        candidateBounds: { min: { x: 2, y: 1, z: 1 }, max: { x: 2, y: 2, z: 1 } },
        intersectsVoxel: ({ y }) => y === 1,
      },
      project,
      (id) => (id === 'example:door' ? door : undefined),
      (block) => block.state['half'] === 'lower',
    );

    expect(
      selection.selectedBlocks(project).map(({ state, position }) => ({ state, position })),
    ).toEqual([
      { state: { half: 'lower' }, position: { x: 2, y: 1, z: 1 } },
      { state: { half: 'upper' }, position: { x: 2, y: 2, z: 1 } },
    ]);
    expect(selection.count(project)).toBe(2);
    expect(selection.bounds(project)).toEqual({
      min: { x: 2, y: 1, z: 1 },
      max: { x: 2, y: 2, z: 1 },
    });
  });

  it('clears selection when a valid marquee intersects no project voxel', () => {
    const project = rendererBenchmarkProject('small');
    const selection = new SelectionService();
    selection.select(project.blocks[0].position);

    selection.selectMarqueeLogical(undefined, project, () => undefined);

    expect(selection.kind()).toBe('none');
    expect(selection.selectedBlocks(project)).toEqual([]);
    expect(selection.count(project)).toBe(0);
    expect(selection.bounds(project)).toBeUndefined();
  });

  it('selects only exposed visible surface seeds while allowing logical closure', () => {
    const blocks = [
      { position: { x: 0, y: 0, z: 0 }, id: 'stone' },
      { position: { x: 0, y: 1, z: 0 }, id: 'stone' },
      { position: { x: 1, y: 0, z: 0 }, id: 'stone' },
    ];
    const seeds = exposedSurfaceSelectionSeeds(
      blocks,
      { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } },
      { x: 0, y: 1, z: 0 },
    );
    expect(seeds.map((entry) => entry.position)).toEqual([{ x: 1, y: 0, z: 0 }]);
    const hidden = exposedSurfaceSelectionSeeds(
      blocks,
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      { x: 0, y: 1, z: 0 },
      (entry) => entry.position.y === 0,
    );
    expect(hidden.map((entry) => entry.position)).toEqual([{ x: 0, y: 0, z: 0 }]);
  });

  it('keeps surface box selection shallow after compact-box support is added', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 2, y: 2, z: 1 },
      blocks: [
        { ...base.blocks[0], position: { x: 0, y: 0, z: 0 } },
        { ...base.blocks[0], position: { x: 0, y: 1, z: 0 } },
        { ...base.blocks[0], position: { x: 1, y: 0, z: 0 } },
      ],
    };
    const service = new SelectionService();
    service.selectSurfaceBoxLogical(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } },
      { x: 0, y: 1, z: 0 },
      project,
      () => undefined,
    );
    expect(service.selectedBlocks(project).map((block) => block.position)).toEqual([
      { x: 1, y: 0, z: 0 },
    ]);
  });

  it('represents the existing 20k fixture as compact all-selection state', () => {
    const project = rendererBenchmarkProject('stress');
    const service = new SelectionService();
    service.selectAll(project, () => undefined);
    expect(service.kind()).toBe('all');
    expect(service.logicalPositions()).toHaveLength(0);
    expect(service.count(project)).toBe(20_000);
    expect(service.bounds(project)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 63, y: 4, z: 63 },
    });
    service.clear();
    expect(service.kind()).toBe('none');
    expect(service.logicalPositions()).toHaveLength(0);
  });

  it('keeps a large box selection compact while retaining blocks inside the volume', () => {
    const project = rendererBenchmarkProject('stress');
    const service = new SelectionService();
    service.selectBoxLogical(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } },
      project,
      () => undefined,
    );
    expect(service.kind()).toBe('box');
    expect(service.logicalPositions()).toHaveLength(0);
    expect(service.count(project)).toBe(20_000);
  });

  it('uses the same visibility predicate for free-space box bulk operations', () => {
    const project = rendererBenchmarkProject('small');
    const service = new SelectionService();
    service.selectBoxLogical(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } },
      project,
      () => undefined,
      (block) => block.position.x < 2,
    );
    expect(service.selectedBlocks(project).every((block) => block.position.x < 2)).toBe(true);
    expect(service.selectedBlocks(project).length).toBeGreaterThan(0);
  });

  it('keeps a box with no visible seeds empty for operations, count, and bounds', () => {
    const project = rendererBenchmarkProject('small');
    const service = new SelectionService();
    const box = { min: { x: 15, y: 15, z: 15 }, max: { x: 15, y: 15, z: 15 } };

    service.selectBoxLogical(
      box,
      project,
      () => undefined,
      () => false,
    );

    expect(service.box()).toEqual(box);
    expect(service.selectedBlocks(project)).toEqual([]);
    expect(service.count(project)).toBe(0);
    expect(service.bounds(project)).toBeUndefined();
    expect(service.renderState(project)).toMatchObject({ count: 0, bounds: undefined });
    expect(service.hasAny(project)).toBe(false);
  });

  it('does not treat a geometry-only box as a block selection', () => {
    const project = rendererBenchmarkProject('small');
    const service = new SelectionService();
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } };

    service.selectBox(box);

    expect(service.box()).toEqual(box);
    expect(service.selectedBlocks(project)).toEqual([]);
    expect(service.count(project)).toBe(0);
    expect(service.bounds(project)).toBeUndefined();
    expect(service.hasAny(project)).toBe(false);
  });

  it('keeps an empty face-locked surface selection empty instead of falling back to its box', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 2, y: 2, z: 1 },
      blocks: [
        { ...base.blocks[0], position: { x: 0, y: 0, z: 0 } },
        { ...base.blocks[0], position: { x: 0, y: 1, z: 0 } },
      ],
    };
    const service = new SelectionService();
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

    service.selectSurfaceBoxLogical(box, { x: 0, y: 1, z: 0 }, project, () => undefined);

    expect(service.logicalPositions()).toEqual([]);
    expect(service.selectedBlocks(project)).toEqual([]);
    expect(service.count(project)).toBe(0);
    expect(service.bounds(project)).toBeUndefined();
    expect(service.box()).toEqual(box);
  });

  it('uses the resolved selection set, not the dragged volume, for bounds and count', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 8, y: 2, z: 2 },
      blocks: [0, 2, 5].map((x) => ({ ...base.blocks[0], position: { x, y: 1, z: 1 } })),
    };
    const service = new SelectionService();
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 1, z: 1 } };

    service.selectBoxLogical(
      box,
      project,
      () => undefined,
      (block) => block.position.x === 2,
    );

    expect(service.selectedBlocks(project).map((block) => block.position)).toEqual([
      { x: 2, y: 1, z: 1 },
    ]);
    expect(service.count(project)).toBe(1);
    expect(service.bounds(project)).toEqual({
      min: { x: 2, y: 1, z: 1 },
      max: { x: 2, y: 1, z: 1 },
    });
    expect(service.renderState(project)).toMatchObject({
      count: 1,
      bounds: { min: { x: 2, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } },
    });
    expect(service.box()).toEqual(box);
  });

  it('excludes hidden groups, honors isolation, and leaves locked membership selectable', () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 4, y: 1, z: 1 },
      groups: [
        { id: 'hidden', name: 'Hidden', visible: false, locked: false },
        { id: 'locked', name: 'Locked', visible: true, locked: true },
        { id: 'active', name: 'Active', visible: true, locked: false },
      ],
      blocks: [
        {
          ...base.blocks[0],
          id: 'example:hidden',
          position: { x: 0, y: 0, z: 0 },
          groupIds: ['hidden'],
        },
        {
          ...base.blocks[0],
          id: 'example:locked',
          position: { x: 1, y: 0, z: 0 },
          groupIds: ['locked'],
        },
        {
          ...base.blocks[0],
          id: 'example:active',
          position: { x: 2, y: 0, z: 0 },
          groupIds: ['active'],
        },
        {
          ...base.blocks[0],
          id: 'example:ungrouped',
          position: { x: 3, y: 0, z: 0 },
          groupIds: [],
        },
      ],
    };
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } };
    const service = new SelectionService();

    service.selectBoxLogical(
      box,
      project,
      () => undefined,
      createBlockVisibilityPredicate(project),
    );
    expect(service.selectedBlocks(project).map((block) => block.id)).toEqual([
      'example:locked',
      'example:active',
      'example:ungrouped',
    ]);

    const isolated = createBlockVisibilityPredicate(project, {
      isolatedGroupId: 'active',
      isolatedGroupPositions: [project.blocks[2].position],
    });
    service.selectBoxLogical(box, project, () => undefined, isolated);
    expect(service.selectedBlocks(project).map((block) => block.id)).toEqual(['example:active']);
  });

  it('keeps compact box membership exact across later project mutations without scanning blocks', () => {
    let prohibitIteration = false;
    const base = rendererBenchmarkProject('stress');
    const blocks = new Proxy(base.blocks, {
      get(target, property, receiver) {
        if (prohibitIteration && property === Symbol.iterator)
          throw new Error('compact selection must resolve through the runtime index');
        return Reflect.get(target, property, receiver);
      },
    });
    const project = { ...base, blocks };
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const service = new SelectionService(index);
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } };
    service.selectBoxLogical(box, project, () => undefined);
    prohibitIteration = true;

    expect(service.count(project)).toBe(20_000);
    expect(service.selectedBlocks(project)).toHaveLength(20_000);

    const extra = { ...base.blocks[0], position: { x: 63, y: 4, z: 63 } };
    const changed = { ...project, blocks: [...base.blocks, extra] };
    prohibitIteration = false;
    expect(service.selectedBlocks(changed)).toHaveLength(20_000);
  });

  it('resolves a screen-space marquee through the resident index without iterating project blocks', () => {
    const base = rendererBenchmarkProject('stress');
    let prohibitIteration = false;
    const blocks = new Proxy(base.blocks, {
      get(target, property, receiver) {
        if (prohibitIteration && property === Symbol.iterator)
          throw new Error('marquee selection must resolve through the resident runtime index');
        return Reflect.get(target, property, receiver);
      },
    });
    const project = { ...base, blocks };
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const rebuilds = index.rebuildCount;
    const service = new SelectionService(index);
    prohibitIteration = true;

    service.selectMarqueeLogical(
      {
        candidateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } },
        intersectsVoxel: ({ x, z }) => x < 4 && z < 4,
      },
      project,
      () => undefined,
    );

    expect(service.count(project)).toBeGreaterThan(0);
    expect(
      service.selectedBlocks(project).every(({ position }) => position.x < 4 && position.z < 4),
    ).toBe(true);
    expect(index.rebuildCount).toBe(rebuilds);
  });

  it('resolves selected positions against the current project snapshot through undo and redo', () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, blocks: [base.blocks[0]] };
    const workspace = new WorkspaceStateService();
    workspace.project.set(project);
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const selection = new SelectionService(index);
    selection.selectLogical(project.blocks[0].position, project, () => undefined);
    const history = new HistoryService(workspace, undefined, index);

    expect(
      history.execute('Change selected state', (current) => ({
        ...current,
        blocks: current.blocks.map((block) => ({ ...block, state: { changed: 'true' } })),
      })),
    ).toBe(true);
    expect(selection.selectedBlocks(workspace.project()!)[0].state).toEqual({ changed: 'true' });
    expect(history.undo()).toBe(true);
    expect(selection.selectedBlocks(workspace.project()!)[0].state).toEqual(
      project.blocks[0].state,
    );
    expect(history.redo()).toBe(true);
    expect(selection.selectedBlocks(workspace.project()!)[0].state).toEqual({ changed: 'true' });
  });

  it('counts and resolves the actual selection through the existing index without scanning blocks', () => {
    let prohibitIteration = false;
    const blocks = new Proxy(
      [
        {
          kind: 'resolved' as const,
          id: 'stone',
          namespace: 'minecraft',
          position: { x: 1, y: 0, z: 1 },
          state: {},
        },
        {
          kind: 'resolved' as const,
          id: 'dirt',
          namespace: 'minecraft',
          position: { x: 2, y: 1, z: 1 },
          state: {},
        },
        {
          kind: 'resolved' as const,
          id: 'stone',
          namespace: 'minecraft',
          position: { x: 3, y: 1, z: 2 },
          state: {},
        },
      ],
      {
        get(target, property, receiver) {
          if (prohibitIteration && property === Symbol.iterator)
            throw new Error('selected block queries must use the resident index');
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const project = {
      ...rendererBenchmarkProject('small'),
      blocks,
    };
    const index = new ProjectBlockRuntimeIndex();
    const service = new SelectionService(index);
    index.ensure(project);
    const rebuilds = index.rebuildCount;
    prohibitIteration = true;
    service.selectBoxLogical(
      { min: { x: 2, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } },
      project,
      () => undefined,
    );

    expect(service.count(project)).toBe(1);
    expect(service.selectedBlocks(project).map((block) => block.id)).toEqual(['dirt']);
    expect(index.rebuildCount).toBe(rebuilds);
  });

  it('selects box seeds and logical closure from the existing index after project indexing', () => {
    let prohibitScans = false;
    const blocks = new Proxy(
      [
        {
          kind: 'resolved' as const,
          id: 'example:door',
          namespace: 'example',
          position: { x: 2, y: 1, z: 1 },
          state: { half: 'lower' },
        },
        {
          kind: 'resolved' as const,
          id: 'example:door',
          namespace: 'example',
          position: { x: 2, y: 2, z: 1 },
          state: { half: 'upper' },
        },
      ],
      {
        get(target, property, receiver) {
          if (
            prohibitScans &&
            (property === Symbol.iterator || property === 'filter' || property === 'map')
          )
            throw new Error('box selection must use the resident block index');
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const project = { ...rendererBenchmarkProject('small'), blocks };
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const rebuilds = index.rebuildCount;
    const service = new SelectionService(index);
    const door = {
      behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true },
    } as BlockDefinition;
    prohibitScans = true;

    service.selectBoxLogical(
      { min: { x: 2, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } },
      project,
      (id) => (id === 'example:door' ? door : undefined),
    );

    expect(service.logicalPositions()).toEqual([
      { x: 2, y: 1, z: 1 },
      { x: 2, y: 2, z: 1 },
    ]);
    expect(index.rebuildCount).toBe(rebuilds);
  });

  it('uses indexed neighbor occupancy for face-locked selection and ignores hidden neighbors', () => {
    let prohibitScans = false;
    const blocks = new Proxy(
      [
        {
          kind: 'resolved' as const,
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 2, y: 1, z: 1 },
          state: {},
        },
        {
          kind: 'resolved' as const,
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 2, y: 1, z: 2 },
          state: {},
        },
      ],
      {
        get(target, property, receiver) {
          if (
            prohibitScans &&
            (property === Symbol.iterator || property === 'filter' || property === 'map')
          )
            throw new Error('face selection must use indexed occupancy');
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const project = { ...rendererBenchmarkProject('small'), blocks };
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const service = new SelectionService(index);
    prohibitScans = true;

    service.selectSurfaceBoxLogical(
      { min: { x: 2, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } },
      { x: 0, y: 0, z: 1 },
      project,
      () => undefined,
      (block) => block.position.z === 1,
    );

    expect(service.logicalPositions()).toEqual([{ x: 2, y: 1, z: 1 }]);
    expect(index.rebuildCount).toBe(1);
  });
});

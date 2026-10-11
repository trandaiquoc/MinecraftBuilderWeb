import { describe, expect, it } from 'vitest';
import {
  clampVoxelBox,
  exposedSurfaceSelectionSeeds,
  faceLockedSelectionPlane,
  freeSpaceSelectionBox,
  freeSpaceSelectionPlane,
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

  it('maps empty-space drags to a camera-aligned depth-extruded box', () => {
    const plane = freeSpaceSelectionPlane({ x: 10, y: 6, z: 8 }, { x: 0.9, y: 0.1, z: 0.2 });
    expect(plane).toEqual({
      axis: 'x',
      point: { x: 5, y: 3, z: 4 },
      normal: { x: 0.9, y: 0.1, z: 0.2 },
    });
    expect(
      freeSpaceSelectionBox({ x: 8.9, y: 4.8, z: 6.9 }, { x: -2.1, y: 1.2, z: 2.1 }, plane, {
        x: 10,
        y: 6,
        z: 8,
      }),
    ).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 9, y: 4, z: 6 } });
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

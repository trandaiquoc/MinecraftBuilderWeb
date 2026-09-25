import { describe, expect, it } from 'vitest';
import { clampVoxelBox, exposedSurfaceSelectionSeeds, faceLockedSelectionPlane, freeSpaceSelectionBox, freeSpaceSelectionPlane, normalizeVoxelBox, voxelBoxSize, voxelInBox, voxelOnFaceLockedPlane } from './selection';
import { SelectionService } from './selection.service';
import { rendererBenchmarkProject } from '../../renderer/benchmark/renderer-benchmark-fixtures';

describe('voxel box selection', () => {
  it('normalizes inclusive integer corners and counts its size', () => {
    const box = normalizeVoxelBox({ x: 4.8, y: 3.2, z: 8.9 }, { x: 1.1, y: 5.7, z: 2.4 });
    expect(box).toEqual({ min: { x: 1, y: 3, z: 2 }, max: { x: 4, y: 5, z: 8 } });
    expect(voxelBoxSize(box)).toEqual({ x: 4, y: 3, z: 7 });
    expect(voxelInBox({ x: 4, y: 5, z: 8 }, box)).toBe(true);
  });

  it('clamps box bounds to project dimensions', () => {
    expect(clampVoxelBox(normalizeVoxelBox({ x: -3, y: 1, z: 2 }, { x: 8, y: 9, z: 20 }), { x: 4, y: 5, z: 6 })).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 3, y: 4, z: 5 } });
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
    const plane = freeSpaceSelectionPlane({ x: 10, y: 6, z: 8 }, { x: .9, y: .1, z: .2 });
    expect(plane).toEqual({ axis: 'x', coordinate: 5 });
    expect(freeSpaceSelectionBox({ x: 8.9, y: 4.8, z: 6.9 }, { x: -2.1, y: 1.2, z: 2.1 }, plane, { x: 10, y: 6, z: 8 })).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 9, y: 4, z: 6 } });
  });

  it('selects only exposed visible surface seeds while allowing logical closure', () => {
    const blocks = [
      { position: { x: 0, y: 0, z: 0 }, id: 'stone' },
      { position: { x: 0, y: 1, z: 0 }, id: 'stone' },
      { position: { x: 1, y: 0, z: 0 }, id: 'stone' },
    ];
    const seeds = exposedSurfaceSelectionSeeds(blocks, { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } }, { x: 0, y: 1, z: 0 });
    expect(seeds.map((entry) => entry.position)).toEqual([{ x: 1, y: 0, z: 0 }]);
    const hidden = exposedSurfaceSelectionSeeds(blocks, { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, { x: 0, y: 1, z: 0 }, (entry) => entry.position.y === 0);
    expect(hidden.map((entry) => entry.position)).toEqual([{ x: 0, y: 0, z: 0 }]);
  });

  it('keeps surface box selection shallow after compact-box support is added', () => {
    const base = rendererBenchmarkProject('small');
    const project = { ...base, size: { x: 2, y: 2, z: 1 }, blocks: [
      { ...base.blocks[0], position: { x: 0, y: 0, z: 0 } },
      { ...base.blocks[0], position: { x: 0, y: 1, z: 0 } },
      { ...base.blocks[0], position: { x: 1, y: 0, z: 0 } },
    ] };
    const service = new SelectionService();
    service.selectSurfaceBoxLogical({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } }, { x: 0, y: 1, z: 0 }, project, () => undefined);
    expect(service.selectedBlocks(project).map((block) => block.position)).toEqual([{ x: 1, y: 0, z: 0 }]);
  });

  it('represents the existing 20k fixture as compact all-selection state', () => {
    const project = rendererBenchmarkProject('stress');
    const service = new SelectionService();
    service.selectAll(project, () => undefined);
    expect(service.kind()).toBe('all');
    expect(service.logicalPositions()).toHaveLength(0);
    expect(service.count(project)).toBe(20_000);
    expect(service.bounds(project)).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } });
    service.clear();
    expect(service.kind()).toBe('none');
    expect(service.logicalPositions()).toHaveLength(0);
  });

  it('keeps a large box selection compact while retaining blocks inside the volume', () => {
    const project = rendererBenchmarkProject('stress');
    const service = new SelectionService();
    service.selectBoxLogical({ min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 4, z: 63 } }, project, () => undefined);
    expect(service.kind()).toBe('box');
    expect(service.logicalPositions()).toHaveLength(0);
    expect(service.count(project)).toBe(20_000);
  });

  it('uses the same visibility predicate for free-space box bulk operations', () => {
    const project = rendererBenchmarkProject('small');
    const service = new SelectionService();
    service.selectBoxLogical({ min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } }, project, () => undefined, (block) => block.position.x < 2);
    expect(service.selectedBlocks(project).every((block) => block.position.x < 2)).toBe(true);
    expect(service.selectedBlocks(project).length).toBeGreaterThan(0);
  });
});

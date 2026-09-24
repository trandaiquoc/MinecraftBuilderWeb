import { describe, expect, it } from 'vitest';
import { clampVoxelBox, normalizeVoxelBox, voxelBoxSize, voxelInBox } from './selection';
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
});

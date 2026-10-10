import { describe, expect, it } from 'vitest';
import { ViewportInteriorCullingOwner } from './viewport-interior-culling-owner';
import type { OcclusionEntry } from './interior-occlusion';

const block = (x: number, y: number, z: number) => ({
  id: 'minecraft:stone',
  position: { x, y, z },
  kind: 'resolved' as const,
});
const entry = (x: number, y: number, z: number) =>
  ({
    block: block(x, y, z),
    role: 'normal' as const,
    occlusionClass: 'opaque-full-cube' as const,
  }) as unknown as OcclusionEntry;
const keyOf = (value: OcclusionEntry): string =>
  `${value.block.position.x},${value.block.position.y},${value.block.position.z}`;

describe('ViewportInteriorCullingOwner', () => {
  it('culls only a fully surrounded voxel and owns the committed set', () => {
    const owner = new ViewportInteriorCullingOwner(() => undefined);
    const center = entry(0, 0, 0);
    const neighbors = [
      entry(1, 0, 0),
      entry(-1, 0, 0),
      entry(0, 1, 0),
      entry(0, -1, 0),
      entry(0, 0, 1),
      entry(0, 0, -1),
    ];
    owner.updateFull([center, ...neighbors], true, new Set(), new Map());

    expect(owner.has('0,0,0')).toBe(true);
    expect(owner.size).toBe(1);
  });

  it('updates the voxel and its neighbors on a bounded delta', () => {
    const owner = new ViewportInteriorCullingOwner(() => undefined);
    const center = entry(0, 0, 0);
    const neighbors = [
      entry(1, 0, 0),
      entry(-1, 0, 0),
      entry(0, 1, 0),
      entry(0, -1, 0),
      entry(0, 0, 1),
      entry(0, 0, -1),
    ];
    const values = new Map<string, OcclusionEntry>(
      [center, ...neighbors].map((value) => [keyOf(value), value] as const),
    );
    owner.updateFull([...values.values()], true, new Set(), new Map());
    values.delete('0,0,1');
    owner.updateDelta(
      new Map([['0,0,1', { position: { x: 0, y: 0, z: 1 } }]]),
      (key) => values.get(key),
      values,
    );

    expect(owner.has('0,0,0')).toBe(false);
    expect(owner.size).toBe(0);
  });

  it('removes culled state when a projection no longer contains the key', () => {
    const owner = new ViewportInteriorCullingOwner(() => undefined);
    const center = entry(0, 0, 0);
    const neighbors = [
      entry(1, 0, 0),
      entry(-1, 0, 0),
      entry(0, 1, 0),
      entry(0, -1, 0),
      entry(0, 0, 1),
      entry(0, 0, -1),
    ];
    const values = new Map<string, OcclusionEntry>(
      [center, ...neighbors].map((value) => [keyOf(value), value] as const),
    );
    owner.updateFull([...values.values()], true, new Set(), new Map());
    owner.updateDelta(
      new Map([['0,0,0', { position: { x: 0, y: 0, z: 0 } }]]),
      () => undefined,
      values,
    );

    expect(owner.size).toBe(0);
  });

  it('can recompute exactly caller-owned local keys without expanding neighbors', () => {
    const owner = new ViewportInteriorCullingOwner(() => undefined);
    const center = entry(0, 0, 0);
    const neighbors = [
      entry(1, 0, 0),
      entry(-1, 0, 0),
      entry(0, 1, 0),
      entry(0, -1, 0),
      entry(0, 0, 1),
      entry(0, 0, -1),
    ];
    const values = new Map<string, OcclusionEntry>(
      [center, ...neighbors].map((value) => [keyOf(value), value] as const),
    );
    owner.updateFull([...values.values()], true, new Set(), new Map());
    values.delete('0,0,1');
    owner.updateKeys(['0,0,1'], (key) => values.get(key), values);

    expect(owner.has('0,0,0')).toBe(true);
    expect(owner.size).toBe(1);
  });
});

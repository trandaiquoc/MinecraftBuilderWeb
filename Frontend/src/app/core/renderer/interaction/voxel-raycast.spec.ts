import { describe, expect, it } from 'vitest';
import { ddaVoxelCandidates, ddaVoxelPick } from './voxel-raycast';

const size = { x: 8, y: 8, z: 8 };
const ray = (origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }) => ({ origin, direction });
const pick = (r: ReturnType<typeof ray>, occupied: ReadonlySet<string>) => ddaVoxelPick(r, size, (position) => occupied.has(`${position.x},${position.y},${position.z}`) ? 'hit' : 'skip');

describe('ddaVoxelPick', () => {
  it.each([
    [{ x: 0, y: 2, z: 2 }, { x: 1, y: 0, z: 0 }, 'west'],
    [{ x: 7, y: 2, z: 2 }, { x: -1, y: 0, z: 0 }, 'east'],
    [{ x: 2, y: 0, z: 2 }, { x: 0, y: 1, z: 0 }, 'down'],
    [{ x: 2, y: 7, z: 2 }, { x: 0, y: -1, z: 0 }, 'up'],
    [{ x: 2, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, 'north'],
    [{ x: 2, y: 2, z: 7 }, { x: 0, y: 0, z: -1 }, 'south'],
  ] as const)('returns the first voxel and entered face for %o', (origin, direction, expectedDirection) => {
    const result = pick(ray(origin, direction), new Set(['2,2,2']));
    expect(result).toMatchObject({ position: { x: 2, y: 2, z: 2 }, direction: expectedDirection });
  });

  it('returns the nearer block and its face when several voxels are occupied', () => {
    const result = pick(ray({ x: -1, y: 1.5, z: 1.5 }, { x: 1, y: 0, z: 0 }), new Set(['1,1,1', '4,1,1']));
    expect(result).toMatchObject({ position: { x: 1, y: 1, z: 1 }, direction: 'west' });
  });

  it('picks the containing voxel when the ray starts inside it', () => {
    const result = pick(ray({ x: 2.25, y: 2.25, z: 2.25 }, { x: 0, y: 1, z: 0 }), new Set(['2,2,2']));
    expect(result).toMatchObject({ position: { x: 2, y: 2, z: 2 }, distance: 0 });
  });

  it('can request a precise fallback for a non-cube cell', () => {
    const result = ddaVoxelPick(ray({ x: -1, y: 1.5, z: 1.5 }, { x: 1, y: 0, z: 0 }), size, (position) => position.x === 1 ? 'fallback' : 'skip');
    expect(result).toEqual({ fallback: true, visitedVoxels: 2 });
  });

  it('misses a ray that does not intersect the project bounds', () => {
    expect(pick(ray({ x: -1, y: 20, z: 0 }, { x: 1, y: 0, z: 0 }), new Set(['2,2,2']))).toBeUndefined();
  });

  it('retains ordered partial-shape candidates before a later full cube', () => {
    const result = ddaVoxelCandidates(ray({ x: -1, y: 1.5, z: 1.5 }, { x: 1, y: 0, z: 0 }), size, (position) => {
      if (position.x === 1) return 'fallback';
      if (position.x === 4) return 'hit';
      return 'skip';
    });
    expect(result).toMatchObject({ fullCubeHit: { position: { x: 4, y: 1, z: 1 } }, candidates: [{ position: { x: 1, y: 1, z: 1 } }] });
  });

  it('limits precise candidates without falling back to the whole scene', () => {
    const result = ddaVoxelCandidates(ray({ x: -1, y: 1.5, z: 1.5 }, { x: 1, y: 0, z: 0 }), size, (position) => position.x >= 1 ? 'fallback' : 'skip', 2);
    expect(result?.candidates).toHaveLength(2);
    expect(result?.fullCubeHit).toBeUndefined();
  });
});

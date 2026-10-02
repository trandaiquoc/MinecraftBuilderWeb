import { describe, expect, it } from 'vitest';
import { PlacedBlock } from '../../domain/project.types';
import { exposedFaceCount, exposedFaceDirections, neighborFacesCulled } from './exposed-face-rendering';
import type { ExposedFaceEntry } from './exposed-face-rendering';

function entry(position: { x: number; y: number; z: number }, occlusionClass: ExposedFaceEntry['occlusionClass'] = 'opaque-full-cube', id = 'minecraft:stone'): ExposedFaceEntry {
  const block: PlacedBlock = { kind: 'resolved', id, namespace: id.split(':')[0], position, state: {} };
  return { block, role: 'normal', occlusionClass };
}

describe('exposed face rendering', () => {
  it.each([
    [{ x: 1, y: 0, z: 0 }, 'east', 'west'],
    [{ x: 0, y: 1, z: 0 }, 'up', 'down'],
    [{ x: 0, y: 0, z: 1 }, 'south', 'north'],
  ] as const)('culls both internal faces for touching cubes on the %s axis', (offset, firstHidden, secondHidden) => {
    const entries = [entry({ x: 0, y: 0, z: 0 }), entry(offset)];
    const visible = new Map(entries.map((item) => [`${item.block.position.x},${item.block.position.y},${item.block.position.z}`, item] as const));
    expect(exposedFaceDirections(entries[0], visible)).not.toContain(firstHidden);
    expect(exposedFaceDirections(entries[1], visible)).not.toContain(secondHidden);
    expect(exposedFaceCount(entries)).toBe(10);
    expect(neighborFacesCulled(entries)).toBe(2);
  });

  it('keeps an opaque face exposed beside transparent, partial, or unknown neighbors', () => {
    for (const occlusionClass of ['non-occluding', 'unknown'] as const) {
      const entries = [entry({ x: 0, y: 0, z: 0 }), entry({ x: 1, y: 0, z: 0 }, occlusionClass, `example:${occlusionClass}`)];
      expect(exposedFaceCount(entries)).toBe(6);
      expect(neighborFacesCulled(entries)).toBe(0);
    }
  });

  it('counts only the outer shell of a dense 48 cubed structure', () => {
    const size = 48;
    const entries = Array.from({ length: size ** 3 }, (_, index) => entry({ x: index % size, y: Math.floor(index / (size * size)), z: Math.floor(index / size) % size }));
    expect(exposedFaceCount(entries)).toBe(13_824);
    expect(neighborFacesCulled(entries)).toBe(6 * (size ** 3) - 13_824);
  });
});

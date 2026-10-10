import { describe, expect, it } from 'vitest';
import { blockMutationHint } from '../../editor/mutations/project-mutation-hint';
import { planLocalRenderDelta } from './local-render-delta';

describe('planLocalRenderDelta', () => {
  it('deduplicates one changed voxel and its bounded direct neighborhood', () => {
    const position = { x: 4, y: 5, z: 6 };
    const delta = planLocalRenderDelta(
      blockMutationHint([
        {
          position,
          after: {
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position,
            state: {},
          },
        },
      ]),
    );
    expect(delta.hintedKeys).toEqual(new Set(['4,5,6']));
    expect(delta.mutatedKeys).toEqual(new Set(['4,5,6']));
    expect(delta.hydrationInvalidatedKeys).toEqual(new Set(['4,5,6']));
    expect(delta.dependencyKeys).toHaveLength(6);
    expect(delta.changedKeys.size).toBe(7);
    expect(delta.affectedPositions.get('4,5,6')).toEqual(position);
  });

  it('keeps dependency neighbors out of hydration invalidation', () => {
    const position = { x: 0, y: 0, z: 0 };
    const delta = planLocalRenderDelta(
      blockMutationHint([
        {
          position,
          before: {
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position,
            state: {},
          },
        },
      ]),
    );
    expect(delta.mutatedKeys).toEqual(new Set(['0,0,0']));
    expect(delta.dependencyKeys).toContain('1,0,0');
    expect(delta.hydrationInvalidatedKeys).not.toContain('1,0,0');
  });

  it('plans undo symmetrically', () => {
    const position = { x: 2, y: 3, z: 4 };
    const block = {
      kind: 'resolved' as const,
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position,
      state: {},
    };
    const forward = planLocalRenderDelta(blockMutationHint([{ position, after: block }]));
    const inverse = planLocalRenderDelta(blockMutationHint([{ position, before: block }]));
    expect([...inverse.mutatedKeys]).toEqual([...forward.mutatedKeys]);
    expect([...inverse.dependencyKeys]).toEqual([...forward.dependencyKeys]);
    expect([...inverse.affectedPositions.keys()]).toEqual([...forward.affectedPositions.keys()]);
  });
});

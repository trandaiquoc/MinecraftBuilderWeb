import { describe, expect, it } from 'vitest';
import { blockMutationHint } from '../../editor/mutations/project-mutation-hint';
import { planLocalRenderDelta } from './local-render-delta';

describe('planLocalRenderDelta', () => {
  it('deduplicates one changed voxel and its bounded direct neighborhood', () => {
    const position = { x: 4, y: 5, z: 6 };
    const delta = planLocalRenderDelta(blockMutationHint([{ position, after: { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} } }]));
    expect(delta.hintedKeys).toEqual(new Set(['4,5,6']));
    expect(delta.changedKeys.size).toBe(7);
    expect(delta.affectedPositions.get('4,5,6')).toEqual(position);
  });
});

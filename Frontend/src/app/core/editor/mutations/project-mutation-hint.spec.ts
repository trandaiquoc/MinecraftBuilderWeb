import { describe, expect, it } from 'vitest';
import { blockMutationHint, invertProjectMutationHint } from './project-mutation-hint';

const before = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: {} };
const after = { ...before, state: { axis: 'x' } };

describe('project mutation hints', () => {
  it('contains the known block delta without diffing a project snapshot', () => {
    const hint = blockMutationHint([{ position: before.position, before, after }], 'state-edit');
    expect(hint.kind).toBe('block-delta');
    expect(hint.changes[0]).toMatchObject({ before, after });
  });

  it('inverts forward and inverse values for undo', () => {
    const inverse = invertProjectMutationHint(blockMutationHint([{ position: before.position, before, after }]));
    expect(inverse.changes[0]).toMatchObject({ before: after, after: before });
  });
});

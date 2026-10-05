import { describe, expect, it } from 'vitest';
import { blockMutationHint, invertProjectMutationHint } from './project-mutation-hint';
import { boundedProjectMutationChanges } from './project-mutation-diff';

const before = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: {} };
const after = { ...before, state: { axis: 'x' } };

describe('project mutation hints', () => {
  it('contains the known block delta without diffing a project snapshot', () => {
    const hint = blockMutationHint([{ position: before.position, before, after }], 'state-edit');
    expect(hint.kind).toBe('block-delta');
    expect(hint.origin).toBe('editor');
    expect(hint.changes[0]).toMatchObject({ before, after });
  });

  it('keeps content resolution provenance typed and reversible', () => {
    const hint = blockMutationHint([{ position: before.position, before, after }], 'content-resolution', 'content-resolution');
    expect(hint.origin).toBe('content-resolution');
    expect(invertProjectMutationHint(hint).origin).toBe('content-resolution');
  });

  it('inverts forward and inverse values for undo', () => {
    const inverse = invertProjectMutationHint(blockMutationHint([{ position: before.position, before, after }]));
    expect(inverse.changes[0]).toMatchObject({ before: after, after: before });
  });

  it('does not emit an unchanged affected/support position', () => {
    const changes = boundedProjectMutationChanges([before.position], () => ({ ...before }), () => ({ ...before }));
    expect(changes).toEqual([]);
  });

  it('compares block values rather than object identity and preserves real state changes', () => {
    const sameValue = { ...before, state: { ...before.state } };
    expect(boundedProjectMutationChanges([before.position], () => before, () => sameValue)).toEqual([]);
    const changed = boundedProjectMutationChanges([before.position], () => before, () => after);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ before, after });
  });

  it('keeps a surviving neighbor out of delete inversion when its value is unchanged', () => {
    const changes = boundedProjectMutationChanges([before.position], () => before, () => before);
    expect(changes).toEqual([]);
    const deleted = boundedProjectMutationChanges([before.position], () => before, () => undefined);
    const inverse = invertProjectMutationHint(blockMutationHint(deleted));
    expect(inverse.changes[0]).toMatchObject({ before: undefined, after: before });
  });
});

import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { ViewportBlockRepresentationStore } from './viewport-block-representation-store';

describe('ViewportBlockRepresentationStore', () => {
  it('owns canonical entry identity and updates/removes it by voxel key', () => {
    const store = new ViewportBlockRepresentationStore();
    const entry = { key: '1,2,3', block: { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: {} } satisfies PlacedBlock, signature: 'stone', role: 'normal' as const, revision: 0 };

    store.createOrReplace(entry);
    expect(store.get(entry.key)).toBe(entry);
    expect([...store.keys()]).toEqual([entry.key]);
    expect(store.snapshot()[0]).toMatchObject({ key: entry.key, signature: entry.signature, role: entry.role, revision: entry.revision, block: entry.block });
    expect(store.remove(entry.key)).toBe(true);
    expect(store.size).toBe(0);
  });

  it('returns detached diagnostic snapshots', () => {
    const store = new ViewportBlockRepresentationStore();
    const entry = { key: '0,0,0', block: { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} } satisfies PlacedBlock, signature: 'stone', role: 'normal' as const, revision: 0 };
    store.createOrReplace(entry);

    const snapshot = store.snapshot()[0];
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).not.toBe(entry);
    expect(snapshot.block).not.toBe(entry.block);
    expect(snapshot.block.position).not.toBe(entry.block.position);
    expect(snapshot.block.state).not.toBe(entry.block.state);
    expect(Object.isFrozen(snapshot.block)).toBe(true);
    expect(Object.isFrozen(snapshot.block.position)).toBe(true);
    expect(Object.isFrozen(snapshot.block.state)).toBe(true);
    expect(entry.block.position.x).toBe(0);
    expect(entry.block.state).toEqual({});
  });
});

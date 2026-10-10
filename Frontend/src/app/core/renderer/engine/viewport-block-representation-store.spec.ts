import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { ViewportBlockRepresentationStore } from './viewport-block-representation-store';

describe('ViewportBlockRepresentationStore', () => {
  it('advances its revision for representation ownership changes', () => {
    const store = new ViewportBlockRepresentationStore();
    const entry = {
      key: '1,2,3',
      block: {
        kind: 'resolved' as const,
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 1, y: 2, z: 3 },
        state: {},
      } satisfies PlacedBlock,
      signature: 'stone',
      role: 'normal' as const,
      revision: 0,
    };

    expect(store.revision).toBe(0);
    store.createOrReplace(entry);
    const createdRevision = store.revision;
    store.setPresentationVisible(entry.key, false);
    expect(store.revision).toBeGreaterThan(createdRevision);
    expect(store.remove(entry.key)).toBe(true);
    expect(store.revision).toBeGreaterThan(createdRevision + 1);
  });

  it('owns canonical entry mutation and updates/removes it by voxel key', () => {
    const store = new ViewportBlockRepresentationStore();
    const entry = {
      key: '1,2,3',
      block: {
        kind: 'resolved' as const,
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 1, y: 2, z: 3 },
        state: {},
      } satisfies PlacedBlock,
      signature: 'stone',
      role: 'normal' as const,
      revision: 0,
    };

    store.createOrReplace(entry);
    expect(store.get(entry.key)).toMatchObject(entry);
    expect(store.get(entry.key)).not.toBe(entry);
    expect(Object.isFrozen(store.get(entry.key))).toBe(true);
    expect([...store.keys()]).toEqual([entry.key]);
    expect(store.snapshot()[0]).toMatchObject({
      key: entry.key,
      signature: entry.signature,
      role: entry.role,
      revision: entry.revision,
      block: entry.block,
    });
    expect(store.remove(entry.key)).toBe(true);
    expect(store.size).toBe(0);
  });

  it('returns detached diagnostic snapshots', () => {
    const store = new ViewportBlockRepresentationStore();
    const entry = {
      key: '0,0,0',
      block: {
        kind: 'resolved' as const,
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      } satisfies PlacedBlock,
      signature: 'stone',
      role: 'normal' as const,
      revision: 0,
    };
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

  it('maintains provider references through replace, mutation and removal without scanning entries', () => {
    const store = new ViewportBlockRepresentationStore();
    const first = {} as import('../visuals/block-visual-provider-contract').BlockVisualProvider;
    const second = {} as import('../visuals/block-visual-provider-contract').BlockVisualProvider;
    const entry = {
      key: '0,0,0',
      block: {
        kind: 'resolved' as const,
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      } satisfies PlacedBlock,
      signature: 'stone',
      role: 'normal' as const,
      revision: 0,
      provider: first,
    };

    store.createOrReplace(entry);
    expect(store.providerReferenceCount(first)).toBe(1);
    store.setProvider(entry.key, second);
    expect(store.providerReferenceCount(first)).toBe(0);
    expect(store.providerReferenceCount(second)).toBe(1);
    store.remove(entry.key);
    expect(store.hasProviderReference(second)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { FluidChunkRecordStore } from './fluid-chunk-record-store';
import { vanillaFluidRenderResolver } from './fluid-state';
import type { FluidChunkRecord } from './fluid-render-contracts';

function record(x: number, level = '0'): FluidChunkRecord {
  const block: PlacedBlock = {
    kind: 'resolved',
    id: 'minecraft:water',
    namespace: 'minecraft',
    position: { x, y: 0, z: 0 },
    state: { level },
  };
  return { block, state: vanillaFluidRenderResolver.resolve(block)! };
}

describe('FluidChunkRecordStore', () => {
  it('owns canonical records and chunk index without dirtying unchanged records', () => {
    const store = new FluidChunkRecordStore();
    const left = record(0);
    const remote = record(48);

    expect(store.reconcile([left, remote], undefined, 16, [], false).full).toBe(true);
    expect(store.size).toBe(2);
    expect(store.recordsInChunk('0,0,0')).toEqual([left]);
    expect(store.recordsInChunk('3,0,0')).toEqual([remote]);

    const unchanged = store.reconcile([left, remote], [], 16, [], false);
    expect(unchanged.dirtyChunks.size).toBe(0);
    expect(store.get('0,0,0')).toBe(left);
  });

  it('applies a local state replacement and deletion only to canonical record ownership', () => {
    const store = new FluidChunkRecordStore();
    const left = record(0);
    const remote = record(48);
    store.reconcile([left, remote], undefined, 16, [], false);

    const updated = record(0, '4');
    const delta = store.applyDelta(
      [
        { position: left.block.position, before: left, after: updated },
        { position: remote.block.position, before: remote },
      ],
      [left.block.position, remote.block.position],
      16,
    );

    expect(delta.changedKeys).toEqual(['0,0,0', '48,0,0']);
    expect(store.get('0,0,0')).toBe(updated);
    expect(store.has('48,0,0')).toBe(false);
    expect(store.recordsInChunk('3,0,0')).toHaveLength(0);
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
  });
});

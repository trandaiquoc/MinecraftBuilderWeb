import { describe, expect, it } from 'vitest';
import { RuntimeProjectBlockStore, chunkKey } from './project-block-spatial-index';
import type { PlacedBlock } from './project.types';

function block(index: number, groupIds?: readonly string[]): PlacedBlock {
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: index % 100, y: Math.floor(index / 100) % 100, z: Math.floor(index / 10_000) }, state: {}, groupIds };
}

describe('RuntimeProjectBlockStore', () => {
  it('hydrates and provides constant-time coordinate access without rebuilding a lookup per query', () => {
    const store = new RuntimeProjectBlockStore(); const blocks = [block(0), block(1)];
    store.hydrate('project', blocks); store.resetCounters();
    expect(store.get({ x: 1, y: 0, z: 0 })?.id).toBe('minecraft:stone');
    expect(store.has({ x: 99, y: 99, z: 99 })).toBe(false);
    expect(store.lookups).toBe(2); expect(store.iterations).toBe(0);
  });

  it('keeps group/chunk indexes and dirty regions synchronized for mutations', () => {
    const store = new RuntimeProjectBlockStore(); const first = { ...block(0, ['roof']), position: { x: 16, y: 0, z: 0 } }; store.hydrate('project', [first]);
    expect(store.blocksForGroup('roof')).toHaveLength(1); expect(store.dirtyChunks()).toEqual([]);
    const updated = { ...first, groupIds: ['roof', 'entry'] };
    expect(store.update(first.position, updated)).toBe(true);
    expect(store.blocksForGroup('entry')).toHaveLength(1); expect(store.dirtyChunks()).toContain(chunkKey(first.position));
    expect(store.remove(first.position)).toEqual(updated); expect(store.blocksForGroup('roof')).toHaveLength(0);
    expect(store.consumeDirtyChunks()).toEqual(expect.arrayContaining(['1,0,0', '0,0,0']));
  });

  it('queries boxes and preserves deterministic snapshot order through batch moves', () => {
    const store = new RuntimeProjectBlockStore(); const blocks = [block(0), block(1)]; store.hydrate('project', blocks);
    expect(store.queryBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toHaveLength(2);
    expect(store.moveBatch([{ before: blocks[0].position, after: { x: 10, y: 0, z: 0 } }, { before: blocks[1].position, after: { x: 11, y: 0, z: 0 } }])).toBe(true);
    expect(store.snapshot().map((entry) => entry.position.x)).toEqual([10, 11]);
  });

  it('handles a deterministic 100k fixture with bounded point queries and local mutations', () => {
    const blocks = Array.from({ length: 100_000 }, (_, index) => block(index)); const store = new RuntimeProjectBlockStore(); store.hydrate('large', blocks); store.resetCounters();
    expect(store.get(blocks[77_777].position)?.position).toEqual(blocks[77_777].position);
    expect(store.lookups).toBe(1); expect(store.iterations).toBe(0);
    const target = blocks[77_777]; const next = { ...target, state: { powered: 'true' } };
    expect(store.update(target.position, next)).toBe(true); expect(store.get(target.position)?.state['powered']).toBe('true');
    expect(store.iterations).toBe(0);
  });

  it('keeps small-region and small-group queries bounded on the 100k fixture', () => {
    const blocks = Array.from({ length: 100_000 }, (_, index) => block(index, index < 100 ? ['roof'] : undefined)); const store = new RuntimeProjectBlockStore(); store.hydrate('large', blocks); store.resetCounters();
    expect(store.queryBox({ x: 0, y: 0, z: 0 }, { x: 15, y: 15, z: 0 }).length).toBeGreaterThan(0);
    expect(store.iterations).toBeLessThan(5_000);
    store.resetCounters(); expect(store.blocksForGroup('roof')).toHaveLength(100); expect(store.iterations).toBe(100);
  });
});

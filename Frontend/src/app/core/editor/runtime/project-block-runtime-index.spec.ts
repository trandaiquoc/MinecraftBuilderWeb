import { describe, expect, it } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { blockMutationHint, metadataMutationHint } from '../mutations/project-mutation-hint';
import { ProjectBlockRuntimeIndex } from './project-block-runtime-index';

const block = (x: number, state: Record<string, string> = {}): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state });
const typedBlock = (x: number, id: string, kind: 'resolved' | 'missing' = 'resolved', state: Record<string, string> = {}): PlacedBlock => ({ kind, id, namespace: id.split(':')[0] ?? '', position: { x, y: 0, z: 0 }, state });
const project = (blocks: readonly PlacedBlock[]): ProjectDocument => ({ schemaVersion: 3, id: 'runtime-index', metadata: { name: 'Runtime', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 20000, y: 2, z: 2 }, structureMode: 'huge-structure-blocks', blocks, groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } });

describe('ProjectBlockRuntimeIndex', () => {
  it('adopts a large hinted replacement without rebuilding the project snapshot', () => {
    const blocks = Array.from({ length: 20000 }, (_, index) => block(index, { value: String(index) }));
    const before = project(blocks);
    const replacement = { ...blocks[15000], state: { value: 'changed' } };
    const after = { ...before, blocks: blocks.map((entry, index) => index === 15000 ? replacement : entry) };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    expect(index.adoptTransition(before, after, blockMutationHint([{ position: replacement.position, before: blocks[15000], after: replacement }]))).toBe(true);
    expect(index.get(replacement.position)).toBe(replacement);
    expect(index.rebuildCount).toBe(1);
  });

  it('falls back safely when a hint does not match the indexed before value', () => {
    const before = project([block(0)]); const after = { ...before, blocks: [{ ...before.blocks[0], state: { changed: 'true' } }] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    expect(index.adoptTransition(before, after, blockMutationHint([{ position: { x: 0, y: 0, z: 0 }, before: block(0), after: after.blocks[0] }]))).toBe(false);
    expect(index.get({ x: 0, y: 0, z: 0 })).toBe(after.blocks[0]);
    expect(index.rebuildCountFor('hint-before-mismatch')).toBe(1);
  });

  it('maintains an O(1)-per-layer view through hinted edits', () => {
    const first = { ...block(0), position: { x: 0, y: 4, z: 0 } };
    const second = { ...block(1), position: { x: 1, y: 8, z: 0 } };
    const before = project([first, second]);
    const moved = { ...first, position: { x: 0, y: 9, z: 0 } };
    const after = { ...before, blocks: [moved, second] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    expect(index.blocksAtY(4)).toHaveLength(1);
    expect(index.adoptTransition(before, after, blockMutationHint([{ position: first.position, before: first, after: moved }]))).toBe(true);
    expect(index.blocksAtY(4)).toHaveLength(0);
    expect(index.blocksAtY(9)).toEqual([moved]);
    expect(index.occupiedLayers()).toEqual([8, 9]);
  });

  it('builds exact-id usage buckets in the same traversal as the spatial index', () => {
    const blocks = [typedBlock(0, 'minecraft:stone'), typedBlock(1, 'minecraft:stone'), typedBlock(2, 'minecraft:stone'), typedBlock(3, 'minecraft:dirt'), typedBlock(4, 'minecraft:dirt'), typedBlock(5, 'mod:block', 'missing'), typedBlock(6, 'mod:block', 'missing'), typedBlock(7, 'mod:block', 'missing'), typedBlock(8, 'mod:block', 'missing')];
    const index = new ProjectBlockRuntimeIndex(); index.ensure(project(blocks));
    expect(index.uniqueBlockIdCount()).toBe(3);
    expect(index.usageForId('minecraft:stone')).toEqual({ id: 'minecraft:stone', namespace: 'minecraft', count: 3, resolvedCount: 3, missingCount: 0 });
    expect(index.usageForId('mod:block')).toEqual({ id: 'mod:block', namespace: 'mod', count: 4, resolvedCount: 0, missingCount: 4 });
    expect(index.blocksForId('minecraft:stone')).toHaveLength(3);
  });

  it('updates usage counts and resolved state incrementally without rebuilding', () => {
    const stone = typedBlock(0, 'minecraft:stone');
    const missing = typedBlock(1, 'mod:block', 'missing');
    const before = project([stone, missing]);
    const added = typedBlock(2, 'minecraft:dirt');
    const resolved = typedBlock(1, 'mod:block', 'resolved');
    const after = { ...before, blocks: [stone, resolved, added] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    const rebuilds = index.rebuildCount;
    expect(index.adoptTransition(before, after, blockMutationHint([
      { position: added.position, after: added },
      { position: missing.position, before: missing, after: resolved },
    ]))).toBe(true);
    expect(index.rebuildCount).toBe(rebuilds);
    expect(index.usageForId('minecraft:dirt')?.count).toBe(1);
    expect(index.usageForId('mod:block')).toMatchObject({ count: 1, resolvedCount: 1, missingCount: 0 });
  });

  it('removes zero-count buckets and handles replacement, undo, and redo deltas', () => {
    const stone = typedBlock(0, 'minecraft:stone');
    const dirt = typedBlock(1, 'minecraft:dirt');
    const before = project([stone, dirt]);
    const replaced = typedBlock(0, 'minecraft:gold_block');
    const after = { ...before, blocks: [replaced, dirt] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    expect(index.adoptTransition(before, after, blockMutationHint([{ position: stone.position, before: stone, after: replaced }]))).toBe(true);
    expect(index.usageForId('minecraft:stone')).toBeUndefined();
    expect(index.usageForId('minecraft:gold_block')?.count).toBe(1);
    expect(index.adoptTransition(after, before, blockMutationHint([{ position: replaced.position, before: replaced, after: stone }]))).toBe(true);
    expect(index.usageForId('minecraft:stone')?.count).toBe(1);
    expect(index.usageForId('minecraft:gold_block')).toBeUndefined();
  });

  it('ignores same-id state changes for usage totals', () => {
    const beforeBlock = typedBlock(0, 'minecraft:stone', 'resolved', { facing: 'north' });
    const afterBlock = typedBlock(0, 'minecraft:stone', 'resolved', { facing: 'south' });
    const before = project([beforeBlock]);
    const after = { ...before, blocks: [afterBlock] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    expect(index.adoptTransition(before, after, blockMutationHint([{ position: beforeBlock.position, before: beforeBlock, after: afterBlock }]))).toBe(true);
    expect(index.usageForId('minecraft:stone')).toMatchObject({ count: 1, resolvedCount: 1, missingCount: 0 });
  });

  it('adopts group membership metadata without usage revision or index rebuild', () => {
    const beforeBlock = { ...typedBlock(0, 'minecraft:stone'), groupIds: undefined };
    const afterBlock = { ...beforeBlock, groupIds: ['roof'] };
    const before = project([beforeBlock]);
    const after = { ...before, blocks: [afterBlock], groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }] };
    const index = new ProjectBlockRuntimeIndex(); index.ensure(before);
    const rebuilds = index.rebuildCount;
    const usageRevision = index.usageRevision();
    expect(index.adoptTransition(before, after, metadataMutationHint([{ position: beforeBlock.position, before: beforeBlock, after: afterBlock }], [], 'group-membership'))).toBe(true);
    expect(index.get(afterBlock.position)).toBe(afterBlock);
    expect(index.usageForId('minecraft:stone')).toEqual({ id: 'minecraft:stone', namespace: 'minecraft', count: 1, resolvedCount: 1, missingCount: 0 });
    expect(index.usageRevision()).toBe(usageRevision);
    expect(index.rebuildCount).toBe(rebuilds);
  });

  it('counts visible layer blocks by group-membership signature and updates metadata incrementally', () => {
    const mixed = { ...typedBlock(0, 'minecraft:stone'), groupIds: ['roof', 'entrance'] };
    const roofOnly = { ...typedBlock(1, 'minecraft:stone'), groupIds: ['roof'] };
    const ungrouped = typedBlock(2, 'minecraft:stone');
    const upper = { ...typedBlock(3, 'minecraft:stone'), position: { x: 3, y: 1, z: 0 }, groupIds: ['entrance'] };
    const before = project([mixed, roofOnly, ungrouped, upper]);
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(before);

    expect(index.blockCountAtYForPresentation(0, new Set(['roof']))).toBe(1);
    expect(index.blockCountAtYForPresentation(0, new Set(), 'entrance')).toBe(1);
    expect(index.blockCountAtYForPresentation(0, new Set(['roof']), 'entrance')).toBe(0);

    const changed = { ...mixed, groupIds: ['entrance'] };
    const after = { ...before, blocks: [changed, roofOnly, ungrouped, upper] };
    expect(index.adoptTransition(before, after, metadataMutationHint([{ position: mixed.position, before: mixed, after: changed }], [], 'group-membership'))).toBe(true);

    expect(index.blockCountAtYForPresentation(0, new Set(['roof']))).toBe(2);
    expect(index.blockCountAtYForPresentation(0, new Set(), 'entrance')).toBe(1);
    expect(index.blockCountAtYForPresentation(1, new Set(['roof']))).toBe(1);
  });
});

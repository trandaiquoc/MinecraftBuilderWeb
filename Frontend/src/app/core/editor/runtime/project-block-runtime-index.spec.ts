import { describe, expect, it } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { blockMutationHint } from '../mutations/project-mutation-hint';
import { ProjectBlockRuntimeIndex } from './project-block-runtime-index';

const block = (x: number, state: Record<string, string> = {}): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state });
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
});

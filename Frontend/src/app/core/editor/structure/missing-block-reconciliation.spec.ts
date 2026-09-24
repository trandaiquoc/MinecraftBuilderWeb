import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { reconcileMissingBlocks, reconcileMissingBlocksCooperatively, MISSING_BLOCK_RECONCILIATION_BATCH_SIZE } from './missing-block-reconciliation';
import type { ProjectDocument } from '../../domain/project.types';

const definition: BlockDefinition = {
  id: 'example:marble', namespace: 'authoritative', displayName: 'Marble', defaultState: { facing: 'north', polished: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'polished', values: ['true', 'false'] }], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'verified-fixture',
};

function project(blocks: ProjectDocument['blocks']): ProjectDocument {
  return { schemaVersion: 3, id: 'project', metadata: { name: 'Project', minecraftVersion: '1.21.1', createdAt: '2026-01-01', updatedAt: '2026-01-02' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks, groups: [{ id: 'group-1', name: 'Imported', visible: true, locked: false }], editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 } };
}

describe('missing block reconciliation', () => {
  it('leaves unavailable blocks unchanged and returns the same project reference', () => {
    const block = { kind: 'missing' as const, id: 'example:unknown', namespace: 'example', position: { x: 1, y: 2, z: 3 }, state: { variant: 'raw' }, groupIds: ['group-1'], blockEntityData: { custom: true } };
    const before = project([block]);
    const result = reconcileMissingBlocks(before, () => undefined);
    expect(result.project).toBe(before);
    expect(result.project.blocks[0]).toBe(block);
    expect(result.stillMissingCount).toBe(1);
  });

  it('resolves compatible partial state with authoritative namespace and preserves metadata', () => {
    const block = { kind: 'missing' as const, id: definition.id, namespace: 'old', position: { x: 1, y: 2, z: 3 }, state: { facing: 'south' }, groupIds: ['group-1'], blockEntityData: { custom: true } };
    const before = project([block]);
    const result = reconcileMissingBlocks(before, () => definition);
    expect(result.project).not.toBe(before);
    expect(result.project.blocks[0]).toEqual({ ...block, kind: 'resolved', namespace: 'authoritative', state: { facing: 'south', polished: 'false' } });
    expect(result.resolvedCount).toBe(1);
    expect(result.stillMissingCount).toBe(0);
  });

  it('keeps incompatible state missing without rewriting the original block', () => {
    const block = { kind: 'missing' as const, id: definition.id, namespace: 'example', position: { x: 0, y: 0, z: 0 }, state: { facing: 'up' } };
    const before = project([block]);
    const result = reconcileMissingBlocks(before, () => definition);
    expect(result.project).toBe(before);
    expect(result.project.blocks[0]).toBe(block);
    expect(result.incompatibleCount).toBe(1);
    expect(result.stillMissingCount).toBe(1);
  });

  it('does not rewrite already resolved blocks and preserves the project reference when nothing is eligible', () => {
    const block = { kind: 'resolved' as const, id: definition.id, namespace: definition.namespace, position: { x: 0, y: 0, z: 0 }, state: definition.defaultState };
    const before = project([block]);
    const result = reconcileMissingBlocks(before, () => definition);
    expect(result.project).toBe(before);
    expect(result.project.blocks[0]).toBe(block);
  });

  it('processes a large missing list in cooperative batches', async () => {
    const blocks = Array.from({ length: MISSING_BLOCK_RECONCILIATION_BATCH_SIZE + 1 }, (_, index) => ({ kind: 'missing' as const, id: definition.id, namespace: 'example', position: { x: index, y: 0, z: 0 }, state: {} }));
    let yields = 0;
    const result = await reconcileMissingBlocksCooperatively(project(blocks), () => definition, MISSING_BLOCK_RECONCILIATION_BATCH_SIZE, async () => { yields += 1; });
    expect(result.resolvedCount).toBe(blocks.length);
    expect(yields).toBe(1);
  });
});

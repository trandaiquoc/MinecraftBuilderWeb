import { describe, expect, it } from 'vitest';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { HistoryService } from '../../editor/history/history.service';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { validateStructureJsonPreview } from './structure-json-import';
import type { StructureJsonBlockV1, StructureJsonV1 } from './structure-json';
import { applyStructureJsonImportPlan, buildStructureJsonImportPlan } from './structure-json-import-plan';

const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };
const stairs: BlockDefinition = { ...stone, id: 'minecraft:oak_stairs', displayName: 'Oak Stairs', defaultState: { facing: 'north', half: 'bottom' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }] };
const definitions = (id: string): BlockDefinition | undefined => id === stone.id ? stone : id === stairs.id ? stairs : undefined;
const base: ProjectDocument = {
  schemaVersion: 3,
  id: 'import-plan',
  metadata: { name: 'Original', minecraftVersion: '1.21.1', createdAt: 'created', updatedAt: 'old' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [{ kind: 'resolved', id: stone.id, namespace: stone.namespace, position: { x: 3, y: 3, z: 3 }, state: {} }],
  groups: [{ id: 'group-1', name: 'Keep', visible: true, locked: false }],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
  decorations: [{ instanceId: 'painting-1', kind: 'painting', entityTypeId: 'minecraft:painting', anchor: { x: 0, y: 0, z: 0 }, facing: 'north', variantId: 'kebab' }],
};

function source(blocks: readonly StructureJsonBlockV1[], name?: string): StructureJsonV1 { return { format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', ...(name ? { name } : {}), blocks }; }
function planFor(value: ReturnType<typeof source>, project: ProjectDocument, mode: Parameters<typeof buildStructureJsonImportPlan>[4]) { const validation = validateStructureJsonPreview(JSON.stringify(value), project.size, definitions); return buildStructureJsonImportPlan(value, validation, project, definitions, mode); }

describe('Structure JSON import plan', () => {
  it('materializes resolved defaults and preserves missing block data', () => {
    const value = source([{ id: stairs.id, x: 0, y: 0, z: 0, state: { facing: 'south' } }, { id: 'mod:marble', x: 1, y: 0, z: 0, state: { variant: 'polished' } }]);
    const plan = planFor(value, base, 'replace');
    expect(plan.applicable).toBe(true);
    expect(plan.resolvedBlockCount).toBe(1);
    expect(plan.missingBlockCount).toBe(1);
    expect(plan.importedBlocks[0]).toMatchObject({ kind: 'resolved', namespace: 'minecraft', state: { facing: 'south', half: 'bottom' } });
    expect(plan.importedBlocks[1]).toMatchObject({ kind: 'missing', id: 'mod:marble', namespace: 'mod', state: { variant: 'polished' } });
  });

  it('blocks structural validation failures while allowing missing blocks as placeholders', () => {
    const value = source([
      { id: stone.id, x: 4, y: 0, z: 0 },
      { id: stone.id, x: 1, y: 0, z: 0 },
      { id: stone.id, x: 1, y: 0, z: 0 },
      { id: stairs.id, x: 2, y: 0, z: 0, state: { half: 'middle' } },
      { id: 'mod:marble', x: 3, y: 0, z: 0 },
    ]);
    const plan = planFor(value, base, 'replace');
    expect(plan.applicable).toBe(false);
    expect(plan.blockingIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['out-of-bounds', 'duplicate-coordinate', 'invalid-state']));
    expect(plan.missingBlockCount).toBe(1);
    expect(plan.importedBlocks.at(-1)).toMatchObject({ kind: 'missing', id: 'mod:marble' });
  });

  it('replaces only blocks while preserving project metadata, groups and decorations', () => {
    const plan = planFor(source([{ id: stone.id, x: 0, y: 0, z: 0 }]), base, 'replace');
    const result = applyStructureJsonImportPlan(base, plan, definitions);
    expect(result?.blocks).toHaveLength(1);
    expect(result?.groups).toEqual(base.groups);
    expect(result?.decorations).toEqual(base.decorations);
    expect(result?.metadata.name).toBe(base.metadata.name);
    expect(result?.size).toEqual(base.size);
    expect(result?.editorSettings).toEqual(base.editorSettings);
    expect(result?.metadata.updatedAt).not.toBe(base.metadata.updatedAt);
  });

  it('blocks replacement when a current block belongs to a locked group', () => {
    const locked: ProjectDocument = { ...base, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [{ ...base.blocks[0], groupIds: ['locked'] }] };
    const plan = planFor(source([{ id: stone.id, x: 0, y: 0, z: 0 }]), locked, 'replace');
    expect(plan.applicable).toBe(false);
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'locked-current-blocks', count: 1 }));
    expect(applyStructureJsonImportPlan(locked, plan, definitions)).toBeUndefined();
  });

  it('merges only empty coordinates and blocks the whole operation on any collision', () => {
    const value = source([{ id: stone.id, x: 3, y: 3, z: 3 }, { id: stone.id, x: 2, y: 2, z: 2 }]);
    const plan = planFor(value, base, 'merge');
    expect(plan.currentConflictCount).toBe(1);
    expect(plan.applicable).toBe(false);
    expect(applyStructureJsonImportPlan(base, plan, definitions)).toBeUndefined();
    const valid = planFor(source([{ id: stone.id, x: 2, y: 2, z: 2 }]), base, 'merge');
    const merged = applyStructureJsonImportPlan(base, valid, definitions);
    expect(merged?.blocks.map((block) => block.position)).toEqual([{ x: 3, y: 3, z: 3 }, { x: 2, y: 2, z: 2 }]);
  });

  it('creates one uniquely named group and assigns every imported block', () => {
    const plan = planFor(source([{ id: stone.id, x: 0, y: 0, z: 0 }, { id: stone.id, x: 1, y: 0, z: 0 }], 'Keep'), base, 'new-group');
    expect(plan.newGroup).toEqual({ id: 'group-2', name: 'Keep (2)' });
    const result = applyStructureJsonImportPlan(base, plan, definitions);
    expect(result?.groups).toHaveLength(2);
    expect(result?.groups.at(-1)?.name).toBe('Keep (2)');
    expect(result?.blocks.slice(1).every((block) => block.groupIds?.length === 1 && block.groupIds[0] === result.groups.at(-1)?.id)).toBe(true);
  });

  it('handles empty imports deliberately and avoids meaningless merge/group operations', () => {
    const empty = planFor(source([]), base, 'replace');
    expect(empty.applicable).toBe(true);
    expect(applyStructureJsonImportPlan(base, empty, definitions)?.blocks).toEqual([]);
    expect(planFor(source([]), base, 'merge').applicable).toBe(false);
    expect(planFor(source([]), base, 'new-group').applicable).toBe(false);
  });

  it('restores the exact pre-import document with one history entry', () => {
    const workspace = new WorkspaceStateService(); const history = new HistoryService(workspace); workspace.project.set(base);
    const plan = planFor(source([{ id: stone.id, x: 0, y: 0, z: 0 }]), base, 'replace');
    expect(history.execute('Import Structure JSON', (current) => applyStructureJsonImportPlan(current, plan, definitions))).toBe(true);
    const imported = workspace.project();
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(workspace.project()).toEqual(base);
    expect(history.redo()).toBe(true);
    expect(workspace.project()).toEqual(imported);
  });
});

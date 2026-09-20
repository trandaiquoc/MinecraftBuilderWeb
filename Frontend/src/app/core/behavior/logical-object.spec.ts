import { describe, expect, it } from 'vitest';
import { BlockCatalog } from '../blocks/block-catalog';
import { representativeBlockFixture } from '../blocks/block-catalog.fixture';
import { PlacedBlock, ProjectDocument } from '../domain/project.types';
import { SelectionService } from '../editor/selection/selection.service';
import { normalizeLogicalObjectMemberships, resolveLogicalObjectParts, transformPairedHorizontal } from './logical-object';

const catalog = new BlockCatalog(); catalog.load(representativeBlockFixture);
const lookup = (id: string) => catalog.get(id);
const pair = (id: 'minecraft:oak_door' | 'minecraft:sunflower'): readonly PlacedBlock[] => [
  { kind: 'resolved', id, namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { ...lookup(id)!.defaultState, half: 'lower' } },
  { kind: 'resolved', id, namespace: 'minecraft', position: { x: 2, y: 2, z: 2 }, state: { ...lookup(id)!.defaultState, half: 'upper' } },
];
const bedPair = (): readonly PlacedBlock[] => [
  { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { facing: 'east', part: 'foot', occupied: 'true' } },
  { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 3, y: 1, z: 2 }, state: { facing: 'east', part: 'head', occupied: 'true' } },
];
const project = (blocks: readonly PlacedBlock[]): ProjectDocument => ({ schemaVersion: 2, id: 'logical', metadata: { name: 'Logical', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks, groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } });

describe('logical multi-block objects', () => {
  it.each(['minecraft:oak_door', 'minecraft:sunflower'] as const)('resolves both halves from either %s half', (id) => {
    const blocks = pair(id);
    expect(resolveLogicalObjectParts(blocks, blocks[0].position, lookup)).toHaveLength(2);
    expect(resolveLogicalObjectParts(blocks, blocks[1].position, lookup)).toHaveLength(2);
  });

  it('expands single and box selection to the complete object', () => {
    const document = project(pair('minecraft:oak_door')); const selection = new SelectionService();
    selection.selectLogical({ x: 2, y: 1, z: 2 }, document, lookup); expect(selection.logicalPositions()).toHaveLength(2);
    selection.selectBoxLogical({ min: { x: 2, y: 1, z: 2 }, max: { x: 2, y: 1, z: 2 } }, document, lookup); expect(selection.logicalPositions()).toHaveLength(2);
  });

  it('repairs partial membership by union without losing existing groups', () => {
    const [lower, upper] = pair('minecraft:oak_door');
    const repaired = normalizeLogicalObjectMemberships(project([{ ...lower, groupIds: ['roof'] }, { ...upper, groupIds: ['entrance'] }]), lookup);
    expect(repaired.blocks[0].groupIds).toEqual(['roof', 'entrance']); expect(repaired.blocks[1].groupIds).toEqual(['roof', 'entrance']);
  });

  it('resolves and selects both bed parts from head or foot while preserving imported occupied state', () => {
    const blocks = bedPair(); const document = project(blocks); const selection = new SelectionService();
    expect(resolveLogicalObjectParts(blocks, blocks[0].position, lookup)).toHaveLength(2);
    expect(resolveLogicalObjectParts(blocks, blocks[1].position, lookup)).toHaveLength(2);
    selection.selectLogical(blocks[1].position, document, lookup);
    expect(selection.logicalPositions()).toHaveLength(2);
    expect(blocks.every((block) => block.state['occupied'] === 'true')).toBe(true);
  });

  it('expands a box touching one bed part and repairs partial bed membership', () => {
    const [foot, head] = bedPair(); const document = project([{ ...foot, groupIds: ['roof'] }, head]); const selection = new SelectionService();
    selection.selectBoxLogical({ min: foot.position, max: foot.position }, document, lookup);
    expect(selection.logicalPositions()).toHaveLength(2);
    const repaired = normalizeLogicalObjectMemberships(document, lookup);
    expect(repaired.blocks.every((block) => block.groupIds?.includes('roof'))).toBe(true);
  });

  it('rotates a bed atomically around the foot anchor', () => {
    const [foot, head] = bedPair(); const document = project([foot, head]);
    const rotated = transformPairedHorizontal(document, head.position, 'north', lookup)!;
    expect(rotated.blocks.find((block) => block.state['part'] === 'foot')).toMatchObject({ position: { x: 2, y: 1, z: 2 }, state: { facing: 'north' } });
    expect(rotated.blocks.find((block) => block.state['part'] === 'head')).toMatchObject({ position: { x: 2, y: 1, z: 1 }, state: { facing: 'north' } });
  });

  it('rejects bed rotation atomically when the new head collides or leaves bounds', () => {
    const [foot, head] = bedPair(); const collision = project([foot, head, { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 2, y: 1, z: 1 }, state: {} }]);
    expect(transformPairedHorizontal(collision, foot.position, 'north', lookup)).toBeUndefined();
    const edge = project([{ ...foot, position: { x: 0, y: 1, z: 0 } }, { ...head, position: { x: 1, y: 1, z: 0 } }]);
    expect(transformPairedHorizontal(edge, { x: 0, y: 1, z: 0 }, 'west', lookup)).toBeUndefined();
  });
});

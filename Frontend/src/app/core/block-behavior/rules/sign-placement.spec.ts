import { describe, expect, it } from 'vitest';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { BlockRuleEngine, minecraftSignRotation } from './block-rule-engine';

const definitions = new Map<string, BlockDefinition>([
  ['minecraft:stone', definition('minecraft:stone', { kind: 'solid' })],
  ['minecraft:chain', definition('minecraft:chain', { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' })],
  ['minecraft:oak_sign', definition('minecraft:oak_sign', { kind: 'standing-sign', rotationProperty: 'rotation', wallBlockId: 'minecraft:oak_wall_sign' })],
  ['minecraft:oak_wall_sign', definition('minecraft:oak_wall_sign', { kind: 'wall-sign', facingProperty: 'facing' })],
  ['minecraft:oak_hanging_sign', definition('minecraft:oak_hanging_sign', { kind: 'hanging-sign', rotationProperty: 'rotation', attachedProperty: 'attached', wallBlockId: 'minecraft:oak_wall_hanging_sign' })],
  ['minecraft:oak_wall_hanging_sign', definition('minecraft:oak_wall_hanging_sign', { kind: 'wall-hanging-sign', facingProperty: 'facing' })],
  ['minecraft:soul_torch', definition('minecraft:soul_torch', { kind: 'torch-placement', wallBlockId: 'minecraft:soul_wall_torch' })],
  ['minecraft:soul_wall_torch', definition('minecraft:soul_wall_torch', { kind: 'wall-mounted', facingProperty: 'facing' })],
  ['minecraft:red_wall_banner', definition('minecraft:red_wall_banner', { kind: 'wall-mounted', facingProperty: 'facing' })],
]);
const engine = new BlockRuleEngine((id) => definitions.get(id));
const base: ProjectDocument = { schemaVersion: 2, id: 'signs', metadata: { name: 'Signs', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
const block = (id: string, position: { x: number; y: number; z: number }): PlacedBlock => ({ kind: 'resolved', id, namespace: 'minecraft', position, state: definitions.get(id)?.defaultState ?? {} });

describe('verified Java 1.21.1 sign placement', () => {
  it('places a standing sign on solid or virtual floor support with a sixteen-way rotation', () => {
    const project = { ...base, blocks: [block('minecraft:stone', { x: 3, y: 0, z: 3 })] };
    const result = engine.place(project, block('minecraft:oak_sign', { x: 3, y: 1, z: 3 }), { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 90 });
    expect(result.validation.status).toBe('valid');
    expect(result.project?.blocks.at(-1)?.state['rotation']).toBe('12');
    expect(engine.place(base, block('minecraft:oak_sign', { x: 3, y: 0, z: 3 }), { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 180 }).validation.status).toBe('valid');
  });
  it('keeps every registry variant strict and never auto-converts a selected ID', () => {
    const project = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 2, z: 3 })] };
    expect(engine.place(project, block('minecraft:oak_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 1, y: 0, z: 0 } }).project).toBeUndefined();
    expect(engine.place(project, block('minecraft:oak_wall_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: 1, z: 0 } }).project).toBeUndefined();
    expect(engine.place(project, block('minecraft:oak_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 1, y: 0, z: 0 } }).project).toBeUndefined();
    expect(engine.place(project, block('minecraft:oak_wall_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: -1, z: 0 } }).project).toBeUndefined();
    expect(engine.place(project, block('minecraft:oak_wall_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 1, y: 0, z: 0 } }).project?.blocks.at(-1)?.id).toBe('minecraft:oak_wall_sign');
  });
  it('requires verified upper support for a hanging sign and derives attached for solid support', () => {
    expect(engine.place(base, block('minecraft:oak_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: -1, z: 0 } }).validation.reason).toBe('missing-support');
    const project = { ...base, blocks: [block('minecraft:stone', { x: 3, y: 3, z: 3 })] };
    expect(engine.place(project, block('minecraft:oak_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: -1, z: 0 } }).project?.blocks.at(-1)?.state['attached']).toBe('true');
    const chain = { ...base, blocks: [{ ...block('minecraft:chain', { x: 3, y: 3, z: 3 }), state: { axis: 'y' } }] };
    expect(engine.place(chain, block('minecraft:oak_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: -1, z: 0 } }).project?.blocks.at(-1)?.state['attached']).toBe('false');
    expect(engine.place(project, block('minecraft:oak_hanging_sign', { x: 3, y: 2, z: 3 }), undefined).validation.status).toBe('valid');
  });
  it('maps Java cardinal camera yaw and diagonal yaw to the verified sixteen rotations', () => {
    expect([minecraftSignRotation(180), minecraftSignRotation(-90), minecraftSignRotation(0), minecraftSignRotation(90)]).toEqual(['0', '4', '8', '12']);
    expect(minecraftSignRotation(22.5)).toBe('9');
  });
  it('uses perpendicular support for wall hanging signs and compatible wall-hanging neighbors', () => {
    const sideSupport = { ...base, blocks: [block('minecraft:stone', { x: 3, y: 2, z: 4 })] };
    expect(engine.place(sideSupport, block('minecraft:oak_wall_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: 0, z: -1 } }).validation.status).toBe('valid');
    const connected = { ...base, blocks: [{ ...block('minecraft:oak_wall_hanging_sign', { x: 3, y: 2, z: 4 }), state: { facing: 'west' } }] };
    expect(engine.place(connected, block('minecraft:oak_wall_hanging_sign', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 0, y: 0, z: -1 } }).validation.status).toBe('valid');
  });
  it('resolves contextual soul torch and wall banner variants with facing state', () => {
    const project = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 2, z: 3 })] };
    const torch = engine.place(project, block('minecraft:soul_torch', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(torch.validation.status).toBe('valid');
    expect(torch.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:soul_wall_torch', state: { facing: 'east' } });
    const banner = engine.place(project, block('minecraft:red_wall_banner', { x: 3, y: 2, z: 3 }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(banner.validation.status).toBe('valid');
    expect(banner.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:red_wall_banner', state: { facing: 'east' } });
  });
});

function definition(id: string, behavior: BlockDefinition['behavior']): BlockDefinition {
  return { id, namespace: 'minecraft', displayName: id, defaultState: behavior?.kind === 'standing-sign' ? { rotation: '0', waterlogged: 'false' } : behavior?.kind === 'hanging-sign' ? { rotation: '0', attached: 'false', waterlogged: 'false' } : behavior?.kind === 'wall-mounted' || behavior?.kind === 'wall-sign' || behavior?.kind === 'wall-hanging-sign' ? { facing: 'north', waterlogged: 'false' } : {}, stateDefinitions: [], resources: { textures: [] }, behaviorSupport: 'full', visualSupport: 'partial', visualClassification: 'special-renderer-required', defaultStateSource: 'verified-fixture', support: 'full', behavior };
}

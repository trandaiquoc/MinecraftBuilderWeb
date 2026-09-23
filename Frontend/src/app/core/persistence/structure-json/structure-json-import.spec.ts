import { describe, expect, it } from 'vitest';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { validateStructureJsonPreview } from './structure-json-import';

const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };
const stairs: BlockDefinition = { ...stone, id: 'minecraft:oak_stairs', displayName: 'Oak Stairs', defaultState: { facing: 'north', half: 'bottom' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }] };
const size = { x: 2, y: 2, z: 2 };
const json = (blocks: unknown[]) => JSON.stringify({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks });

describe('Structure JSON import validation preview', () => {
  it('classifies valid, missing, duplicate and out-of-bounds blocks in one pass', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'mod:missing', x: 1, y: 0, z: 0 }, { id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 2, y: 0, z: 0 }]), size, (id) => id === stone.id ? stone : undefined);
    expect(result.structuralValid).toBe(true);
    expect(result.validBlocks).toBe(1);
    expect(result.missingBlocks).toBe(1);
    expect(result.duplicateCoordinates).toBe(1);
    expect(result.outOfBounds).toBe(1);
  });

  it('validates known state overrides while preserving missing block state', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:oak_stairs', x: 0, y: 0, z: 0, state: { facing: 'south' } }, { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'west' } }, { id: 'mod:missing', x: 0, y: 1, z: 0, state: { custom: 'value' } }]), size, (id) => id === stone.id ? stone : id === stairs.id ? stairs : undefined);
    expect(result.invalidStates).toBe(1);
    expect(result.missingBlocks).toBe(1);
    expect(result.issues.missing[0].id).toBe('mod:missing');
  });

  it('reports structural errors without consulting the catalog', () => {
    let lookups = 0;
    const result = validateStructureJsonPreview('{', size, () => { lookups += 1; return stone; });
    expect(result.structuralValid).toBe(false);
    expect(lookups).toBe(0);
  });
});

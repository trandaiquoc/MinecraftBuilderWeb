import { describe, expect, it } from 'vitest';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { validateParsedStructureJsonPreviewAsync, validateStructureJsonPreview, STRUCTURE_JSON_VALIDATION_CHUNK_SIZE } from './structure-json-import';

const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };
const stairs: BlockDefinition = { ...stone, id: 'minecraft:oak_stairs', displayName: 'Oak Stairs', defaultState: { facing: 'north', half: 'bottom' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }] };
const size = { x: 2, y: 2, z: 2 };
const json = (blocks: unknown[]) => JSON.stringify({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks });

describe('Structure JSON import validation preview', () => {
  it('classifies valid, missing, duplicate and out-of-bounds blocks in one pass', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'mod:missing', x: 1, y: 0, z: 0 }, { id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 2, y: 0, z: 0 }]), size, (id) => id === stone.id ? stone : undefined);
    expect(result.structuralValid).toBe(true);
    expect(result.validBlocks).toBe(0);
    expect(result.missingBlocks).toBe(1);
    expect(result.duplicateCoordinates).toBe(1);
    expect(result.affectedDuplicateBlocks).toBe(2);
    expect(result.outOfBounds).toBe(1);
    expect(result.issues.missing[0].reason).toEqual({ code: 'missing-block' });
    expect(result.issues.bounds[0].reason).toEqual({ code: 'out-of-bounds' });
  });

  it('excludes every block in a duplicate coordinate group from valid blocks', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 0, y: 0, z: 0 }]), size, () => stone);
    expect(result.validBlocks).toBe(0);
    expect(result.duplicateCoordinates).toBe(1);
    expect(result.affectedDuplicateBlocks).toBe(3);
    expect(result.issues.duplicate[0].blockIndexes).toEqual([0, 1, 2]);
  });

  it('keeps two unique valid blocks fully valid', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 1, y: 0, z: 0 }]), size, () => stone);
    expect(result.totalBlocks).toBe(2);
    expect(result.validBlocks).toBe(2);
    expect(result.missingBlocks + result.outOfBounds + result.invalidStates + result.duplicateCoordinates).toBe(0);
  });

  it('validates known state overrides while preserving missing block state', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:oak_stairs', x: 0, y: 0, z: 0, state: { facing: 'south' } }, { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'west' } }, { id: 'mod:missing', x: 0, y: 1, z: 0, state: { custom: 'value' } }]), size, (id) => id === stone.id ? stone : id === stairs.id ? stairs : undefined);
    expect(result.invalidStates).toBe(1);
    expect(result.missingBlocks).toBe(1);
    expect(result.issues.missing[0].id).toBe('mod:missing');
    expect(result.issues.state[0].reason).toEqual({ code: 'unsupported-state-value', property: 'facing', value: 'west' });
    expect(result.issues.state[0].property).toBe('facing');
    expect(result.issues.state[0].value).toBe('west');
  });

  it('returns structured data for unknown state properties without localized prose', () => {
    const result = validateStructureJsonPreview(json([{ id: 'minecraft:oak_stairs', x: 0, y: 0, z: 0, state: { custom: 'value' } }]), size, (id) => id === stairs.id ? stairs : undefined);
    expect(result.invalidStates).toBe(1);
    expect(result.issues.state[0].reason).toEqual({ code: 'unknown-state-property', property: 'custom' });
    expect(result.issues.state[0].reason).not.toHaveProperty('message');
  });

  it('reports structural errors without consulting the catalog', () => {
    let lookups = 0;
    const result = validateStructureJsonPreview('{', size, () => { lookups += 1; return stone; });
    expect(result.structuralValid).toBe(false);
    expect(lookups).toBe(0);
  });

  it('keeps async validation equivalent to the synchronous validator', async () => {
    const parsed = { format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks: [
      { id: 'minecraft:stone', x: 0, y: 0, z: 0 },
      { id: 'mod:missing', x: 1, y: 0, z: 0 },
      { id: 'minecraft:stone', x: 0, y: 0, z: 0 },
      { id: 'minecraft:stone', x: 9, y: 0, z: 0 },
    ], } as const;
    const sync = validateStructureJsonPreview(JSON.stringify(parsed), size, (id) => id === stone.id ? stone : undefined);
    const asyncResult = await validateParsedStructureJsonPreviewAsync(parsed, size, (id) => id === stone.id ? stone : undefined);
    expect(asyncResult).toEqual(sync);
  });

  it('reports semantic progress at chunk boundaries instead of once per block', async () => {
    const blocks = Array.from({ length: STRUCTURE_JSON_VALIDATION_CHUNK_SIZE * 3 + 5 }, (_, index) => ({ id: 'minecraft:stone', x: index % size.x, y: Math.floor(index / size.x) % size.y, z: Math.floor(index / (size.x * size.y)) }));
    const progress: number[] = [];
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks }, size, () => stone, (completed) => progress.push(completed));
    expect(result?.totalBlocks).toBe(blocks.length);
    expect(progress.at(-1)).toBe(blocks.length);
    expect(progress.length).toBe(Math.ceil(blocks.length / STRUCTURE_JSON_VALIDATION_CHUNK_SIZE));
    expect(progress.length).toBeLessThan(blocks.length);
  });

  it('cancels a large semantic validation between chunks', async () => {
    const blocks = Array.from({ length: STRUCTURE_JSON_VALIDATION_CHUNK_SIZE * 8 }, (_, index) => ({ id: 'minecraft:stone', x: index % size.x, y: 0, z: 0 }));
    let cancelled = false;
    let progressCalls = 0;
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks }, size, () => stone, () => { progressCalls += 1; cancelled = true; }, { isCancelled: () => cancelled });
    expect(result).toBeUndefined();
    expect(progressCalls).toBe(1);
  });

  it('completes a small async validation without an artificial yield', async () => {
    let progressCalls = 0;
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }] }, size, () => stone, () => { progressCalls += 1; });
    expect(result?.validBlocks).toBe(1);
    expect(progressCalls).toBe(1);
  });
});

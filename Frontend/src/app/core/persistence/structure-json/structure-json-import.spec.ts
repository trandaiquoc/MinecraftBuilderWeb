import { describe, expect, it } from 'vitest';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { validateParsedStructureJsonPreviewAsync, validateStructureJsonPreview, STRUCTURE_JSON_VALIDATION_CHUNK_SIZE } from './structure-json-import';
import { buildStructureJsonImportPlan } from './structure-json-import-plan';
import type { ExternalAiContentLimits } from './external-ai-content-limits';

const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };
const stairs: BlockDefinition = { ...stone, id: 'minecraft:oak_stairs', displayName: 'Oak Stairs', defaultState: { facing: 'north', half: 'bottom' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }] };
const dragonWallHead: BlockDefinition = { ...stone, id: 'minecraft:dragon_wall_head', namespace: 'minecraft', displayName: 'Dragon Wall Head', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south', 'east', 'west'] }], behavior: { kind: 'head-placement', wall: true, rotationProperty: 'rotation', facingProperty: 'facing' } };
const chest: BlockDefinition = { ...stone, id: 'minecraft:chest', displayName: 'Chest', capabilities: [{ kind: 'inventory-storage', slotCount: 27, evidence: 'verified' }] };
const dandelion: BlockDefinition = { ...stone, id: 'minecraft:dandelion', displayName: 'Dandelion', support: 'partial', behaviorSupport: 'full', behavior: { kind: 'floor-supported' } };
const sapling: BlockDefinition = { ...stone, id: 'minecraft:oak_sapling', displayName: 'Oak Sapling', support: 'partial', behaviorSupport: 'full', behavior: { kind: 'floor-supported' } };
const size = { x: 2, y: 2, z: 2 };
const json = (blocks: unknown[]) => JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks, decorations: [] });
const limits = (overrides: Partial<ExternalAiContentLimits> = {}): ExternalAiContentLimits => ({ blocks: [], items: [], decorations: [], ...overrides });

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
    const parsed = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [
      { id: 'minecraft:stone', x: 0, y: 0, z: 0 },
      { id: 'mod:missing', x: 1, y: 0, z: 0 },
      { id: 'minecraft:stone', x: 0, y: 0, z: 0 },
      { id: 'minecraft:stone', x: 9, y: 0, z: 0 },
    ], decorations: [], } as const;
    const sync = validateStructureJsonPreview(JSON.stringify(parsed), size, (id) => id === stone.id ? stone : undefined);
    const asyncResult = await validateParsedStructureJsonPreviewAsync(parsed, size, (id) => id === stone.id ? stone : undefined);
    expect(asyncResult).toEqual(sync);
  });

  it('reports semantic progress at chunk boundaries instead of once per block', async () => {
    const blocks = Array.from({ length: STRUCTURE_JSON_VALIDATION_CHUNK_SIZE * 3 + 5 }, (_, index) => ({ id: 'minecraft:stone', x: index % size.x, y: Math.floor(index / size.x) % size.y, z: Math.floor(index / (size.x * size.y)) }));
    const progress: number[] = [];
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks, decorations: [] }, size, () => stone, (completed) => progress.push(completed));
    expect(result?.totalBlocks).toBe(blocks.length);
    expect(progress.at(-1)).toBe(blocks.length);
    expect(progress.length).toBe(Math.ceil(blocks.length / STRUCTURE_JSON_VALIDATION_CHUNK_SIZE));
    expect(progress.length).toBeLessThan(blocks.length);
  });

  it('cancels a large semantic validation between chunks', async () => {
    const blocks = Array.from({ length: STRUCTURE_JSON_VALIDATION_CHUNK_SIZE * 8 }, (_, index) => ({ id: 'minecraft:stone', x: index % size.x, y: 0, z: 0 }));
    let cancelled = false;
    let progressCalls = 0;
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks, decorations: [] }, size, () => stone, () => { progressCalls += 1; cancelled = true; }, { isCancelled: () => cancelled });
    expect(result).toBeUndefined();
    expect(progressCalls).toBe(1);
  });

  it('completes a small async validation without an artificial yield', async () => {
    let progressCalls = 0;
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }], decorations: [] }, size, () => stone, () => { progressCalls += 1; });
    expect(result?.validBlocks).toBe(1);
    expect(progressCalls).toBe(1);
  });

  it('validates a generated 100k source cooperatively with correct counts', async () => {
    const blocks = Array.from({ length: 100_000 }, (_, index) => ({ id: stone.id, x: index % 1000, y: Math.floor(index / 1000), z: 0 }));
    let progressCalls = 0;
    const result = await validateParsedStructureJsonPreviewAsync({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks, decorations: [] }, { x: 1000, y: 100, z: 1 }, () => stone, () => { progressCalls += 1; });
    expect(result?.validBlocks).toBe(100_000);
    expect(result?.duplicateCoordinates).toBe(0);
    expect(progressCalls).toBe(Math.ceil(blocks.length / STRUCTURE_JSON_VALIDATION_CHUNK_SIZE));
    expect(progressCalls).toBeGreaterThan(1);
  }, 30_000);

  it('enforces enabled block limits through canonical placeable identity', () => {
    const get = (id: string) => id === dragonWallHead.id ? dragonWallHead : undefined;
    const value = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: dragonWallHead.id, x: 0, y: 0, z: 0 }], decorations: [] } as const;
    expect(validateStructureJsonPreview(JSON.stringify(value), size, get, undefined, undefined, undefined, { contentLimitsEnabled: false, contentLimits: limits({ blocks: ['minecraft:dragon_head'] }) }).issues.contentLimit).toHaveLength(0);
    const result = validateStructureJsonPreview(JSON.stringify(value), size, get, undefined, undefined, undefined, { contentLimitsEnabled: true, contentLimits: limits({ blocks: ['minecraft:dragon_head'] }) });
    expect(result.issues.contentLimit[0].reason).toEqual({ code: 'content-limit', restrictedId: 'minecraft:dragon_head', path: 'id' });
  });

  it('turns hard content and support issues into import-plan blockers', () => {
    const project = { schemaVersion: 3 as const, id: 'blocked', metadata: { name: 'Blocked', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size, structureMode: 'vanilla-structure-block' as const, blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure' as const, referenceLayerOpacity: 0.5 } };
    const contentSource = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 0, y: 0, z: 0 }], decorations: [] } as const;
    const contentOptions = { contentLimitsEnabled: true, contentLimits: limits({ blocks: [stone.id] }) };
    const contentValidation = validateStructureJsonPreview(JSON.stringify(contentSource), size, (id) => id === stone.id ? stone : undefined, undefined, undefined, undefined, contentOptions);
    const contentPlan = buildStructureJsonImportPlan(contentSource, contentValidation, project, (id) => id === stone.id ? stone : undefined, 'replace', undefined, contentOptions);
    expect(contentPlan.blockingIssues).toContainEqual({ code: 'content-limit', count: 1 });
    expect(contentPlan.applicable).toBe(false);

    const supportSource = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: dandelion.id, x: 0, y: 1, z: 0 }], decorations: [] } as const;
    const supportValidation = validateStructureJsonPreview(JSON.stringify(supportSource), size, (id) => id === dandelion.id ? dandelion : undefined);
    const supportPlan = buildStructureJsonImportPlan(supportSource, supportValidation, project, (id) => id === dandelion.id ? dandelion : undefined, 'replace');
    expect(supportPlan.blockingIssues).toContainEqual({ code: 'missing-support', count: 1 });
    expect(supportPlan.applicable).toBe(false);
  });

  it('reports restricted items in container and item-frame payloads', () => {
    const get = (id: string) => id === chest.id ? chest : id === stone.id ? stone : undefined;
    const value = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: chest.id, x: 0, y: 0, z: 0, blockEntity: { kind: 'container', items: [{ slot: 0, item: { id: 'minecraft:diamond' } }] } }], decorations: [{ kind: 'item-frame', anchor: { x: 0, y: 1, z: 0 }, facing: 'north', item: { id: 'minecraft:diamond' } }] } as const;
    const result = validateStructureJsonPreview(JSON.stringify(value), { x: 2, y: 3, z: 2 }, get, undefined, undefined, undefined, { contentLimitsEnabled: true, contentLimits: limits({ items: ['minecraft:diamond'] }) });
    expect(result.issues.contentLimit).toHaveLength(1);
    expect(result.issues.contentLimit[0].reason).toMatchObject({ restrictedId: 'minecraft:diamond', path: 'blockEntity.items[0].item.id' });
    expect(result.decorationIssues).toContainEqual(expect.objectContaining({ category: 'content-limit', restrictedId: 'minecraft:diamond', path: 'item.id' }));
  });

  it('reports restricted painting variants without confusing held items', () => {
    const value = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [], decorations: [{ kind: 'painting', anchor: { x: 0, y: 0, z: 0 }, facing: 'north', variantId: 'minecraft:kebab' }] } as const;
    const result = validateStructureJsonPreview(JSON.stringify(value), size, () => undefined, undefined, undefined, undefined, { contentLimitsEnabled: true, contentLimits: limits({ decorations: ['minecraft:kebab'] }) });
    expect(result.decorationIssues).toContainEqual(expect.objectContaining({ category: 'content-limit', restrictedId: 'minecraft:kebab' }));
  });

  it('keeps unavailable mod restrictions from authorizing missing content', () => {
    const value = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: 'example:missing', x: 0, y: 0, z: 0 }], decorations: [] } as const;
    const result = validateStructureJsonPreview(JSON.stringify(value), size, () => undefined, undefined, undefined, undefined, { contentLimitsEnabled: true, contentLimits: limits({ blocks: ['example:missing'] }) });
    expect(result.missingBlocks).toBe(1);
  });

  it('hard-blocks verified missing support while leaving unknown behavior alone', () => {
    const get = (id: string) => id === dandelion.id ? dandelion : id === 'example:unknown' ? ({ ...stone, id, namespace: 'example', behaviorSupport: 'unknown' as const } satisfies BlockDefinition) : undefined;
    const supported = validateStructureJsonPreview(json([{ id: stone.id, x: 0, y: 0, z: 0 }, { id: dandelion.id, x: 0, y: 1, z: 0 }]), size, get);
    expect(supported.issues.support).toHaveLength(0);
    const missing = validateStructureJsonPreview(json([{ id: dandelion.id, x: 0, y: 1, z: 0 }]), size, get);
    expect(missing.issues.support).toHaveLength(1);
    const unknown = validateStructureJsonPreview(json([{ id: 'example:unknown', x: 0, y: 1, z: 0 }]), size, get);
    expect(unknown.issues.support).toHaveLength(0);
  });

  it('reports origin, floating, and conservative sapling warnings without blocking import', () => {
    const unverifiedSapling = { ...sapling, behavior: undefined, behaviorSupport: 'unknown' as const } satisfies BlockDefinition;
    const get = (id: string) => id === stone.id ? stone : id === sapling.id ? unverifiedSapling : undefined;
    const value = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 1, y: 1, z: 1 }, { id: sapling.id, x: 2, y: 2, z: 1 }], decorations: [] } as const;
    const result = validateStructureJsonPreview(JSON.stringify(value), { x: 4, y: 4, z: 4 }, get);
    expect(result.issues.warning.map((entry) => entry.reason.code)).toEqual(expect.arrayContaining(['origin-offset', 'possible-floating', 'tree-grounding']));
    const project = { schemaVersion: 3 as const, id: 'warnings', metadata: { name: 'Warnings', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block' as const, blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure' as const, referenceLayerOpacity: 0.5 } };
    const plan = buildStructureJsonImportPlan(value, result, project, get, 'replace');
    expect(plan.applicable).toBe(true);
  });

  it('keeps negative coordinates as hard bounds errors', () => {
    const result = validateStructureJsonPreview(json([{ id: stone.id, x: -1, y: 0, z: 0 }]), size, () => stone);
    expect(result.outOfBounds).toBe(1);
    expect(result.issues.warning).toHaveLength(0);
  });
});

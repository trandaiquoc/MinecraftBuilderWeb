import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { mapBlockEntity, mapDecoration } from './minecraft-structure-semantic-mappers';
import { createDecorationSupportIndex, validateDecorationAgainstProject } from '../../decorations/placement/decoration-placement';
import type { ProjectDocument } from '../../domain/project.types';

const block = (id: string, blockEntityData?: unknown): PlacedBlock => ({ kind: 'resolved', id, namespace: id.split(':')[0], position: { x: 0, y: 0, z: 0 }, state: {}, ...(blockEntityData === undefined ? {} : { blockEntityData } as never) });
const signData = (overrides: Record<string, unknown> = {}) => ({ kind: 'sign' as const, waxed: true, front: { lines: ['A', 'B', 'C', 'D'] as const, color: 'red', glowing: true }, back: { lines: ['', '', '', ''] as const, color: 'blue', glowing: false }, ...overrides });
const project = (blocks: readonly PlacedBlock[], decorations: ProjectDocument['decorations'] = []): ProjectDocument => ({ schemaVersion: 3, id: 'mapper-test', metadata: { name: 'Mapper test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 6, y: 4, z: 6 }, structureMode: 'vanilla-structure-block', blocks, groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 }, decorations });

describe('verified 1.21.1 semantic NBT mappers', () => {
  it('maps standing and hanging signs with native typed fields', () => {
    const standing = mapBlockEntity(block('minecraft:oak_sign', signData()), 0);
    const hanging = mapBlockEntity(block('minecraft:oak_wall_hanging_sign', signData()), 0);
    expect(standing.ok && standing.value?.value['id']).toEqual({ type: 'string', value: 'minecraft:sign' });
    expect(hanging.ok && hanging.value?.value['id']).toEqual({ type: 'string', value: 'minecraft:hanging_sign' });
    if (standing.ok && standing.value?.value['front_text'].type === 'compound') {
      expect(standing.value.value['front_text'].value['messages']).toMatchObject({ type: 'list', elementType: 'string' });
      expect(standing.value.value['front_text'].value['has_glowing_text']).toEqual({ type: 'byte', value: 1 });
    }
    const text = mapBlockEntity(block('minecraft:oak_sign', signData({ front: { lines: ['"quoted"', '\\path', '\u0110', ''] as const, filteredMessages: ['"safe"', '', '', ''] as const, color: 'red', glowing: false } })), 0);
    if (text.ok && text.value?.value['front_text'].type === 'compound') {
      const messages = text.value.value['front_text'].value['messages'];
      const filtered = text.value.value['front_text'].value['filtered_messages'];
      expect(messages?.type === 'list' && messages.value[0]).toEqual({ type: 'string', value: JSON.stringify('"quoted"') });
      expect(filtered?.type === 'list' && filtered.value[0]).toEqual({ type: 'string', value: '"safe"' });
    }
  });

  it('rejects invalid sign colors and non-empty raw fields', () => {
    expect(mapBlockEntity(block('minecraft:oak_sign', { ...signData(), raw: {} }), 0).ok).toBe(true);
    expect(mapBlockEntity(block('minecraft:oak_sign', signData({ front: { lines: ['A', '', '', ''] as const, color: 'not-a-color', glowing: false } })), 0)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-block-entity' } });
    expect(mapBlockEntity(block('minecraft:oak_sign', { ...signData(), raw: { future: true } }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-raw-nbt' } });
  });

  it('maps decorated pot sherds without normalizing valid namespaced IDs', () => {
    const mapped = mapBlockEntity(block('minecraft:decorated_pot', { kind: 'decorated-pot', decorations: { back: 'example:custom_sherd', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' } }), 0);
    expect(mapped.ok).toBe(true);
    if (mapped.ok && mapped.value?.value['sherds']?.type === 'list') expect(mapped.value.value['sherds'].value.map((entry) => entry.type === 'string' ? entry.value : '')).toEqual(['example:custom_sherd', 'minecraft:brick', 'minecraft:brick', 'minecraft:brick']);
    expect(mapBlockEntity(block('minecraft:decorated_pot', { kind: 'decorated-pot', decorations: { back: 'not valid', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' } }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-block-entity' } });
    const allBrick = mapBlockEntity(block('minecraft:decorated_pot', { kind: 'decorated-pot', decorations: { back: 'minecraft:brick', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' } }), 0);
    expect(allBrick.ok && allBrick.value?.value['sherds']).toBeUndefined();
    const withItem = mapBlockEntity(block('minecraft:decorated_pot', { kind: 'decorated-pot', decorations: { back: 'minecraft:brick', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' }, item: { id: 'minecraft:diamond', count: 1 } }), 0);
    expect(withItem.ok && withItem.value?.value['item']).toMatchObject({ type: 'compound' });
    expect(mapBlockEntity(block('minecraft:decorated_pot', { kind: 'decorated-pot', decorations: { back: 'minecraft:brick', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' }, item: { id: 'not valid', count: 1 } }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-entity-item' } });
  });

  it('maps verified chest, barrel and hopper inventories with block-specific capacities', () => {
    const emptyChest = mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [] }), 0);
    expect(emptyChest.ok && emptyChest.value?.value['Items']).toEqual({ type: 'list', elementType: 'compound', value: [] });
    const chest = mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 0, stack: { id: 'minecraft:diamond', count: 1 } }, { slot: 26, stack: { id: 'example:gem', count: 2 } }] }), 0);
    expect(chest.ok && chest.value?.value['id']).toEqual({ type: 'string', value: 'minecraft:chest' });
    expect(chest.ok && chest.value?.value['Items']).toMatchObject({ type: 'list', elementType: 'compound' });
    if (chest.ok && chest.value?.value['Items']?.type === 'list') expect(chest.value.value['Items'].value[0]).toMatchObject({ type: 'compound', value: { Slot: { type: 'byte', value: 0 }, id: { type: 'string', value: 'minecraft:diamond' }, count: { type: 'int', value: 1 } } });
    expect(mapBlockEntity(block('minecraft:barrel', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 27, stack: { id: 'minecraft:stone', count: 1 } }] }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-block-entity' } });
    const hopper = mapBlockEntity(block('minecraft:hopper', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 4, stack: { id: 'minecraft:stone', count: 1 } }] }), 0);
    expect(hopper.ok && hopper.value?.value['id']).toEqual({ type: 'string', value: 'minecraft:hopper' });
    expect(hopper.ok && hopper.value?.value['TransferCooldown']).toEqual({ type: 'int', value: 0 });
    expect(mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 0 }, { slot: 0 }] }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-block-entity' } });
    expect(mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 0, stack: { id: 'minecraft:diamond', count: 1, components: {} } }] }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-raw-nbt' } });
    expect(mapBlockEntity(block('minecraft:barrel', { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 0, stack: { id: 'minecraft:stone', count: 1 } }], raw: { kind: 'item-container', hostKind: 'inventory-storage', slots: [] } }), 0).ok).toBe(true);
    expect(mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [], raw: { future: true } }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-raw-nbt' } });
    expect(mapBlockEntity(block('minecraft:chest', { kind: 'item-container', hostKind: 'inventory-storage', slots: [], raw: { kind: 'item-container', hostKind: 'inventory-storage', slots: [{ slot: 0, stack: { id: 'not valid', count: 1 } }] } }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-raw-nbt' } });
    expect(mapBlockEntity(block('minecraft:furnace', { kind: 'item-container', hostKind: 'inventory-storage', slots: [] }), 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-block-entity' } });
  });

  it('validates exact project support for frames and complete painting footprints', () => {
    const stone = (position: { x: number; y: number; z: number }): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} });
    const frame = (facing: 'north' | 'south' | 'east' | 'west', kind: 'item-frame' | 'glow-item-frame' = 'item-frame') => ({ instanceId: `${kind}-${facing}`, kind, entityTypeId: kind === 'item-frame' ? 'minecraft:item_frame' as const : 'minecraft:glow_item_frame' as const, anchor: { x: 2, y: 1, z: 2 }, facing });
    for (const facing of ['north', 'south', 'east', 'west'] as const) {
      const direction = { north: { x: 0, y: 0, z: 1 }, south: { x: 0, y: 0, z: -1 }, east: { x: -1, y: 0, z: 0 }, west: { x: 1, y: 0, z: 0 } }[facing];
      const validation = validateDecorationAgainstProject(project([stone({ x: 2 + direction.x, y: 1, z: 2 + direction.z })]), frame(facing));
      expect(validation, `${facing}:${validation.reason}:${JSON.stringify(validation.supportPositions)}`).toMatchObject({ status: 'valid' });
      expect(validateDecorationAgainstProject(project([stone({ x: 2 + direction.x, y: 1, z: 2 + direction.z })]), frame(facing, 'glow-item-frame')).status).toBe('valid');
      expect(validateDecorationAgainstProject(project([]), frame(facing)).reason).toBe('missing-support');
    }
    const painting = { instanceId: 'large', kind: 'painting' as const, entityTypeId: 'minecraft:painting' as const, anchor: { x: 2, y: 1, z: 2 }, facing: 'north' as const, variantId: 'minecraft:match' };
    const complete = [stone({ x: 2, y: 1, z: 3 }), stone({ x: 3, y: 1, z: 3 }), stone({ x: 2, y: 2, z: 3 }), stone({ x: 3, y: 2, z: 3 })];
    expect(validateDecorationAgainstProject(project(complete), painting).status).toBe('valid');
    expect(validateDecorationAgainstProject(project(complete.slice(1)), painting).reason).toBe('missing-support');
    for (const facing of ['north', 'south', 'east', 'west'] as const) {
      const direction = { north: { x: 0, z: 1 }, south: { x: 0, z: -1 }, east: { x: -1, z: 0 }, west: { x: 1, z: 0 } }[facing];
      const oneByOne = { ...painting, instanceId: `painting-${facing}`, facing, variantId: 'minecraft:kebab' as const, anchor: { x: 2, y: 1, z: 2 } };
      expect(validateDecorationAgainstProject(project([stone({ x: 2 + direction.x, y: 1, z: 2 + direction.z })]), oneByOne).status).toBe('valid');
    }
    expect(validateDecorationAgainstProject(project([]), { ...frame('north'), fixed: true }).status).toBe('valid');
  });

  it('maps painting and frame entities and rejects unknown painting dimensions/components', () => {
    const painting = mapDecoration({ instanceId: 'p', kind: 'painting', entityTypeId: 'minecraft:painting', anchor: { x: 1, y: 1, z: 1 }, facing: 'east', variantId: 'minecraft:kebab' }, 0);
    const frame = mapDecoration({ instanceId: 'f', kind: 'glow-item-frame', entityTypeId: 'minecraft:glow_item_frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'north', rotation: 3, item: { id: 'minecraft:diamond', count: 1 } }, 0);
    expect(painting.ok && painting.value.nbt.value['facing']).toEqual({ type: 'byte', value: 3 });
    expect(frame.ok && frame.value.nbt.value['id']).toEqual({ type: 'string', value: 'minecraft:glow_item_frame' });
    expect(frame.ok && frame.value.nbt.value['Facing']).toEqual({ type: 'byte', value: 2 });
    expect(frame.ok && frame.value.nbt.value['ItemRotation']).toEqual({ type: 'byte', value: 3 });
    expect(mapDecoration({ instanceId: 'unknown', kind: 'painting', entityTypeId: 'minecraft:painting', anchor: { x: 1, y: 1, z: 1 }, facing: 'north', variantId: 'minecraft:missing' }, 0)).toMatchObject({ ok: false, diagnostic: { code: 'unknown-painting-variant' } });
    expect(mapDecoration({ instanceId: 'components', kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'north', item: { id: 'minecraft:diamond', count: 1, components: {} } }, 0)).toMatchObject({ ok: false, diagnostic: { code: 'unsupported-raw-nbt' } });
  });

  it('keeps the verified entity facing byte mappings stable', () => {
    const paintingFacings = { south: 0, west: 1, north: 2, east: 3 } as const;
    for (const [facing, byte] of Object.entries(paintingFacings)) {
      const mapped = mapDecoration({ instanceId: `painting-${facing}`, kind: 'painting', entityTypeId: 'minecraft:painting', anchor: { x: 1, y: 1, z: 1 }, facing: facing as keyof typeof paintingFacings, variantId: 'minecraft:kebab' }, 0);
      expect(mapped.ok && mapped.value.nbt.value['facing']).toEqual({ type: 'byte', value: byte });
    }
    const frameFacings = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 } as const;
    for (const [facing, byte] of Object.entries(frameFacings)) {
      const mapped = mapDecoration({ instanceId: `frame-${facing}`, kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 1, y: 1, z: 1 }, facing: facing as keyof typeof frameFacings }, 0);
      expect(mapped.ok && mapped.value.nbt.value['Facing']).toEqual({ type: 'byte', value: byte });
    }
  });
});

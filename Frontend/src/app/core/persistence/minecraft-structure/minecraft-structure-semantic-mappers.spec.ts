import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { mapBlockEntity, mapDecoration } from './minecraft-structure-semantic-mappers';

const block = (id: string, blockEntityData?: unknown): PlacedBlock => ({ kind: 'resolved', id, namespace: id.split(':')[0], position: { x: 0, y: 0, z: 0 }, state: {}, ...(blockEntityData === undefined ? {} : { blockEntityData } as never) });
const signData = (overrides: Record<string, unknown> = {}) => ({ kind: 'sign' as const, waxed: true, front: { lines: ['A', 'B', 'C', 'D'] as const, color: 'red', glowing: true }, back: { lines: ['', '', '', ''] as const, color: 'blue', glowing: false }, ...overrides });

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

// @ts-expect-error Node's file API is only used by fixture verification tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';

describe('exporter-generated 15.3 smoke fixture', () => {
  it('round-trips semantic block entities and top-level entities', async () => {
    const bytes = new Uint8Array(readFileSync('src/app/core/persistence/minecraft-structure/fixtures/exporter_be_entity_smoke_1_21_1.nbt'));
    const template = new MinecraftJavaStructureAdapter().decodeStructure(await new NbtifyMinecraftJavaCodec().decode(bytes));
    expect(template.dataVersion).toBe(3955);
    expect(template.size).toEqual({ x: 6, y: 2, z: 6 });
    expect(template.blocks).toHaveLength(72);
    expect(template.blocks.filter((entry) => template.palette[entry.state].name === 'minecraft:air')).toHaveLength(65);
    const blockEntities = template.blocks.filter((entry) => entry.nbt).map((entry) => entry.nbt!);
    expect(blockEntities.map((entry) => entry.value['id'])).toEqual(expect.arrayContaining([
      { type: 'string', value: 'minecraft:sign' },
      { type: 'string', value: 'minecraft:decorated_pot' },
      { type: 'string', value: 'minecraft:hanging_sign' },
    ]));
    expect(template.entities).toHaveLength(3);
    expect(template.entities.map((entry) => entry.nbt.value['id'])).toEqual([
      { type: 'string', value: 'minecraft:painting' },
      { type: 'string', value: 'minecraft:item_frame' },
      { type: 'string', value: 'minecraft:glow_item_frame' },
    ]);
    const sign = blockEntities.find((entry) => entry.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:sign')!;
    expect(sign.value['front_text']).toMatchObject({ type: 'compound' });
    if (sign.value['front_text']?.type === 'compound') expect(sign.value['front_text'].value['messages']).toMatchObject({ type: 'list', elementType: 'string' });
    const pot = blockEntities.find((entry) => entry.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:decorated_pot')!;
    expect(pot.value['sherds']).toMatchObject({ type: 'list', elementType: 'string' });
    const frame = template.entities[1].nbt.value['Item'];
    expect(frame).toMatchObject({ type: 'compound' });
    if (frame?.type === 'compound') expect(frame.value['id']).toEqual({ type: 'string', value: 'minecraft:diamond' });
  });
});

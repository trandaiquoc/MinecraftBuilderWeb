import { describe, expect, it } from 'vitest';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import { exportMinecraftStructure } from './minecraft-structure-exporter';
import { createDecorationSupportIndex, decorationSupportPositions, validateDecorationAgainstProject } from '../../decorations/placement/decoration-placement';
import { exporterSmokeProject } from './fixtures/exporter-smoke-project';

describe('exporter-generated 15.3 smoke structure', () => {
  it('round-trips semantic block entities and top-level entities', async () => {
    const exported = await exportMinecraftStructure(exporterSmokeProject, new NbtifyMinecraftJavaCodec(), undefined, () => 64);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const template = new MinecraftJavaStructureAdapter().decodeStructure(await new NbtifyMinecraftJavaCodec().decode(exported.bytes));
    expect(template.dataVersion).toBe(3955);
    expect(template.size).toEqual({ x: 10, y: 4, z: 8 });
    expect(template.blocks).toHaveLength(320);
    expect(template.blocks.filter((entry) => template.palette[entry.state].name === 'minecraft:air')).toHaveLength(274);
    const blockEntities = template.blocks.filter((entry) => entry.nbt).map((entry) => entry.nbt!);
    expect(blockEntities.map((entry) => entry.value['id'])).toEqual(expect.arrayContaining([
      { type: 'string', value: 'minecraft:sign' },
      { type: 'string', value: 'minecraft:decorated_pot' },
      { type: 'string', value: 'minecraft:hanging_sign' },
      { type: 'string', value: 'minecraft:chest' },
      { type: 'string', value: 'minecraft:barrel' },
      { type: 'string', value: 'minecraft:hopper' },
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
    expect(pot.value['item']).toMatchObject({ type: 'compound', value: { id: { type: 'string', value: 'minecraft:apple' }, count: { type: 'int', value: 2 } } });
    const chest = blockEntities.find((entry) => entry.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:chest')!;
    expect(chest.value['Items']).toMatchObject({ type: 'list', elementType: 'compound' });
    const barrel = blockEntities.find((entry) => entry.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:barrel')!;
    expect(barrel.value['Items']).toMatchObject({ type: 'list', elementType: 'compound' });
    const hopper = blockEntities.find((entry) => entry.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:hopper')!;
    expect(hopper.value['TransferCooldown']).toEqual({ type: 'int', value: 0 });
    const frame = template.entities.find((entry) => entry.nbt.value['id']?.type === 'string' && entry.nbt.value['id'].value === 'minecraft:item_frame')?.nbt.value['Item'];
    expect(frame).toMatchObject({ type: 'compound' });
    if (frame?.type === 'compound') expect(frame.value['id']).toEqual({ type: 'string', value: 'minecraft:emerald' });
    const supportIndex = createDecorationSupportIndex(exporterSmokeProject);
    for (const decoration of exporterSmokeProject.decorations ?? []) {
      expect(validateDecorationAgainstProject(exporterSmokeProject, decoration, supportIndex), decoration.instanceId).toMatchObject({ status: 'valid' });
      for (const support of decorationSupportPositions(decoration)) expect(supportIndex.occupied.has(`${support.x},${support.y},${support.z}`), `${decoration.instanceId}:${JSON.stringify(support)}`).toBe(true);
    }
  });
});

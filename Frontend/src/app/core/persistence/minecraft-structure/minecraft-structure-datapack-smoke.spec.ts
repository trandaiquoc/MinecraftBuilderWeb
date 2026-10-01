// @ts-expect-error Node's file API is only used by committed fixture verification.
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import { exporterSmokeProject } from './fixtures/exporter-smoke-project';
import { createDecorationSupportIndex, decorationSupportPositions, validateDecorationAgainstProject } from '../../decorations/placement/decoration-placement';

describe('exporter-generated datapack smoke fixture', () => {
  it('contains the exact production datapack tree and decodes through the NBT codec', async () => {
    const zipBytes = new Uint8Array(readFileSync('src/app/core/persistence/minecraft-structure/fixtures/exporter_datapack_smoke_1_21_1.zip'));
    const files = unzipSync(zipBytes);
    const entryNames = Object.keys(files).sort();
    expect(entryNames).toEqual(['data/minecraftbuilder/structure/exporter_datapack_smoke_1_21_1.nbt', 'pack.mcmeta']);
    expect(entryNames.some((name) => name.includes('/structures/') || name.startsWith('generated/') || name.includes('/structure/structure/'))).toBe(false);

    const pack = JSON.parse(new TextDecoder().decode(files['pack.mcmeta'])) as { pack: { pack_format: number; description: string } };
    expect(pack).toEqual({ pack: { pack_format: 48, description: 'MinecraftBuilder 1.21.1 export smoke' } });

    const nbtBytes = files['data/minecraftbuilder/structure/exporter_datapack_smoke_1_21_1.nbt'];
    expect([...nbtBytes.slice(0, 2)]).toEqual([0x1f, 0x8b]);
    const template = new MinecraftJavaStructureAdapter().decodeStructure(await new NbtifyMinecraftJavaCodec().decode(nbtBytes));
    expect(template.dataVersion).toBe(3955);
    expect(template.size).toEqual({ x: 10, y: 4, z: 8 });
    expect(template.blocks).toHaveLength(320);
    expect(template.blocks.filter((entry) => template.palette[entry.state].name === 'minecraft:air')).toHaveLength(274);
    expect(template.blocks.filter((entry) => entry.nbt)).toHaveLength(6);
    expect(template.entities).toHaveLength(3);
    expect(template.entities.map((entry) => entry.nbt.value['id'])).toEqual([
      { type: 'string', value: 'minecraft:painting' },
      { type: 'string', value: 'minecraft:item_frame' },
      { type: 'string', value: 'minecraft:glow_item_frame' },
    ]);
    const pot = template.blocks.map((entry) => entry.nbt).find((entry) => entry?.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:decorated_pot');
    expect(pot?.value['item']).toMatchObject({ type: 'compound', value: { id: { type: 'string', value: 'minecraft:apple' }, count: { type: 'int', value: 2 } } });
    const hopper = template.blocks.map((entry) => entry.nbt).find((entry) => entry?.value['id']?.type === 'string' && entry.value['id'].value === 'minecraft:hopper');
    expect(hopper?.value['TransferCooldown']).toEqual({ type: 'int', value: 0 });
    const supportIndex = createDecorationSupportIndex(exporterSmokeProject);
    for (const decoration of exporterSmokeProject.decorations ?? []) {
      expect(validateDecorationAgainstProject(exporterSmokeProject, decoration, supportIndex)).toMatchObject({ status: 'valid' });
      for (const support of decorationSupportPositions(decoration)) expect(supportIndex.occupied.has(`${support.x},${support.y},${support.z}`)).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes these fixture tests in Node; the app does not depend on @types/node.
import { readFileSync } from 'node:fs';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';

const fixture = (): Uint8Array => Uint8Array.from(readFileSync('src/app/core/persistence/minecraft-structure/fixtures/golden_1_21_1.nbt') as unknown as ArrayLike<number>);

describe('nbtify Minecraft Java codec', () => {
  it('decodes the independent 1.21.1 golden fixture with native tag semantics', async () => {
    const codec = new NbtifyMinecraftJavaCodec();
    const root = await codec.decode(fixture());
    const template = new MinecraftJavaStructureAdapter().decodeStructure(root);

    expect(root.name).toBe('');
    expect(root.value.value['DataVersion']).toEqual({ type: 'int', value: 3955 });
    expect(root.value.value['size']).toMatchObject({ type: 'list', elementType: 'int', value: [
      { type: 'int', value: 5 }, { type: 'int', value: 4 }, { type: 'int', value: 5 },
    ] });
    expect(template.palette).toHaveLength(14);
    expect(template.palette.map((entry) => entry.name)).toContain('minecraft:air');
    expect(template.blocks).toHaveLength(100);
    expect(template.blocks.filter((entry) => template.palette[entry.state].name === 'minecraft:air')).toHaveLength(83);

    const coordinates = new Set(template.blocks.map((entry) => entry.pos.join(',')));
    expect(coordinates).toHaveLength(100);
    for (let y = 0; y < 4; y += 1) for (let z = 0; z < 5; z += 1) for (let x = 0; x < 5; x += 1) expect(coordinates.has(`${x},${y},${z}`)).toBe(true);

    const stairs = template.palette.find((entry) => entry.name === 'minecraft:oak_stairs' && entry.properties?.['shape'] === 'inner_left');
    expect(stairs?.properties).toEqual({ facing: 'north', half: 'bottom', shape: 'inner_left', waterlogged: 'false' });
    expect(template.entities).toHaveLength(2);
    expect(root.value.value['entities']).toMatchObject({ type: 'list', elementType: 'compound' });
    const entities = root.value.value['entities'];
    expect(entities?.type === 'list' && entities.value[0]).toMatchObject({ type: 'compound' });
    if (entities?.type === 'list' && entities.value[0]?.type === 'compound') {
      expect(entities.value[0].value['pos']).toMatchObject({ type: 'list', elementType: 'double' });
      expect(entities.value[0].value['blockPos']).toMatchObject({ type: 'list', elementType: 'int' });
      expect(entities.value[0].value['nbt']).toMatchObject({ type: 'compound' });
      if (entities.value[0].value['nbt']?.type === 'compound') expect(entities.value[0].value['nbt'].value['Facing']).toMatchObject({ type: 'byte' });
    }

    const blocks = root.value.value['blocks'];
    expect(blocks).toMatchObject({ type: 'list', elementType: 'compound' });
    const firstBlock = blocks && blocks.type === 'list' ? blocks.value[0] : undefined;
    expect(firstBlock).toMatchObject({ type: 'compound' });
    if (firstBlock?.type === 'compound') {
      expect(firstBlock.value['pos']).toMatchObject({ type: 'list', elementType: 'int' });
      expect(firstBlock.value['state']).toEqual({ type: 'int', value: 0 });
    }

    const sign = template.blocks.find((entry) => entry.nbt?.value['id']?.type === 'string' && (entry.nbt.value['id'].value === 'minecraft:sign' || entry.nbt.value['id'].value === 'minecraft:hanging_sign'))?.nbt;
    expect(sign?.value['is_waxed']).toMatchObject({ type: 'byte' });
    expect(sign?.value['front_text']).toMatchObject({ type: 'compound' });
    if (sign?.value['front_text']?.type === 'compound') expect(sign.value['front_text'].value['messages']).toMatchObject({ type: 'list', elementType: 'string' });
  });

  it('round-trips the decoded typed root without losing tag types', async () => {
    const codec = new NbtifyMinecraftJavaCodec();
    const root = await codec.decode(fixture());
    const decodedAgain = await codec.decode(await codec.encode(root));
    expect(decodedAgain).toEqual(root);
  });
});

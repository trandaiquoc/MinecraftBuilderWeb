import type {
  MinecraftNbtCompound,
  MinecraftNbtList,
  MinecraftNbtRoot,
  MinecraftNbtTag,
  MinecraftStructureBlock,
  MinecraftStructureEntity,
  MinecraftStructurePaletteEntry,
  MinecraftStructureTemplate,
} from './minecraft-structure-types';
import type { MinecraftStructureAdapter } from './minecraft-structure-codec';
import { canonicalProperties } from './minecraft-structure-contract';

/** Maps the verified single-palette Java StructureTemplate shape to typed NBT. */
export class MinecraftJavaStructureAdapter implements MinecraftStructureAdapter {
  decodeStructure(root: MinecraftNbtRoot): MinecraftStructureTemplate {
    const compound = root.value.value;
    const dataVersion = int(compound['DataVersion'], 'DataVersion');
    const size = intList(compound['size'], 'size', 3);
    const palette = compoundList(compound['palette'], 'palette').map((entry, index) => paletteEntry(entry, index));
    const blocks = compoundList(compound['blocks'], 'blocks').map((entry, index) => structureBlock(entry, index));
    const entities = compoundList(compound['entities'], 'entities').map((entry, index) => structureEntity(entry, index));
    return { dataVersion, size: { x: size[0], y: size[1], z: size[2] }, palette, blocks, entities };
  }

  encodeStructure(template: MinecraftStructureTemplate): MinecraftNbtRoot {
    return {
      name: '',
      value: {
        type: 'compound',
        value: {
          DataVersion: { type: 'int', value: template.dataVersion },
          size: intListTag([template.size.x, template.size.y, template.size.z]),
          palette: list('compound', template.palette.map((entry) => {
            const result: Record<string, MinecraftNbtTag> = { Name: { type: 'string', value: entry.name } };
            if (entry.properties && Object.keys(entry.properties).length > 0) {
              result['Properties'] = {
                type: 'compound',
                value: Object.fromEntries(Object.entries(canonicalProperties(entry.properties)).map(([key, value]) => [key, { type: 'string', value }])),
              };
            }
            return { type: 'compound', value: result };
          })),
          blocks: list('compound', template.blocks.map((block) => {
            const result: Record<string, MinecraftNbtTag> = { pos: intListTag(block.pos), state: { type: 'int', value: block.state } };
            if (block.nbt) result['nbt'] = block.nbt;
            return { type: 'compound', value: result };
          })),
          entities: list('compound', template.entities.map((entity) => ({
            type: 'compound',
            value: {
              pos: list('double', entity.pos.map((value) => ({ type: 'double', value }))),
              blockPos: intListTag(entity.blockPos),
              nbt: entity.nbt,
            },
          }))),
        },
      },
    };
  }
}

function paletteEntry(value: MinecraftNbtCompound['value'], index: number): MinecraftStructurePaletteEntry {
  const name = string(value['Name'], `palette[${index}].Name`);
  const properties = value['Properties'];
  if (properties === undefined) return { name };
  const entries = compound(properties, `palette[${index}].Properties`);
  const result: Record<string, string> = {};
  for (const [key, tag] of Object.entries(entries)) result[key] = string(tag, `palette[${index}].Properties.${key}`);
  return { name, properties: canonicalProperties(result) };
}

function structureBlock(value: MinecraftNbtCompound['value'], index: number): MinecraftStructureBlock {
  const result: MinecraftStructureBlock = {
    pos: intList(value['pos'], `blocks[${index}].pos`, 3) as [number, number, number],
    state: int(value['state'], `blocks[${index}].state`),
  };
  if (value['nbt'] !== undefined) return { ...result, nbt: { type: 'compound', value: compound(value['nbt'], `blocks[${index}].nbt`) } };
  return result;
}

function structureEntity(value: MinecraftNbtCompound['value'], index: number): MinecraftStructureEntity {
  return {
    pos: doubleList(value['pos'], `entities[${index}].pos`, 3) as [number, number, number],
    blockPos: intList(value['blockPos'], `entities[${index}].blockPos`, 3) as [number, number, number],
    nbt: { type: 'compound', value: compound(value['nbt'], `entities[${index}].nbt`) },
  };
}

function int(value: MinecraftNbtTag | undefined, path: string): number {
  if (!value || value.type !== 'int') throw new Error(`${path} must be an NBT Int.`);
  return value.value;
}

function string(value: MinecraftNbtTag | undefined, path: string): string {
  if (!value || value.type !== 'string') throw new Error(`${path} must be an NBT String.`);
  return value.value;
}

function compound(value: MinecraftNbtTag | undefined, path: string): MinecraftNbtCompound['value'] {
  if (!value || value.type !== 'compound') throw new Error(`${path} must be an NBT Compound.`);
  return value.value;
}

function list<T extends MinecraftNbtTag['type']>(elementType: T, value: readonly Extract<MinecraftNbtTag, { type: T }>[]): MinecraftNbtList {
  return { type: 'list', elementType, value };
}

function compoundList(value: MinecraftNbtTag | undefined, path: string): readonly MinecraftNbtCompound['value'][] {
  const listValue = listValueOf(value, path, 'compound');
  return listValue.value.map((entry, index) => compound(entry, `${path}[${index}]`));
}

function intList(value: MinecraftNbtTag | undefined, path: string, expectedLength?: number): readonly number[] {
  const listValue = listValueOf(value, path, 'int');
  const result = listValue.value.map((entry, index) => int(entry, `${path}[${index}]`));
  if (expectedLength !== undefined && result.length !== expectedLength) throw new Error(`${path} must contain ${expectedLength} integers.`);
  return result;
}

function doubleList(value: MinecraftNbtTag | undefined, path: string, expectedLength?: number): readonly number[] {
  const listValue = listValueOf(value, path, 'double');
  const result = listValue.value.map((entry, index) => {
    if (entry.type !== 'double') throw new Error(`${path}[${index}] must be an NBT Double.`);
    return entry.value;
  });
  if (expectedLength !== undefined && result.length !== expectedLength) throw new Error(`${path} must contain ${expectedLength} doubles.`);
  return result;
}

function listValueOf<T extends MinecraftNbtTag['type']>(value: MinecraftNbtTag | undefined, path: string, elementType: T): Extract<MinecraftNbtTag, { type: 'list' }> {
  if (!value || value.type !== 'list' || value.elementType !== elementType) throw new Error(`${path} must be an NBT List<${elementType}>.`);
  return value;
}

function intListTag(values: readonly number[]): MinecraftNbtList {
  return list('int', values.map((value) => ({ type: 'int', value })));
}

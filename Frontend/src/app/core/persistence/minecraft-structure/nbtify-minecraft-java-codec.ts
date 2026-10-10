import {
  Int8,
  Int16,
  Int32,
  Float32,
  NBTData,
  TAG,
  TAG_TYPE,
  getTagType,
  read,
  write,
} from 'nbtify';
import type { MinecraftJavaNbtCodec } from './minecraft-structure-codec';
import type {
  MinecraftNbtCompound,
  MinecraftNbtRoot,
  MinecraftNbtTag,
} from './minecraft-structure-types';

/** Browser codec adapter. nbtify-specific wrappers stay inside this module. */
export class NbtifyMinecraftJavaCodec implements MinecraftJavaNbtCodec {
  readonly name = 'nbtify@2.2.0';
  readonly supportsGzip = true;

  async decode(bytes: Uint8Array): Promise<MinecraftNbtRoot> {
    const data = await read(bytes, {
      endian: 'big',
      compression: 'gzip',
      rootName: true,
      strict: true,
    });
    if (getTagType(data.data) !== TAG.COMPOUND)
      throw new Error('Minecraft Structure NBT root must be a Compound.');
    return {
      name: data.rootName ?? '',
      value: { type: 'compound', value: fromNbtifyCompound(data.data) },
    };
  }

  async encode(root: MinecraftNbtRoot): Promise<Uint8Array> {
    const value = toNbtifyCompound(root.value.value);
    return write(new NBTData(value, { rootName: root.name, endian: 'big', compression: 'gzip' }));
  }
}

type NbtifyValue = unknown;

function fromNbtifyCompound(value: NbtifyValue): MinecraftNbtCompound['value'] {
  if (getTagType(value) !== TAG.COMPOUND) throw new Error('Expected an NBT Compound.');
  const result: Record<string, MinecraftNbtTag> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>))
    result[name] = fromNbtifyTag(entry);
  return result;
}

function fromNbtifyTag(value: NbtifyValue): MinecraftNbtTag {
  switch (getTagType(value)) {
    case TAG.BYTE:
      return { type: 'byte', value: Number((value as Int8).valueOf()) };
    case TAG.SHORT:
      return { type: 'short', value: Number((value as Int16).valueOf()) };
    case TAG.INT:
      return { type: 'int', value: Number((value as Int32).valueOf()) };
    case TAG.LONG:
      return { type: 'long', value: value as bigint };
    case TAG.FLOAT:
      return { type: 'float', value: Number((value as Float32).valueOf()) };
    case TAG.DOUBLE:
      return { type: 'double', value: value as number };
    case TAG.STRING:
      return { type: 'string', value: value as string };
    case TAG.BYTE_ARRAY:
      return { type: 'byte-array', value: Array.from(value as Int8Array) };
    case TAG.INT_ARRAY:
      return { type: 'int-array', value: Array.from(value as Int32Array) };
    case TAG.LONG_ARRAY:
      return { type: 'long-array', value: Array.from(value as BigInt64Array) };
    case TAG.LIST: {
      const list = value as unknown[];
      const elementType = tagTypeName(listTagType(list));
      return { type: 'list', elementType, value: list.map(fromNbtifyTag) };
    }
    case TAG.COMPOUND:
      return { type: 'compound', value: fromNbtifyCompound(value) };
    default:
      throw new Error('Unsupported or invalid nbtify tag.');
  }
}

function toNbtifyCompound(value: MinecraftNbtCompound['value']): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [name, toNbtifyTag(entry)]),
  );
}

function toNbtifyTag(value: MinecraftNbtTag): unknown {
  switch (value.type) {
    case 'byte':
      return new Int8(value.value);
    case 'short':
      return new Int16(value.value);
    case 'int':
      return new Int32(value.value);
    case 'long':
      return value.value;
    case 'float':
      return new Float32(value.value);
    case 'double':
      return value.value;
    case 'string':
      return value.value;
    case 'byte-array':
      return Int8Array.from(value.value);
    case 'int-array':
      return Int32Array.from(value.value);
    case 'long-array':
      return BigInt64Array.from(value.value);
    case 'compound':
      return toNbtifyCompound(value.value);
    case 'list': {
      const list = value.value.map(toNbtifyTag);
      Object.defineProperty(list, TAG_TYPE, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: tagType(value.elementType),
      });
      return list;
    }
  }
}

function listTagType(value: readonly unknown[]): TAG {
  const type = (value as readonly unknown[] & { [TAG_TYPE]?: TAG })[TAG_TYPE];
  if (type === undefined) throw new Error('NBT list is missing its element type.');
  return type;
}

function tagTypeName(value: TAG): MinecraftNbtTag['type'] {
  switch (value) {
    case TAG.BYTE:
      return 'byte';
    case TAG.SHORT:
      return 'short';
    case TAG.INT:
      return 'int';
    case TAG.LONG:
      return 'long';
    case TAG.FLOAT:
      return 'float';
    case TAG.DOUBLE:
      return 'double';
    case TAG.BYTE_ARRAY:
      return 'byte-array';
    case TAG.STRING:
      return 'string';
    case TAG.LIST:
      return 'list';
    case TAG.COMPOUND:
      return 'compound';
    case TAG.INT_ARRAY:
      return 'int-array';
    case TAG.LONG_ARRAY:
      return 'long-array';
    default:
      throw new Error(`Invalid NBT list element type ${value}.`);
  }
}

function tagType(value: MinecraftNbtTag['type']): TAG {
  switch (value) {
    case 'byte':
      return TAG.BYTE;
    case 'short':
      return TAG.SHORT;
    case 'int':
      return TAG.INT;
    case 'long':
      return TAG.LONG;
    case 'float':
      return TAG.FLOAT;
    case 'double':
      return TAG.DOUBLE;
    case 'byte-array':
      return TAG.BYTE_ARRAY;
    case 'string':
      return TAG.STRING;
    case 'list':
      return TAG.LIST;
    case 'compound':
      return TAG.COMPOUND;
    case 'int-array':
      return TAG.INT_ARRAY;
    case 'long-array':
      return TAG.LONG_ARRAY;
  }
}

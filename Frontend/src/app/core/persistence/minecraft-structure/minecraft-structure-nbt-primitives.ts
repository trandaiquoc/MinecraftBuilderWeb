/** Constructors for the typed NBT nodes used by semantic mappers. */

import type {
  MinecraftNbtCompound,
  MinecraftNbtList,
  MinecraftNbtTag,
} from './minecraft-structure-types';

export function compound(value: Record<string, MinecraftNbtTag>): MinecraftNbtCompound {
  return { type: 'compound', value };
}

export function stringTag(value: string): MinecraftNbtTag {
  return { type: 'string', value };
}

export function intTag(value: number): MinecraftNbtTag {
  return { type: 'int', value };
}

export function byteTag(value: boolean | number): MinecraftNbtTag {
  return { type: 'byte', value: typeof value === 'boolean' ? (value ? 1 : 0) : value };
}

export function floatTag(value: number): MinecraftNbtTag {
  return { type: 'float', value };
}

export function doubleList(position: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): MinecraftNbtList {
  return list(
    'double',
    [position.x, position.y, position.z].map((value) => ({ type: 'double', value })),
  );
}

export function list<T extends MinecraftNbtTag['type']>(
  elementType: T,
  values: readonly Extract<MinecraftNbtTag, { type: T }>[],
): MinecraftNbtList {
  return { type: 'list', elementType, value: values };
}

export function coordinateTuple(
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  return [x, y, z];
}

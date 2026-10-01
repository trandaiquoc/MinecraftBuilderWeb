import type { ProjectSize, VoxelCoordinate } from '../../domain/project.types';

/** NBT tags are deliberately typed at the export boundary. JSON values are not NBT values. */
export type MinecraftNbtTag =
  | MinecraftNbtByte
  | MinecraftNbtShort
  | MinecraftNbtInt
  | MinecraftNbtLong
  | MinecraftNbtFloat
  | MinecraftNbtDouble
  | MinecraftNbtString
  | MinecraftNbtList
  | MinecraftNbtCompound
  | MinecraftNbtByteArray
  | MinecraftNbtIntArray
  | MinecraftNbtLongArray;

export interface MinecraftNbtByte { readonly type: 'byte'; readonly value: number; }
export interface MinecraftNbtShort { readonly type: 'short'; readonly value: number; }
export interface MinecraftNbtInt { readonly type: 'int'; readonly value: number; }
export interface MinecraftNbtLong { readonly type: 'long'; readonly value: bigint; }
export interface MinecraftNbtFloat { readonly type: 'float'; readonly value: number; }
export interface MinecraftNbtDouble { readonly type: 'double'; readonly value: number; }
export interface MinecraftNbtString { readonly type: 'string'; readonly value: string; }
export interface MinecraftNbtList { readonly type: 'list'; readonly elementType: MinecraftNbtTag['type']; readonly value: readonly MinecraftNbtTag[]; }
export interface MinecraftNbtCompound { readonly type: 'compound'; readonly value: Readonly<Record<string, MinecraftNbtTag>>; }
export interface MinecraftNbtByteArray { readonly type: 'byte-array'; readonly value: readonly number[]; }
export interface MinecraftNbtIntArray { readonly type: 'int-array'; readonly value: readonly number[]; }
export interface MinecraftNbtLongArray { readonly type: 'long-array'; readonly value: readonly bigint[]; }

export type MinecraftNbtRoot = Readonly<{ name: string; value: MinecraftNbtCompound }>;

export interface MinecraftStructurePaletteEntry {
  readonly name: string;
  readonly properties?: Readonly<Record<string, string>>;
}

export interface MinecraftStructureBlock {
  readonly pos: readonly [number, number, number];
  readonly state: number;
  readonly nbt?: MinecraftNbtCompound;
}

export interface MinecraftStructureEntity {
  readonly pos: readonly [number, number, number];
  readonly blockPos: readonly [number, number, number];
  readonly nbt: MinecraftNbtCompound;
}

/** Semantic structure template model. Binary tag/list encoding belongs to the codec port. */
export interface MinecraftStructureTemplate {
  readonly dataVersion: number;
  readonly size: ProjectSize;
  readonly palette: readonly MinecraftStructurePaletteEntry[];
  readonly blocks: readonly MinecraftStructureBlock[];
  readonly entities: readonly MinecraftStructureEntity[];
}

export interface MinecraftStructureBlockSource {
  readonly id: string;
  readonly state: Readonly<Record<string, string>>;
  readonly position: VoxelCoordinate;
  readonly unresolved: boolean;
}

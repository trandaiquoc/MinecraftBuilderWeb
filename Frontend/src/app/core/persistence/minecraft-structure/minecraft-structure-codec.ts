import type { MinecraftNbtRoot, MinecraftNbtTag, MinecraftStructureTemplate } from './minecraft-structure-types';

/** Binary codec port; the UI and ProjectDocument never depend on a package implementation. */
export interface MinecraftJavaNbtCodec {
  readonly name: string;
  readonly supportsGzip: boolean;
  decode(bytes: Uint8Array): Promise<MinecraftNbtRoot>;
  encode(root: MinecraftNbtRoot): Promise<Uint8Array>;
}

export interface MinecraftStructureAdapter {
  decodeStructure(root: MinecraftNbtRoot): MinecraftStructureTemplate;
  encodeStructure(template: MinecraftStructureTemplate): MinecraftNbtRoot;
}

export function typedNbtCompound(value: unknown): value is MinecraftNbtRoot['value'] {
  return isNbtTag(value) && value.type === 'compound';
}

export function isNbtTag(value: unknown): value is MinecraftNbtTag {
  if (!isRecord(value)) return false;
  const candidate = value as { readonly type?: unknown; readonly value?: unknown; readonly elementType?: unknown };
  if (typeof candidate.type !== 'string') return false;
  if (candidate.type === 'compound') return isRecord(candidate.value) && Object.values(candidate.value).every(isNbtTag);
  if (candidate.type === 'list') return typeof candidate.elementType === 'string' && Array.isArray(candidate.value) && candidate.value.every((entry: unknown) => isNbtTag(entry) && (entry as { readonly type: string }).type === candidate.elementType);
  if (candidate.type === 'byte-array' || candidate.type === 'int-array') return Array.isArray(candidate.value) && candidate.value.every((entry: unknown) => Number.isInteger(entry));
  if (candidate.type === 'long-array') return Array.isArray(candidate.value) && candidate.value.every((entry: unknown) => typeof entry === 'bigint');
  if (candidate.type === 'long') return typeof candidate.value === 'bigint';
  if (candidate.type === 'byte' || candidate.type === 'short' || candidate.type === 'int') return Number.isInteger(candidate.value);
  if (candidate.type === 'float' || candidate.type === 'double') return typeof candidate.value === 'number' && Number.isFinite(candidate.value);
  return candidate.type === 'string' && typeof candidate.value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

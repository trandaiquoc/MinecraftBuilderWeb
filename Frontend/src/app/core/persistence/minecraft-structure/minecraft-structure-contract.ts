import { isValidNamespacedResourceLocation } from '../../content/resource-location';
import { validateCoordinate, validateProjectSize } from '../../domain/validation';
import type { PlacedBlock, ProjectDocument, ProjectSize } from '../../domain/project.types';
import type { MinecraftNbtCompound, MinecraftNbtTag, MinecraftStructureBlockSource, MinecraftStructurePaletteEntry, MinecraftStructureTemplate } from './minecraft-structure-types';

export const MINECRAFT_JAVA_1_21_1 = '1.21.1' as const;
export const MINECRAFT_JAVA_1_21_1_DATA_VERSION = 3955 as const;
export const VANILLA_STRUCTURE_AXIS_LIMIT = 48 as const;
export const HUGE_STRUCTURE_AXIS_LIMIT = 512 as const;
const NBT_TAG_TYPES = new Set<MinecraftNbtTag['type']>(['byte', 'short', 'int', 'long', 'float', 'double', 'string', 'list', 'compound', 'byte-array', 'int-array', 'long-array']);

export type MinecraftStructureDiagnosticCode =
  | 'unsupported-version'
  | 'invalid-size'
  | 'unsupported-size'
  | 'invalid-coordinate'
  | 'out-of-bounds'
  | 'invalid-resource-location'
  | 'unsupported-raw-nbt'
  | 'unsupported-block-entity'
  | 'invalid-block-entity'
  | 'unsupported-decoration'
  | 'invalid-decoration'
  | 'invalid-entity-item'
  | 'unknown-painting-variant'
  | 'invalid-state-property'
  | 'duplicate-coordinate'
  | 'unsupported-entity'
  | 'codec-unavailable'
  | 'golden-fixture-unavailable';

export interface MinecraftStructureDiagnostic {
  readonly code: MinecraftStructureDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export interface MinecraftStructureValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly MinecraftStructureDiagnostic[];
}

export type StructureSizeClass = 'vanilla' | 'huge' | 'unsupported';

export function classifyStructureSize(size: ProjectSize): StructureSizeClass {
  if (validateProjectSize(size).length > 0) return 'unsupported';
  const largestAxis = Math.max(size.x, size.y, size.z);
  if (largestAxis <= VANILLA_STRUCTURE_AXIS_LIMIT) return 'vanilla';
  if (largestAxis <= HUGE_STRUCTURE_AXIS_LIMIT) return 'huge';
  return 'unsupported';
}

/** Validates only the export contract; it does not resolve assets or rewrite missing blocks. */
export function validateMinecraftStructureProject(project: ProjectDocument): MinecraftStructureValidationResult {
  const diagnostics: MinecraftStructureDiagnostic[] = [];
  if (project.metadata.minecraftVersion !== MINECRAFT_JAVA_1_21_1) diagnostics.push({ code: 'unsupported-version', message: `Minecraft Java ${project.metadata.minecraftVersion} is not supported by the 1.21.1 Structure NBT contract.`, path: 'metadata.minecraftVersion' });
  for (const issue of validateProjectSize(project.size)) diagnostics.push({ code: 'invalid-size', message: issue.message, path: issue.path });
  const sizeClass = classifyStructureSize(project.size);
  if (sizeClass === 'unsupported') diagnostics.push({ code: 'unsupported-size', message: `Structure axes must be at most ${HUGE_STRUCTURE_AXIS_LIMIT} blocks for the current product workflow.`, path: 'size' });
  for (let index = 0; index < project.blocks.length; index += 1) {
    const block = project.blocks[index];
    if (!isValidNamespacedResourceLocation(block.id)) diagnostics.push({ code: 'invalid-resource-location', message: 'block ID must use a valid Minecraft namespace:path ResourceLocation.', path: `blocks.${index}.id` });
    if (hasUnsupportedBlockEntityData(block.blockEntityData)) diagnostics.push({ code: 'unsupported-raw-nbt', message: 'block entity data is not yet represented by a verified typed NBT mapper.', path: `blocks.${index}.blockEntityData` });
    for (const issue of validateCoordinate(block.position, project.size)) {
      diagnostics.push({ code: issue.code === 'out-of-bounds' ? 'out-of-bounds' : 'invalid-coordinate', message: issue.message, path: `blocks.${index}.position` });
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function hasUnsupportedBlockEntityData(value: unknown): boolean {
  if (value === undefined) return false;
  if (!isRecord(value) || Array.isArray(value)) return true;
  const kind = value['kind'];
  if (kind === 'sign' || kind === 'decorated-pot' || kind === 'item-container') return hasNonEmptyRaw(value['raw']);
  return true;
}

function hasNonEmptyRaw(value: unknown): boolean {
  if (value === undefined) return false;
  return !isRecord(value) || Array.isArray(value) || Object.keys(value).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

/** Keeps unresolved catalog status out of the authoritative NBT identity. */
export function structureBlockSource(block: PlacedBlock): MinecraftStructureBlockSource {
  return { id: block.id, state: canonicalProperties(block.state), position: block.position, unresolved: block.kind === 'missing' };
}

export function canonicalPaletteEntry(id: string, properties: Readonly<Record<string, string>> = {}): MinecraftStructurePaletteEntry {
  return { name: id, ...(Object.keys(properties).length === 0 ? {} : { properties: canonicalProperties(properties) }) };
}

export function canonicalProperties(properties: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(properties).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

export function structureStateIdentity(id: string, properties: Readonly<Record<string, string>> = {}): string {
  const canonical = canonicalPaletteEntry(id, properties);
  return JSON.stringify(canonical);
}

export function validateStructureTemplate(template: MinecraftStructureTemplate): MinecraftStructureValidationResult {
  const diagnostics: MinecraftStructureDiagnostic[] = [];
  if (template.dataVersion !== MINECRAFT_JAVA_1_21_1_DATA_VERSION) diagnostics.push({ code: 'unsupported-version', message: `Expected DataVersion ${MINECRAFT_JAVA_1_21_1_DATA_VERSION}.`, path: 'dataVersion' });
  for (const issue of validateProjectSize(template.size)) diagnostics.push({ code: 'invalid-size', message: issue.message, path: issue.path });
  for (let index = 0; index < template.palette.length; index += 1) if (!isValidNamespacedResourceLocation(template.palette[index].name)) diagnostics.push({ code: 'invalid-resource-location', message: 'palette Name must be a valid Minecraft namespace:path ResourceLocation.', path: `palette.${index}.Name` });
  for (let index = 0; index < template.blocks.length; index += 1) {
    const block = template.blocks[index];
    if (!Number.isInteger(block.state) || block.state < 0 || block.state >= template.palette.length) diagnostics.push({ code: 'invalid-coordinate', message: 'block state must reference a palette entry.', path: `blocks.${index}.state` });
    const position = { x: block.pos[0], y: block.pos[1], z: block.pos[2] };
    for (const issue of validateCoordinate(position, template.size)) diagnostics.push({ code: issue.code === 'out-of-bounds' ? 'out-of-bounds' : 'invalid-coordinate', message: issue.message, path: `blocks.${index}.pos` });
    if (block.nbt !== undefined && !isTypedNbtCompound(block.nbt)) diagnostics.push({ code: 'invalid-block-entity', message: 'block nbt must be a typed NBT Compound.', path: `blocks.${index}.nbt` });
  }
  for (let index = 0; index < template.entities.length; index += 1) {
    const entity = template.entities[index];
    if (!isFiniteTriple(entity.pos)) diagnostics.push({ code: 'invalid-coordinate', message: 'entity pos must contain three finite doubles.', path: `entities.${index}.pos` });
    if (!isIntegerTriple(entity.blockPos)) diagnostics.push({ code: 'invalid-coordinate', message: 'entity blockPos must contain three integers.', path: `entities.${index}.blockPos` });
    if (!isTypedNbtCompound(entity.nbt)) diagnostics.push({ code: 'unsupported-entity', message: 'entity nbt must be a typed NBT Compound.', path: `entities.${index}.nbt` });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function isTypedNbtCompound(value: unknown): value is MinecraftNbtCompound {
  return isTypedNbtTag(value) && value.type === 'compound';
}

function isTypedNbtTag(value: unknown): value is MinecraftNbtTag {
  if (!isRecord(value) || typeof value['type'] !== 'string') return false;
  switch (value['type']) {
    case 'byte': case 'short': case 'int': case 'float': case 'double': return typeof value['value'] === 'number' && Number.isFinite(value['value']);
    case 'long': return typeof value['value'] === 'bigint';
    case 'string': return typeof value['value'] === 'string';
    case 'byte-array': case 'int-array': return Array.isArray(value['value']) && value['value'].every((entry) => Number.isInteger(entry));
    case 'long-array': return Array.isArray(value['value']) && value['value'].every((entry) => typeof entry === 'bigint');
    case 'list': return isTypedNbtList(value);
    case 'compound': return isRecord(value['value']) && Object.values(value['value']).every((entry) => isTypedNbtTag(entry));
    default: return false;
  }
}

function isTypedNbtList(value: Readonly<Record<string, unknown>>): boolean {
  if (typeof value['elementType'] !== 'string' || !NBT_TAG_TYPES.has(value['elementType'] as MinecraftNbtTag['type']) || !Array.isArray(value['value'])) return false;
  return value['value'].every((entry) => isTypedNbtTag(entry) && entry.type === value['elementType']);
}

function isFiniteTriple(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isIntegerTriple(value: unknown): value is readonly [number, number, number] {
  return isFiniteTriple(value) && value.every((entry) => Number.isInteger(entry));
}

import type { ProjectDocument } from '../../domain/project.types';
import { classifyStructureSize, MINECRAFT_JAVA_1_21_1, MINECRAFT_JAVA_1_21_1_DATA_VERSION, type MinecraftStructureDiagnostic, type StructureSizeClass } from './minecraft-structure-contract';
import { exportMinecraftStructure } from './minecraft-structure-exporter';
import type { MinecraftJavaNbtCodec } from './minecraft-structure-codec';
import type { StructureExportPreferences } from '../../ui/preferences/ui-preferences.service';
import type { ZipArchiveOutputEntry, ZipArchiveWriter } from './zip-archive-writer';
import { FflateZipArchiveWriter } from './fflate-zip-archive-writer';

export const MINECRAFT_JAVA_1_21_1_PACK_FORMAT = 48 as const;
export const DEFAULT_STRUCTURE_EXPORT_NAMESPACE = 'minecraftbuilder' as const;

const RESOURCE_NAMESPACE = /^[a-z0-9_.-]+$/;
const STRUCTURE_PATH = /^[a-z0-9/._-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type StructurePackagingDiagnosticCode =
  | 'invalid-namespace'
  | 'invalid-structure-path'
  | 'invalid-archive-name'
  | 'invalid-description'
  | 'unsupported-packaging-version'
  | 'archive-write-failed';

export type StructurePackagingDiagnostic = MinecraftStructureDiagnostic | {
  readonly code: StructurePackagingDiagnosticCode;
  readonly message: string;
  readonly path?: string;
};

export interface StructureExportInput {
  readonly namespace: string;
  readonly structurePath: string;
  /** Filename stem only; the ZIP extension is added exactly once by metadata generation. */
  readonly archiveName: string;
  readonly description: string;
}

export interface StandaloneStructureNbtInput {
  readonly namespace: string;
  readonly structurePath: string;
}

export interface StructureExportDefaults {
  readonly namespace: string;
  readonly structurePath: string;
  readonly archiveName: string;
  readonly archiveFilename: string;
  readonly description: string;
}

export interface StructureExportCompatibility {
  readonly sizeClass: StructureSizeClass;
  readonly vanillaStructureBlockCompatible: boolean;
  readonly hugeStructureBlocksCompatible: boolean;
}

export interface StructureExportMetadata extends StructureExportCompatibility {
  readonly resourceLocation: string;
  readonly suggestedDownloadFilename: string;
  readonly archiveFilename: string;
  readonly worldInstallPath: string;
  readonly datapackEntryPath: string;
  readonly datapackInstallPath: string;
}

export interface StandaloneStructureNbtPackage extends StructureExportMetadata {
  readonly bytes: Uint8Array;
  readonly dataVersion: typeof MINECRAFT_JAVA_1_21_1_DATA_VERSION;
}

export interface DatapackArchivePlan extends StructureExportMetadata {
  readonly packMcmeta: string;
  readonly packMcmetaBytes: Uint8Array;
  readonly entries: readonly ZipArchiveOutputEntry[];
  readonly embeddedNbtBytes: Uint8Array;
}

export interface DatapackArchivePackage extends DatapackArchivePlan {
  readonly bytes: Uint8Array;
}

export interface StructureExportArtifacts {
  readonly ok: true;
  readonly standalone: StandaloneStructureNbtPackage;
  readonly datapack: DatapackArchivePlan;
}

export interface StructureExportFailure {
  readonly ok: false;
  readonly diagnostics: readonly StructurePackagingDiagnostic[];
}

export type StructureExportResult = StructureExportArtifacts | StructureExportFailure;

export type DatapackArchiveResult = ({ readonly ok: true } & DatapackArchivePackage) | StructureExportFailure;

export type StandaloneStructureNbtResult = { readonly ok: true; readonly standalone: StandaloneStructureNbtPackage } | StructureExportFailure;

export function validateStructureNamespace(value: unknown): readonly StructurePackagingDiagnostic[] {
  if (typeof value === 'string' && value !== '.' && value !== '..' && RESOURCE_NAMESPACE.test(value)) return [];
  return [{ code: 'invalid-namespace', message: 'Namespace must contain only lowercase letters, digits, underscores, dots, or hyphens.', path: 'namespace' }];
}

export function validateStructurePath(value: unknown): readonly StructurePackagingDiagnostic[] {
  if (typeof value !== 'string' || !value || !STRUCTURE_PATH.test(value) || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || value.includes(':')) {
    return [{ code: 'invalid-structure-path', message: 'Structure path must use lowercase Minecraft path characters and safe non-empty segments.', path: 'structurePath' }];
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return [{ code: 'invalid-structure-path', message: 'Structure path cannot contain empty, dot, or parent segments.', path: 'structurePath' }];
  return [];
}

export function validateArchiveName(value: unknown): readonly StructurePackagingDiagnostic[] {
  if (typeof value !== 'string' || !value || !value.trim() || /^\s|\s$/.test(value) || value.endsWith('.') || value === '.' || value === '..' || CONTROL_CHARACTERS.test(value) || /[\\/:<>|"*?]/.test(value) || /^[a-z]:/i.test(value) || /\.zip$/i.test(value) || isWindowsReservedName(value)) {
    return [{ code: 'invalid-archive-name', message: 'Archive name must be a safe filename stem without a .zip suffix or path separators.', path: 'archiveName' }];
  }
  return [];
}

/** Writes the already-prepared datapack plan without rerunning NBT export. */
export async function writeDatapackArchive(plan: DatapackArchivePlan, writer: ZipArchiveWriter = new FflateZipArchiveWriter()): Promise<DatapackArchiveResult> {
  try {
    return { ok: true, ...plan, bytes: await writer.write(plan.entries) };
  } catch (error) {
    return { ok: false, diagnostics: [{ code: 'archive-write-failed', message: error instanceof Error ? error.message : 'ZIP archive writing failed.' }] };
  }
}

export function validateStructureExportInput(project: ProjectDocument, input: StructureExportInput): readonly StructurePackagingDiagnostic[] {
  const diagnostics: StructurePackagingDiagnostic[] = [];
  if (project.metadata.minecraftVersion !== MINECRAFT_JAVA_1_21_1) diagnostics.push({ code: 'unsupported-packaging-version', message: `Datapack packaging supports Minecraft Java ${MINECRAFT_JAVA_1_21_1} only.`, path: 'project.metadata.minecraftVersion' });
  diagnostics.push(...validateStructureNamespace(input.namespace));
  diagnostics.push(...validateStructurePath(input.structurePath));
  diagnostics.push(...validateArchiveName(input.archiveName));
  if (typeof input.description !== 'string') diagnostics.push({ code: 'invalid-description', message: 'Pack description must be a string.', path: 'description' });
  return diagnostics;
}

export function createPackMcmeta(minecraftVersion: string, description: string): { readonly ok: true; readonly json: string; readonly bytes: Uint8Array } | { readonly ok: false; readonly diagnostic: StructurePackagingDiagnostic } {
  if (minecraftVersion !== MINECRAFT_JAVA_1_21_1) return { ok: false, diagnostic: { code: 'unsupported-packaging-version', message: `Datapack packaging supports Minecraft Java ${MINECRAFT_JAVA_1_21_1} only.`, path: 'minecraftVersion' } };
  if (typeof description !== 'string') return { ok: false, diagnostic: { code: 'invalid-description', message: 'Pack description must be a string.', path: 'description' } };
  const json = JSON.stringify({ pack: { pack_format: MINECRAFT_JAVA_1_21_1_PACK_FORMAT, description } });
  return { ok: true, json, bytes: new TextEncoder().encode(json) };
}

export function deriveStructureExportDefaults(project: ProjectDocument, cached: Partial<StructureExportPreferences> = {}): StructureExportDefaults {
  const generatedName = slugifyProjectName(project.metadata.name);
  const namespace = typeof cached.namespace === 'string' && validateStructureNamespace(cached.namespace).length === 0 ? cached.namespace : DEFAULT_STRUCTURE_EXPORT_NAMESPACE;
  const archiveName = typeof cached.archiveName === 'string' && validateArchiveName(cached.archiveName).length === 0 ? cached.archiveName : generatedName;
  const description = typeof cached.description === 'string' && cached.description.trim() ? cached.description : `MinecraftBuilder export: ${project.metadata.name.trim() || 'Structure'}`;
  return { namespace, structurePath: generatedName, archiveName, archiveFilename: `${archiveName}.zip`, description };
}

export async function prepareStructureExport(project: ProjectDocument, codec: MinecraftJavaNbtCodec, input: StructureExportInput): Promise<StructureExportResult> {
  const inputDiagnostics = validateStructureExportInput(project, input);
  if (inputDiagnostics.length > 0) return { ok: false, diagnostics: inputDiagnostics };
  const exported = await exportMinecraftStructure(project, codec);
  if (!exported.ok) return { ok: false, diagnostics: exported.diagnostics };
  const metadata = metadataFor(input, project);
  const packMcmeta = createPackMcmeta(project.metadata.minecraftVersion, input.description);
  if (!packMcmeta.ok) return { ok: false, diagnostics: [packMcmeta.diagnostic] };
  const standalone: StandaloneStructureNbtPackage = { ...metadata, bytes: exported.bytes, dataVersion: MINECRAFT_JAVA_1_21_1_DATA_VERSION };
  const datapack: DatapackArchivePlan = {
    ...metadata,
    packMcmeta: packMcmeta.json,
    packMcmetaBytes: packMcmeta.bytes,
    embeddedNbtBytes: exported.bytes,
    entries: [
      { path: 'pack.mcmeta', bytes: packMcmeta.bytes, compression: 'deflate' },
      { path: metadata.datapackEntryPath, bytes: exported.bytes, compression: 'store' },
    ],
  };
  return { ok: true, standalone, datapack };
}

/** Builds only the standalone artifact while keeping the production exporter authoritative. */
export async function prepareStandaloneStructureNbt(project: ProjectDocument, codec: MinecraftJavaNbtCodec, input: StandaloneStructureNbtInput): Promise<StandaloneStructureNbtResult> {
  const diagnostics: StructurePackagingDiagnostic[] = [];
  if (project.metadata.minecraftVersion !== MINECRAFT_JAVA_1_21_1) diagnostics.push({ code: 'unsupported-packaging-version', message: `Standalone packaging supports Minecraft Java ${MINECRAFT_JAVA_1_21_1} only.`, path: 'project.metadata.minecraftVersion' });
  diagnostics.push(...validateStructureNamespace(input.namespace), ...validateStructurePath(input.structurePath));
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const exported = await exportMinecraftStructure(project, codec);
  if (!exported.ok) return { ok: false, diagnostics: exported.diagnostics };
  const metadata = metadataFor({ ...input, archiveName: lastPathSegment(input.structurePath), description: '' }, project);
  return { ok: true, standalone: { ...metadata, bytes: exported.bytes, dataVersion: MINECRAFT_JAVA_1_21_1_DATA_VERSION } };
}

function metadataFor(input: StructureExportInput, project: ProjectDocument): StructureExportMetadata {
  const archiveFilename = `${input.archiveName}.zip`;
  const sizeClass = classifyStructureSize(project.size);
  return {
    resourceLocation: `${input.namespace}:${input.structurePath}`,
    suggestedDownloadFilename: `${lastPathSegment(input.structurePath)}.nbt`,
    archiveFilename,
    worldInstallPath: `generated/${input.namespace}/structures/${input.structurePath}.nbt`,
    datapackEntryPath: `data/${input.namespace}/structure/${input.structurePath}.nbt`,
    datapackInstallPath: `<world>/datapacks/${archiveFilename}`,
    sizeClass,
    vanillaStructureBlockCompatible: sizeClass === 'vanilla',
    hugeStructureBlocksCompatible: sizeClass === 'vanilla' || sizeClass === 'huge',
  };
}

function lastPathSegment(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }

function isWindowsReservedName(value: string): boolean {
  const stem = value.split('.')[0].toUpperCase();
  return stem === 'CON' || stem === 'PRN' || stem === 'AUX' || stem === 'NUL' || /^COM[1-9]$/.test(stem) || /^LPT[1-9]$/.test(stem);
}

function slugifyProjectName(value: string): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'structure';
}

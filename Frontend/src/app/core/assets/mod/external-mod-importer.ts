import { ZipArchive } from '../archive/zip-archive';
import { ExternalModProvider, isModConflictDiagnostic, ModImportDiagnostic, ModImportReport, SupportedModLoader } from './external-mod-provider';
import { detectLoader, NormalizedModMetadata } from './mod-loader';

const RETAINED_RESOURCE_PATH = /^(?:assets|data)\/[^/]+\/(?:blockstates|models|items|textures|lang|atlases|tags\/block|tags\/item|tags\/painting_variant|painting_variant)\/.+\.(?:json|png|png\.mcmeta)$/;
const MAX_RETAINED_BYTES = 256 * 1024 * 1024;
const BATCH_SIZE = 32;

export interface ModImportProgress {
  readonly phase: 'opening-archive' | 'reading-metadata' | 'checking-compatibility' | 'indexing-resources' | 'extracting-resources' | 'discovering-blocks' | 'discovering-items' | 'discovering-decorations' | 'evaluating-behavior' | 'checking-conflicts' | 'saving-cache' | 'activating';
  readonly processed?: number;
  readonly total?: number;
  readonly blocksDetected?: number;
  readonly blocksImported?: number;
  readonly itemsDetected?: number;
  readonly itemsIndexed?: number;
  readonly decorationsDetected?: number;
  readonly decorationsImported?: number;
  readonly warnings?: number;
}

export interface PreparedModImport {
  readonly loader: SupportedModLoader;
  readonly loaderSupported: boolean;
  readonly minecraftVersion: string;
  readonly metadata?: unknown;
  readonly normalizedMetadata?: NormalizedModMetadata;
  readonly json: ReadonlyMap<string, unknown>;
  readonly resources: ReadonlyMap<string, Uint8Array>;
  readonly diagnostics: readonly ModImportDiagnostic[];
  readonly nestedJarCount: number;
  readonly fingerprint?: string;
  readonly report?: ModImportReport;
  readonly canActivate: boolean;
  dispose(): void;
}

export async function inspectModJar(file: File, minecraftVersion = '1.21.1', onProgress?: (progress: ModImportProgress) => void): Promise<PreparedModImport> {
  onProgress?.({ phase: 'opening-archive' });
  const archive = await ZipArchive.open(file);
  const diagnostics: ModImportDiagnostic[] = [];
  const suspicious = archive.entries.filter((entry) => !safeArchivePath(entry.name));
  for (const entry of suspicious) diagnostics.push({ severity: 'warning', category: 'warning', code: 'unsafe-archive-path', message: 'Skipped an archive path that is not safe to retain.', path: entry.name });
  const paths = archive.entries.filter((entry) => safeArchivePath(entry.name)).map((entry) => entry.name);
  const loader = detectLoader(paths);
  const metadataPath = loader === 'fabric' ? 'fabric.mod.json' : loader === 'quilt' ? 'quilt.mod.json' : undefined;
  onProgress?.({ phase: 'reading-metadata', processed: 0, total: paths.length });
  let metadata: unknown;
  if (metadataPath) {
    const metadataEntry = archive.entries.find((entry) => entry.name === metadataPath);
    if (!metadataEntry) throw new Error(`${metadataPath} is missing`);
    try { metadata = JSON.parse(new TextDecoder().decode(await metadataEntry.read())); }
    catch { throw new Error(`${metadataPath} is malformed`); }
  }
  const nestedJarCount = archive.entries.filter((entry) => entry.name.toLowerCase().endsWith('.jar')).length;
  if (nestedJarCount) diagnostics.push({ severity: 'info', category: 'info', code: 'nested-jar-skipped', message: `Skipped ${nestedJarCount} nested JAR file(s); no embedded code is executed.` });
  if (loader !== 'fabric') {
    const code = loader === 'unknown' ? 'unsupported-loader' : 'unsupported-loader';
    diagnostics.push({ severity: 'error', category: 'blocking', code, message: loader === 'unknown' ? 'Could not detect a supported mod loader.' : `${capitalize(loader)} metadata was detected but this loader is not supported yet.` });
    return prepared({ loader, loaderSupported: false, minecraftVersion, json: new Map(), resources: new Map(), diagnostics, nestedJarCount, canActivate: false, report: { metadataFormat: loader, loader, loaderSupported: false, namespaces: [], retainedResourceCount: 0, candidateBlockCount: 0, blocks: { detected: 0, imported: 0, partial: 0, unsupported: 0 }, items: { detected: 0, indexed: 0, unsupportedVisuals: 0 }, decorations: { detected: 0, imported: 0, partial: 0, unsupported: 0 }, conflicts: diagnostics.filter(isModConflictDiagnostic), warnings: diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'), diagnostics, runtimeDependencies: {}, nestedJarCount } });
  }
  const entries = archive.entries.filter((entry) => safeArchivePath(entry.name) && RETAINED_RESOURCE_PATH.test(entry.name));
  const totalSize = entries.reduce((total, entry) => total + entry.uncompressedSize, 0);
  if (totalSize > MAX_RETAINED_BYTES) throw new Error('The mod resource payload is too large to retain locally');
  onProgress?.({ phase: 'indexing-resources', processed: 0, total: entries.length });
  const json = new Map<string, unknown>(); const binary = new Map<string, Uint8Array>();
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const decoded = await Promise.all(batch.map(async (entry) => ({ entry, bytes: await entry.read() })));
    for (const { entry, bytes } of decoded) {
      if (entry.name.endsWith('.json') || entry.name.endsWith('.png.mcmeta')) {
        try { json.set(entry.name, JSON.parse(new TextDecoder().decode(bytes))); }
        catch { diagnostics.push({ severity: 'warning', category: 'warning', code: 'malformed-json', message: 'Skipped malformed optional JSON resource.', path: entry.name }); }
      } else binary.set(entry.name, bytes);
    }
    onProgress?.({ phase: 'extracting-resources', processed: Math.min(offset + batch.length, entries.length), total: entries.length });
  }
  const fingerprint = await hashFile(file);
  onProgress?.({ phase: 'checking-compatibility' });
  let provider: ExternalModProvider;
  try { provider = ExternalModProvider.create({ metadata, json, resources: binary, diagnostics, minecraftVersion, fingerprint }); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Mod metadata is malformed';
    const invalid = [...diagnostics, { severity: 'error' as const, category: 'blocking' as const, code: 'malformed-json', message }];
    return prepared({ loader, loaderSupported: true, minecraftVersion, metadata, json, resources: binary, diagnostics: invalid, nestedJarCount, fingerprint, canActivate: false });
  }
  const compatible = provider.compatibility.status === 'compatible';
  const allDiagnostics = provider.report.diagnostics;
  onProgress?.({ phase: 'discovering-blocks', blocksDetected: provider.report.blocks.detected, blocksImported: provider.report.blocks.imported });
  onProgress?.({ phase: 'discovering-items', itemsDetected: provider.report.items.detected, itemsIndexed: provider.report.items.indexed });
  onProgress?.({ phase: 'discovering-decorations', decorationsDetected: provider.report.decorations.detected, decorationsImported: provider.report.decorations.imported });
  onProgress?.({ phase: 'evaluating-behavior', warnings: allDiagnostics.filter((diagnostic) => diagnostic.severity !== 'error').length });
  onProgress?.({ phase: 'checking-conflicts' });
  return prepared({ loader, loaderSupported: true, minecraftVersion, metadata, normalizedMetadata: provider.normalizedMetadata, json, resources: binary, diagnostics: allDiagnostics, nestedJarCount, fingerprint, report: provider.report, canActivate: compatible && !allDiagnostics.some((diagnostic) => diagnostic.severity === 'error'), dispose: provider.dispose.bind(provider) });
}

export function commitModImport(prepared: PreparedModImport, onProgress?: (progress: ModImportProgress) => void): ExternalModProvider {
  onProgress?.({ phase: 'checking-conflicts' });
  if (!prepared.loaderSupported) throw new UnsupportedModLoaderError(prepared.loader);
  if (!prepared.metadata) throw new Error('Mod metadata is missing');
  if (!prepared.canActivate) throw new Error(prepared.report?.compatibility?.reason === 'missing-minecraft-dependency' ? 'Minecraft compatibility is unknown because depends.minecraft is missing.' : 'Mod preflight did not pass; resolve blocking diagnostics before activation.');
  const provider = ExternalModProvider.create({ metadata: prepared.metadata, json: prepared.json, resources: prepared.resources, diagnostics: prepared.diagnostics, minecraftVersion: prepared.minecraftVersion, fingerprint: prepared.fingerprint });
  return provider;
}

/** Compatibility wrapper retained for the current import button. */
export async function importFabricModJar(file: File, minecraftVersion = '1.21.1', onProgress?: (progress: ModImportProgress) => void): Promise<ExternalModProvider> {
  const prepared = await inspectModJar(file, minecraftVersion, onProgress);
  try { return commitModImport(prepared, onProgress); } finally { prepared.dispose(); }
}

export class UnsupportedModLoaderError extends Error {
  constructor(readonly loader: SupportedModLoader) { super(loader === 'unknown' ? 'Could not detect a supported mod loader. Only Fabric resource import is supported.' : `Detected ${capitalize(loader)} mod. ${capitalize(loader)} JAR import is not supported yet.`); }
}

export function detectModLoader(paths: readonly string[]): SupportedModLoader { return detectLoader(paths); }
function prepared(value: Omit<PreparedModImport, 'dispose'> & Partial<Pick<PreparedModImport, 'dispose'>>): PreparedModImport { return { ...value, dispose: value.dispose ?? (() => undefined) }; }
function safeArchivePath(path: string): boolean { return !!path && !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path) && !path.split('/').some((part) => part === '..' || part === '.'); }
function capitalize(value: string): string { return value.length ? value[0].toUpperCase() + value.slice(1) : value; }
async function hashFile(file: File): Promise<string | undefined> { try { if (!globalThis.crypto?.subtle) return undefined; const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''); } catch { return undefined; } }

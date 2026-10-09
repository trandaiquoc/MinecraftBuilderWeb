import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import { CONTENT_SOURCE_MINECRAFT_VERSION } from '../content-source/content-source.types';
import { textureResourcePath } from '../../content/resource-location';
import { ExternalModCatalogBuilder } from './external-mod-catalog-builder';
import type { ExternalCatalogProgress, ExternalModCatalog } from './external-mod-catalog-builder';
import { evaluateMinecraftRequirement } from './minecraft-version-predicate';
import { legacyFabricMetadata, normalizeFabricMetadata } from './mod-loader';
import type { FabricModMetadata, ModCompatibilityResult, NormalizedModMetadata } from './mod-loader';
import { buildExternalModImportReport } from './external-mod-import-report';
import { EXTERNAL_MOD_CACHE_SCHEMA_VERSION } from './external-mod-import-contracts';
import type { ExternalModResourceInput, ModImportDiagnostic, ModImportReport, SerializedExternalMod } from './external-mod-import-contracts';
import type { PaintingVariant } from '../../decorations/decoration.types';
import { SemanticManifestEvidenceProvider, type ContentSemanticEvidenceProvider } from '../../content/content-introspection';
import { StaticJvmSemanticEvidenceProvider } from '../../content/jvm-semantic-evidence';
import { CooperativeWorkBudget, yieldToBrowser } from '../cooperative-yield';
import { throwIfAborted } from './mod-import-cancellation';

export class ExternalModProvider implements ContentSourceProvider {
  readonly source;
  readonly gameEdition = 'java' as const;
  readonly gameVersion: string;
  readonly metadata: FabricModMetadata;
  readonly normalizedMetadata: NormalizedModMetadata;
  readonly compatibility: ModCompatibilityResult;
  readonly report: ModImportReport;
  private readonly objectUrls = new Map<string, string>();
  readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];
  private catalogCache?: ExternalModCatalog;
  private readonly catalogBuilder: ExternalModCatalogBuilder;

  private constructor(
    metadata: FabricModMetadata,
    normalizedMetadata: NormalizedModMetadata,
    private readonly json: Readonly<Record<string, unknown>>,
    private readonly binary: ReadonlyMap<string, Uint8Array>,
    namespaces: readonly string[],
    minecraftVersion: string,
    diagnostics: readonly ModImportDiagnostic[] = [],
    readonly fingerprint?: string,
  ) {
    this.metadata = metadata; this.normalizedMetadata = normalizedMetadata; this.gameVersion = minecraftVersion;
    this.compatibility = evaluateMinecraftRequirement(normalizedMetadata.minecraftRequirement, minecraftVersion);
    this.source = { id: `mod:${normalizedMetadata.modId}`, kind: 'external' as const, displayName: normalizedMetadata.displayName, minecraftVersion, sourceVersion: normalizedMetadata.modVersion, namespaces: [...namespaces] };
    const classFiles = new Map([...binary].filter(([path]) => path.endsWith('.class')));
    this.semanticEvidenceProviders = [new SemanticManifestEvidenceProvider(this, this.source.id, this.source.displayName), new StaticJvmSemanticEvidenceProvider({ minecraftVersion, classFileMajor: 61 }, classFiles)];
    this.catalogBuilder = new ExternalModCatalogBuilder(this, json);
    this.report = buildExternalModImportReport({
      sourceId: this.source.id,
      metadata,
      normalizedMetadata,
      namespaces,
      json,
      binaryResourceCount: binary.size,
      minecraftVersion,
      compatibility: this.compatibility,
      diagnostics,
    });
  }

  static create(input: ExternalModResourceInput): ExternalModProvider {
    const normalized = normalizeFabricMetadata(input.metadata);
    const metadata = legacyFabricMetadata(normalized);
    const namespaces = discoverNamespaces(input.json, input.resources);
    if (!namespaces.length) throw new Error('The Fabric mod contains no supported asset or data namespaces');
    const diagnostics = [...(input.diagnostics ?? [])];
    for (const [path, value] of input.json) {
      if (!path.includes('/models/') || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (typeof (value as Record<string, unknown>)['loader'] === 'string') diagnostics.push({ severity: 'warning', category: 'warning', code: 'custom-model-loader', message: 'Custom model loader was retained but is not executed.', path });
    }
    const minecraftVersion = input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION;
    const compatibility = evaluateMinecraftRequirement(normalized.minecraftRequirement, minecraftVersion);
    if (compatibility.status === 'unknown') diagnostics.push({ severity: 'warning', category: 'blocking', code: compatibility.reason, message: 'Minecraft compatibility could not be verified for the selected project version.' });
    if (compatibility.status === 'incompatible') diagnostics.push({ severity: 'error', category: 'blocking', code: 'minecraft-version-incompatible', message: 'The declared Minecraft compatibility excludes the selected project version.' });
    return new ExternalModProvider(metadata, normalized, Object.fromEntries(input.json), input.resources, namespaces, minecraftVersion, diagnostics, input.fingerprint);
  }

  static deserialize(value: SerializedExternalMod, minecraftVersion: string = CONTENT_SOURCE_MINECRAFT_VERSION): ExternalModProvider {
    if (value.schemaVersion !== EXTERNAL_MOD_CACHE_SCHEMA_VERSION || !value.normalizedMetadata) throw new Error('Imported mod cache is outdated or incompatible');
    if (!Array.isArray(value.namespaces) || !value.namespaces.every((namespace) => typeof namespace === 'string') || !value.json || typeof value.json !== 'object' || !Array.isArray(value.binary)) throw new Error('Imported mod cache is malformed');
    return new ExternalModProvider(value.metadata, value.normalizedMetadata, value.json, new Map(value.binary.map((entry) => [entry.path, new Uint8Array(entry.data)])), value.namespaces, minecraftVersion, value.report?.diagnostics ?? [], value.fingerprint);
  }

  serialize(): SerializedExternalMod {
    const { compatibility: _compatibility, projectMinecraftVersion: _projectMinecraftVersion, canActivate: _canActivate, ...versionIndependentReport } = this.report;
    return { schemaVersion: EXTERNAL_MOD_CACHE_SCHEMA_VERSION, sourceId: this.source.id, metadata: this.metadata, normalizedMetadata: this.normalizedMetadata, minecraftRequirement: this.normalizedMetadata.minecraftRequirement, ...(this.fingerprint ? { fingerprint: this.fingerprint } : {}), namespaces: this.source.namespaces, json: this.json, binary: [...this.binary].map(([path, data]) => ({ path, data: storageBuffer(data) })), report: versionIndependentReport };
  }

  async serializeForCacheAsync(onProgress?: (progress: { readonly processed: number; readonly total: number }) => void, signal?: AbortSignal): Promise<SerializedExternalMod> {
    throwIfAborted(signal);
    const entries = [...this.binary];
    const binary: { readonly path: string; readonly data: ArrayBuffer }[] = [];
    const budget = new CooperativeWorkBudget();
    let sliceItems = 0;
    for (let index = 0; index < entries.length; index++) {
      throwIfAborted(signal);
      const [path, data] = entries[index];
      binary.push({ path, data: storageBuffer(data) });
      onProgress?.({ processed: index + 1, total: entries.length });
      sliceItems++;
      if (budget.shouldYield(sliceItems)) { await yieldToBrowser(signal); throwIfAborted(signal); budget.reset(); sliceItems = 0; }
    }
    throwIfAborted(signal);
    const { compatibility: _compatibility, projectMinecraftVersion: _projectMinecraftVersion, canActivate: _canActivate, ...versionIndependentReport } = this.report;
    return { schemaVersion: EXTERNAL_MOD_CACHE_SCHEMA_VERSION, sourceId: this.source.id, metadata: this.metadata, normalizedMetadata: this.normalizedMetadata, minecraftRequirement: this.normalizedMetadata.minecraftRequirement, ...(this.fingerprint ? { fingerprint: this.fingerprint } : {}), namespaces: this.source.namespaces, json: this.json, binary, report: versionIndependentReport };
  }

  readJson(path: string): unknown | undefined { return this.json[path]; }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  paths(): readonly string[] { return [...new Set([...Object.keys(this.json), ...this.binary.keys()])]; }
  textureUrl(resource: string): string | undefined {
    const path = textureResourcePath(resource); const bytes = this.binary.get(path); if (!bytes) return undefined;
    const existing = this.objectUrls.get(path); if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); this.objectUrls.set(path, url); return url;
  }
  iconUrl(): string | undefined {
    const icon = this.normalizedMetadata.icon; if (!icon) return undefined;
    const bytes = this.binary.get(icon); if (!bytes) return undefined;
    const existing = this.objectUrls.get(icon); if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); this.objectUrls.set(icon, url); return url;
  }

  catalog(): BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] } { return this.catalogCache ?? (this.catalogCache = this.catalogBuilder.build()); }

  async prepareCatalog(onProgress?: (progress: ExternalCatalogProgress) => void, signal?: AbortSignal): Promise<BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] }> {
    throwIfAborted(signal);
    if (this.catalogCache) { onProgress?.({ processed: this.catalogCache.blocks.length, total: this.catalogCache.blocks.length }); return this.catalogCache; }
    const catalog = await this.catalogBuilder.prepare(onProgress, signal);
    throwIfAborted(signal);
    this.catalogCache = catalog;
    return catalog;
  }

  dispose(): void { for (const url of this.objectUrls.values()) URL.revokeObjectURL(url); this.objectUrls.clear(); }
}

export function discoverNamespaces(json: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>): readonly string[] {
  const paths = [...(json instanceof Map ? json.keys() : Object.keys(json)), ...binary.keys()];
  return [...new Set(paths.map((path) => /^(?:assets|data)\/([^/]+)\//.exec(path)?.[1]).filter((value): value is string => !!value))].sort();
}

function storageBuffer(data: Uint8Array): ArrayBuffer { return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer as ArrayBuffer : data.slice().buffer as ArrayBuffer; }

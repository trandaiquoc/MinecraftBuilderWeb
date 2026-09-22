import type { AssetBlockRecord, BlockStateDefinition, CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import { CONTENT_SOURCE_MINECRAFT_VERSION } from '../content-source/content-source.types';
import { texturePath } from '../vanilla/vanilla-asset-provider';
import { itemEvidenceFromResources } from '../vanilla/format/item-evidence';
import { evaluateCommonBehavior } from '../../block-behavior/compatibility/common-behavior';
import { evaluateMinecraftRequirement } from './minecraft-version-predicate';
import { normalizeFabricMetadata, NormalizedModMetadata, ModCompatibilityResult, SupportedModLoader } from './mod-loader';
export type { SupportedModLoader } from './mod-loader';
import type { PaintingVariant } from '../../decorations/decoration.types';

export const EXTERNAL_MOD_CACHE_SCHEMA_VERSION = 2 as const;

/** Kept for compatibility with callers that still use Fabric-shaped metadata. */
export interface FabricModMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly minecraftCompatibility?: string | readonly string[];
  readonly description?: string;
  readonly depends?: Readonly<Record<string, unknown>>;
  readonly recommends?: Readonly<Record<string, unknown>>;
  readonly suggests?: Readonly<Record<string, unknown>>;
  readonly breaks?: Readonly<Record<string, unknown>>;
  readonly conflicts?: Readonly<Record<string, unknown>>;
  readonly environment?: string;
  readonly icon?: string;
  readonly jars?: readonly unknown[];
}

export interface ModImportDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly category?: 'blocking' | 'warning' | 'info';
  readonly path?: string;
}

export interface ModImportCounts {
  readonly detected: number;
  readonly imported: number;
  readonly partial: number;
  readonly unsupported: number;
}

export interface ModImportReport {
  readonly metadataFormat: SupportedModLoader;
  readonly loader: SupportedModLoader;
  readonly loaderSupported: boolean;
  readonly metadata?: FabricModMetadata;
  readonly normalizedMetadata?: NormalizedModMetadata;
  readonly namespaces: readonly string[];
  readonly retainedResourceCount: number;
  readonly candidateBlockCount: number;
  readonly compatibility?: ModCompatibilityResult;
  readonly projectMinecraftVersion?: string;
  readonly canActivate?: boolean;
  readonly blocks: ModImportCounts;
  readonly items: { readonly detected: number; readonly indexed: number; readonly unsupportedVisuals: number };
  readonly decorations: ModImportCounts;
  readonly conflicts: readonly ModImportDiagnostic[];
  readonly warnings: readonly ModImportDiagnostic[];
  readonly diagnostics: readonly ModImportDiagnostic[];
  readonly runtimeDependencies: Readonly<Record<string, unknown>>;
  readonly nestedJarCount: number;
}

export interface SerializedExternalMod {
  readonly schemaVersion: typeof EXTERNAL_MOD_CACHE_SCHEMA_VERSION;
  readonly sourceId: string;
  readonly metadata: FabricModMetadata;
  readonly normalizedMetadata: NormalizedModMetadata;
  readonly minecraftRequirement?: string | readonly string[];
  readonly fingerprint?: string;
  readonly namespaces: readonly string[];
  readonly json: Readonly<Record<string, unknown>>;
  readonly binary: readonly { readonly path: string; readonly data: ArrayBuffer }[];
  readonly report: ModImportReport;
}

export interface ExternalModResourceInput {
  readonly metadata: unknown;
  readonly minecraftVersion?: string;
  readonly resources: ReadonlyMap<string, Uint8Array>;
  readonly json: ReadonlyMap<string, unknown>;
  readonly diagnostics?: readonly ModImportDiagnostic[];
  readonly fingerprint?: string;
}

export class ExternalModProvider implements ContentSourceProvider {
  readonly source;
  readonly gameEdition = 'java' as const;
  readonly gameVersion: string;
  readonly metadata: FabricModMetadata;
  readonly normalizedMetadata: NormalizedModMetadata;
  readonly compatibility: ModCompatibilityResult;
  readonly report: ModImportReport;
  private readonly objectUrls = new Map<string, string>();

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
    const blockCandidates = Object.keys(json).filter((path) => /^assets\/[^/]+\/blockstates\/.*\.json$/.test(path));
    const itemEvidence = externalItemEvidence(json);
    const paintingCandidates = discoverPaintingVariants(json);
    const blocking = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    const conflicts = diagnostics.filter(isModConflictDiagnostic);
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity !== 'error');
    const unsupported = diagnostics.filter((diagnostic) => diagnostic.code === 'custom-model-loader').length;
    this.report = {
      metadataFormat: normalizedMetadata.loader,
      loader: normalizedMetadata.loader,
      loaderSupported: normalizedMetadata.loader === 'fabric',
      metadata,
      normalizedMetadata,
      namespaces: [...namespaces],
      retainedResourceCount: Object.keys(json).length + binary.size,
      candidateBlockCount: blockCandidates.length,
      compatibility: this.compatibility,
      projectMinecraftVersion: minecraftVersion,
      canActivate: normalizedMetadata.loader === 'fabric' && this.compatibility.status === 'compatible' && blocking.length === 0,
      blocks: { detected: blockCandidates.length, imported: blockCandidates.length, partial: blockCandidates.length, unsupported: 0 },
      items: { detected: itemEvidence.length, indexed: itemEvidence.length, unsupportedVisuals: 0 },
      decorations: { detected: paintingCandidates.length, imported: paintingCandidates.length, partial: 0, unsupported: 0 },
      conflicts,
      warnings,
      diagnostics: [...diagnostics],
      runtimeDependencies: normalizedMetadata.runtimeDependencies,
      nestedJarCount: normalizedMetadata.nestedJars.length,
    };
  }

  static create(input: ExternalModResourceInput): ExternalModProvider {
    const normalized = normalizeFabricMetadata(input.metadata);
    const metadata = legacyFabricMetadata(normalized);
    const namespaces = discoverNamespaces(input.json, input.resources);
    if (!namespaces.length) throw new Error('The Fabric mod contains no supported asset or data namespaces');
    const diagnostics = [...(input.diagnostics ?? [])];
    const provider = new ExternalModProvider(metadata, normalized, Object.fromEntries(input.json), input.resources, namespaces, input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION, diagnostics, input.fingerprint);
    for (const [path, value] of input.json) {
      if (!path.includes('/models/') || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (typeof (value as Record<string, unknown>)['loader'] === 'string') diagnostics.push({ severity: 'warning', category: 'warning', code: 'custom-model-loader', message: 'Custom model loader was retained but is not executed.', path });
    }
    if (provider.compatibility.status === 'unknown') diagnostics.push({ severity: 'warning', category: 'blocking', code: provider.compatibility.reason, message: 'Minecraft compatibility could not be verified for the selected project version.' });
    if (provider.compatibility.status === 'incompatible') diagnostics.push({ severity: 'error', category: 'blocking', code: 'minecraft-version-incompatible', message: 'The declared Minecraft compatibility excludes the selected project version.' });
    if (diagnostics.length !== provider.report.diagnostics.length) return new ExternalModProvider(metadata, normalized, Object.fromEntries(input.json), input.resources, namespaces, input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION, diagnostics, input.fingerprint);
    return provider;
  }

  static deserialize(value: SerializedExternalMod, minecraftVersion: string = CONTENT_SOURCE_MINECRAFT_VERSION): ExternalModProvider {
    if (value.schemaVersion !== EXTERNAL_MOD_CACHE_SCHEMA_VERSION || !value.normalizedMetadata) throw new Error('Imported mod cache is outdated or incompatible');
    if (!Array.isArray(value.namespaces) || !value.namespaces.every((namespace) => typeof namespace === 'string') || !value.json || typeof value.json !== 'object' || !Array.isArray(value.binary)) throw new Error('Imported mod cache is malformed');
    return new ExternalModProvider(value.metadata, value.normalizedMetadata, value.json, new Map(value.binary.map((entry) => [entry.path, new Uint8Array(entry.data)])), value.namespaces, minecraftVersion, value.report?.diagnostics ?? [], value.fingerprint);
  }

  serialize(): SerializedExternalMod {
    const { compatibility: _compatibility, projectMinecraftVersion: _projectMinecraftVersion, canActivate: _canActivate, ...versionIndependentReport } = this.report;
    return { schemaVersion: EXTERNAL_MOD_CACHE_SCHEMA_VERSION, sourceId: this.source.id, metadata: this.metadata, normalizedMetadata: this.normalizedMetadata, minecraftRequirement: this.normalizedMetadata.minecraftRequirement, ...(this.fingerprint ? { fingerprint: this.fingerprint } : {}), namespaces: this.source.namespaces, json: this.json, binary: [...this.binary].map(([path, data]) => ({ path, data: data.slice().buffer })), report: versionIndependentReport };
  }

  readJson(path: string): unknown | undefined { return this.json[path]; }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  paths(): readonly string[] { return [...new Set([...Object.keys(this.json), ...this.binary.keys()])]; }
  textureUrl(resource: string): string | undefined {
    const path = texturePath(resource); const bytes = this.binary.get(path); if (!bytes) return undefined;
    const existing = this.objectUrls.get(path); if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); this.objectUrls.set(path, url); return url;
  }

  catalog(): BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] } {
    const records: AssetBlockRecord[] = [];
    const blockstatePaths = Object.keys(this.json).filter((value) => /^assets\/[^/]+\/blockstates\/.*\.json$/.test(value)).sort();
    const itemEvidence = externalItemEvidence(this.json);
    const blockIds = new Set(blockstatePaths.map((path) => { const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path)!; return `${match[1]}:${match[2]}`; }));
    for (const path of blockstatePaths) {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path); if (!match) continue;
      const namespace = match[1]; const blockPath = match[2]; const id = `${namespace}:${blockPath}`;
      const blockstate = this.json[path]; const definitions = inferStateDefinitions(blockstate); const language = this.languageFor(namespace);
      const initial: AssetBlockRecord = { id, displayName: typeof language[`block.${namespace}.${blockPath.replaceAll('/', '.')}`] === 'string' ? language[`block.${namespace}.${blockPath.replaceAll('/', '.')}`] as string : humanize(blockPath), defaultState: {}, stateDefinitions: definitions, resources: { blockstate: path, model: configuredModelIds(blockstate)[0], textures: [] }, support: 'partial', visualSupport: 'partial', behaviorSupport: 'unknown', defaultStateSource: 'unknown', visualClassification: 'standard-json', visualClassificationEvidence: 'inferred', sourceId: this.source.id, sourceName: this.source.displayName, modName: this.source.displayName, trustedBehaviorFamilies: trustedFamiliesFor(id, this.json), behaviorEvidenceRequired: true };
      const evaluation = evaluateCommonBehavior(initial, this); const withState: AssetBlockRecord = { ...initial, defaultState: evaluation.defaultState, stateDefinitions: evaluation.stateDefinitions, defaultStateSource: evaluation.defaultStateSource, ...(evaluation.behavior ? { behavior: evaluation.behavior, behaviorSupport: 'partial' as const } : {}) };
      const matchingItem = itemEvidence.find((entry) => entry.itemId === id);
      records.push({ ...withState, itemEvidence: matchingItem ? { itemId: id, placeable: true, sourceFormat: matchingItem.sourceFormat, referencedModels: matchingItem.referencedModels, referencedResources: matchingItem.referencedResources } : undefined });
    }
    const targetItems: CatalogItemEvidence[] = itemEvidence.map((entry) => ({ ...entry, explicitBlockPlacement: blockIds.has(entry.itemId) ? { blockId: entry.itemId } : undefined, sourceId: this.source.id, sourceName: this.source.displayName }));
    return { minecraftVersion: this.source.minecraftVersion, sourceId: this.source.id, sourceName: this.source.displayName, blocks: records, targetItems, itemEvidenceAvailable: true, paintingVariants: discoverPaintingVariants(this.json, this.source.id, this.source.displayName) };
  }

  dispose(): void { for (const url of this.objectUrls.values()) URL.revokeObjectURL(url); this.objectUrls.clear(); }
  private languageFor(namespace: string): Record<string, unknown> { const exact = this.json[`assets/${namespace}/lang/en_us.json`]; return exact && typeof exact === 'object' && !Array.isArray(exact) ? exact as Record<string, unknown> : {}; }
}

export type FabricCompatibility = 'compatible' | 'incompatible' | 'unknown';
export function assessFabricCompatibility(expression: string | readonly string[] | undefined, version: string): FabricCompatibility { return evaluateMinecraftRequirement(expression, version).status; }
export function parseFabricModMetadata(value: unknown): FabricModMetadata { return legacyFabricMetadata(normalizeFabricMetadata(value)); }
export function discoverNamespaces(json: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>): readonly string[] {
  const paths = [...(json instanceof Map ? json.keys() : Object.keys(json)), ...binary.keys()];
  return [...new Set(paths.map((path) => /^(?:assets|data)\/([^/]+)\//.exec(path)?.[1]).filter((value): value is string => !!value))].sort();
}

function legacyFabricMetadata(value: NormalizedModMetadata): FabricModMetadata { return { id: value.modId, displayName: value.displayName, version: value.modVersion, ...(value.minecraftRequirement ? { minecraftCompatibility: value.minecraftRequirement } : {}), ...(value.description ? { description: value.description } : {}), depends: value.runtimeDependencies, breaks: value.breaks, conflicts: value.conflicts, environment: value.environment, icon: value.icon, jars: value.nestedJars }; }
function configuredModelIds(value: unknown): string[] { const result = new Set<string>(); const visit = (item: unknown): void => { if (Array.isArray(item)) { item.forEach(visit); return; } if (!item || typeof item !== 'object') return; const object = item as Record<string, unknown>; if (typeof object['model'] === 'string') result.add(object['model']); Object.values(object).forEach(visit); }; visit(value); return [...result]; }
function inferStateDefinitions(value: unknown): readonly BlockStateDefinition[] { const values = new Map<string, Set<string>>(); const add = (expression: string): void => { for (const item of expression.split(',')) { const [name, raw] = item.split('='); if (!name || raw === undefined) continue; const options = values.get(name) ?? new Set<string>(); raw.split('|').forEach((option) => options.add(option)); values.set(name, options); } }; const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; const variants = object['variants'] && typeof object['variants'] === 'object' && !Array.isArray(object['variants']) ? object['variants'] as Record<string, unknown> : {}; Object.keys(variants).forEach(add); const visit = (condition: unknown): void => { if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return; for (const [name, raw] of Object.entries(condition as Record<string, unknown>)) { if (name === 'AND' || name === 'OR') { if (Array.isArray(raw)) raw.forEach(visit); } else if (typeof raw === 'string') add(`${name}=${raw}`); } }; if (Array.isArray(object['multipart'])) object['multipart'].forEach((part) => { if (part && typeof part === 'object' && !Array.isArray(part)) visit((part as Record<string, unknown>)['when']); }); return [...values].map(([name, options]) => ({ name, values: [...options] })); }
function trustedFamiliesFor(id: string, json: Readonly<Record<string, unknown>>): readonly string[] { const families = new Set<string>(); const tags = Object.keys(json).filter((path) => /^data\/[^/]+\/tags\/block\/.+\.json$/.test(path)); for (const path of tags) { const value = json[path]; const values = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)['values']) ? (value as Record<string, unknown>)['values'] as unknown[] : []; if (!values.some((entry) => typeof entry === 'string' && (entry === id || entry.replace(/^#/, '') === id))) continue; if (/fences?/.test(path)) families.add('fence'); if (/walls?/.test(path)) families.add('wall'); if (/stairs?/.test(path)) families.add('stairs'); if (/doors?/.test(path)) families.add('doors'); if (/beds?/.test(path)) families.add('beds'); if (/tall_flowers?/.test(path)) families.add('double-height'); } return [...families]; }
function discoverPaintingVariants(json: Readonly<Record<string, unknown>>, sourceId = 'vanilla', sourceName = 'Vanilla'): readonly PaintingVariant[] { const placeable = new Set<string>(); for (const [path, value] of Object.entries(json)) if (/^data\/[^/]+\/tags\/painting_variant\/placeable\.json$/.test(path)) { const entries = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)['values']) ? (value as Record<string, unknown>)['values'] as unknown[] : []; entries.forEach((entry) => { if (typeof entry === 'string' && !entry.startsWith('#')) placeable.add(entry); }); } return Object.entries(json).flatMap(([path, raw]) => { const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path); if (!match || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []; const value = raw as Record<string, unknown>; const width = Number(value['width']); const height = Number(value['height']); if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return []; const id = `${match[1]}:${match[2]}`; const assetPath = typeof value['asset_id'] === 'string' ? value['asset_id'] : id; return [{ id, width, height, assetPath, placeable: placeable.size ? placeable.has(id) : true, sourceId, sourceName }]; }); }
function humanize(value: string): string { return value.split('/').at(-1)!.split('_').map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' '); }
function externalItemEvidence(json: Readonly<Record<string, unknown>>): readonly ReturnType<typeof itemEvidenceFromResources>[number][] {
  const paths = Object.keys(json);
  const modern = itemEvidenceFromResources(json, paths.filter((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path)), 'modern-item-definition');
  const legacy = itemEvidenceFromResources(json, paths.filter((path) => /^assets\/[^/]+\/models\/item\/.+\.json$/.test(path)), 'legacy-item-model');
  const byId = new Map<string, ReturnType<typeof itemEvidenceFromResources>[number]>();
  for (const entry of [...legacy, ...modern]) byId.set(entry.itemId, entry);
  return [...byId.values()];
}

export function isModConflictDiagnostic(diagnostic: ModImportDiagnostic): boolean {
  return diagnostic.code === 'resource-conflict'
    || diagnostic.code === 'tag-replacement-unsupported'
    || diagnostic.code === 'block-id-conflict'
    || diagnostic.code === 'item-id-conflict'
    || diagnostic.code === 'decoration-id-conflict';
}

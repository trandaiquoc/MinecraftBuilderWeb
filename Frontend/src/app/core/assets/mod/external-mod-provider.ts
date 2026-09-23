import type { AssetBlockRecord, CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import { CONTENT_SOURCE_MINECRAFT_VERSION } from '../content-source/content-source.types';
import { texturePath } from '../vanilla/vanilla-asset-provider';
import { itemEvidenceFromResources } from '../vanilla/format/item-evidence';
import { evaluateCommonBehavior } from '../../block-behavior/compatibility/common-behavior';
import { evaluateMinecraftRequirement } from './minecraft-version-predicate';
import { normalizeFabricMetadata, NormalizedModMetadata, ModCompatibilityResult, SupportedModLoader } from './mod-loader';
export type { SupportedModLoader } from './mod-loader';
import { paintingTextureResource, type PaintingVariant } from '../../decorations/decoration.types';
import { TagIndex } from '../../content/tag-index';
import { ContentIntrospectionEngine, SemanticManifestEvidenceProvider, ContentSemanticEvidenceProvider } from '../../content/content-introspection';
import { StaticJvmSemanticEvidenceProvider } from '../../content/jvm-semantic-evidence';
import { resolveResourceLocation } from '../../content/resource-location';
import { stateDefinitionsFromBlockstate } from '../../content/normalized-predicate';

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
  readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];

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
  iconUrl(): string | undefined {
    const icon = this.normalizedMetadata.icon; if (!icon) return undefined;
    const bytes = this.binary.get(icon); if (!bytes) return undefined;
    const existing = this.objectUrls.get(icon); if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); this.objectUrls.set(icon, url); return url;
  }

  catalog(): BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] } {
    const records: AssetBlockRecord[] = [];
    const blockstatePaths = Object.keys(this.json).filter((value) => /^assets\/[^/]+\/blockstates\/.*\.json$/.test(value)).sort();
    const itemEvidence = externalItemEvidence(this.json);
    const tagIndex = TagIndex.fromProvider(this);
    const introspection = new ContentIntrospectionEngine(this, this.semanticEvidenceProviders);
    const blockIds = new Set(blockstatePaths.map((path) => { const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path)!; return `${match[1]}:${match[2]}`; }));
    for (const path of blockstatePaths) {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path); if (!match) continue;
      const namespace = match[1]; const blockPath = match[2]; const id = `${namespace}:${blockPath}`;
      const blockstate = this.json[path]; const definitions = stateDefinitionsFromBlockstate(blockstate); const language = this.languageFor(namespace);
      const trustedFamilies = trustedFamiliesFor(id, tagIndex);
      const signVisual = externalSignVisual(id, trustedFamilies, this.paths());
      const signCapabilities = signVisual ? [{ kind: 'block-entity' as const, entityKind: 'sign' as const, evidence: 'verified' as const }, { kind: 'special-renderer' as const, evidence: 'verified' as const }] : [];
      const initial: AssetBlockRecord = { id, displayName: typeof language[`block.${namespace}.${blockPath.replaceAll('/', '.')}`] === 'string' ? language[`block.${namespace}.${blockPath.replaceAll('/', '.')}`] as string : humanize(blockPath), defaultState: {}, stateDefinitions: definitions, resources: { blockstate: path, model: configuredModelIds(blockstate)[0], textures: [] }, support: 'partial', visualSupport: 'partial', behaviorSupport: 'unknown', defaultStateSource: 'unknown', visualClassification: signVisual ? 'special-renderer-required' : 'standard-json', visualClassificationEvidence: 'inferred', sourceId: this.source.id, sourceName: this.source.displayName, modName: this.source.displayName, trustedBehaviorFamilies: trustedFamilies, capabilities: signCapabilities, specialVisual: signVisual, semanticEvidence: trustedFamilies.map((contractId) => ({ contractId, provenance: 'trusted-data' as const, strength: 'partial' as const, supportingTags: trustedTagIdsFor(id, tagIndex), supportingProperties: [], supportingResources: [] })), behaviorEvidenceRequired: true };
      const evaluation = evaluateCommonBehavior(initial, this); const withState: AssetBlockRecord = { ...initial, defaultState: evaluation.defaultState, stateDefinitions: evaluation.stateDefinitions, defaultStateSource: evaluation.defaultStateSource, ...(evaluation.behavior ? { behavior: evaluation.behavior, behaviorSupport: 'partial' as const } : {}) };
      const matchingItem = itemEvidence.find((entry) => entry.itemId === id);
      const descriptor = introspection.inspectBlock(withState);
      records.push({ ...withState, defaultState: { ...withState.defaultState, ...descriptor.placementDefault }, stateDefinitions: [...descriptor.properties].map((property) => ({ name: property.name, values: property.values, ...(property.derived ? { derived: true } : {}) })), capabilities: descriptor.capabilityProfile ?? initial.capabilities, supportRequirements: descriptor.supportRequirements, supportContracts: descriptor.supportContracts, specialVisual: descriptor.specialVisual ?? signVisual, itemHostVisual: descriptor.itemHostVisual, semanticEvidence: descriptor.semanticEvidence, itemEvidence: matchingItem ? { itemId: id, placeable: true, sourceFormat: matchingItem.sourceFormat, referencedModels: matchingItem.referencedModels, referencedResources: matchingItem.referencedResources } : undefined, contentDescriptor: descriptor });
    }
    const targetItems: CatalogItemEvidence[] = itemEvidence.map((entry) => ({ ...entry, explicitBlockPlacement: blockIds.has(entry.itemId) ? { blockId: entry.itemId } : undefined, sourceId: this.source.id, sourceName: this.source.displayName }));
    return { minecraftVersion: this.source.minecraftVersion, sourceId: this.source.id, sourceName: this.source.displayName, blocks: addVerifiedSignPlacementVariants(records), targetItems, itemEvidenceAvailable: true, paintingVariants: discoverPaintingVariants(this.json, this.source.id, this.source.displayName, tagIndex) };
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
function trustedFamiliesFor(id: string, tags: TagIndex): readonly string[] { const families = new Set<string>(); for (const contribution of tags.contributions('block')) if (tags.hasMember('block', contribution.id, id)) { const path = contribution.path; if (/(?:^|[_/])fences?(?:\.json)?$/.test(path)) families.add('fence'); if (/(?:^|[_/])walls?(?:\.json)?$/.test(path)) families.add('wall'); if (/(?:^|[_/])stairs?(?:\.json)?$/.test(path)) families.add('stairs'); if (/(?:^|[_/])doors?(?:\.json)?$/.test(path)) families.add('doors'); if (/(?:^|[_/])beds?(?:\.json)?$/.test(path)) families.add('beds'); if (/(?:^|[_/])tall_flowers?(?:\.json)?$/.test(path)) families.add('double-height'); if (contribution.id === 'minecraft:standing_signs') families.add('standing-sign'); if (contribution.id === 'minecraft:wall_signs') families.add('wall-sign'); if (contribution.id === 'minecraft:ceiling_hanging_signs') families.add('hanging-sign'); if (contribution.id === 'minecraft:wall_hanging_signs') families.add('wall-hanging-sign'); } return [...families].sort(); }

function externalSignVisual(id: string, families: readonly string[], paths: readonly string[]): import('../../content/content-introspection').ContentSpecialVisualDescriptor | undefined {
  const family = families.find((value) => value === 'standing-sign' || value === 'wall-sign' || value === 'hanging-sign' || value === 'wall-hanging-sign');
  if (!family) return undefined;
  const variant = family === 'standing-sign' ? 'standing' : family === 'wall-sign' ? 'wall' : family === 'hanging-sign' ? 'hanging' : 'wall-hanging';
  const name = id.split(':')[1] ?? '';
  const material = name.replace(/_(?:wall_)?hanging_sign$/, '').replace(/_wall_sign$/, '').replace(/_sign$/, '');
  const candidates = paths.filter((path) => /^assets\/[^/]+\/textures\/entity\/signs\/(?:hanging\/)?[^/]+\.png$/.test(path)).filter((path) => {
    const match = /^assets\/([^/]+)\/textures\/entity\/signs\/(hanging\/)?([^/]+)\.png$/.exec(path); if (!match) return false;
    return match[3] === material && (variant === 'hanging' || variant === 'wall-hanging') === !!match[2];
  });
  if (candidates.length !== 1) return undefined;
  const match = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(candidates[0]); if (!match) return undefined;
  return { contractId: 'common-sign', variant, resources: { default: `${match[1]}:${match[2]}` }, stateDependencies: variant === 'standing' || variant === 'hanging' ? ['rotation'] : ['facing'], provenance: 'trusted-data' };
}
function addVerifiedSignPlacementVariants(records: readonly AssetBlockRecord[]): readonly AssetBlockRecord[] {
  const groups = new Map<string, { standing?: string; wall?: string; hanging?: string; wallHanging?: string }>();
  for (const record of records) {
    const visual = record.specialVisual;
    if (visual?.contractId !== 'common-sign' || !visual.resources['default']) continue;
    const group = groups.get(visual.resources['default']) ?? {};
    if (visual.variant === 'standing') group.standing = record.id;
    if (visual.variant === 'wall') group.wall = record.id;
    if (visual.variant === 'hanging') group.hanging = record.id;
    if (visual.variant === 'wall-hanging') group.wallHanging = record.id;
    groups.set(visual.resources['default'], group);
  }
  const variantsById = new Map<string, { readonly standing?: string; readonly wall?: string; readonly hanging?: string; readonly wallHanging?: string }>();
  for (const group of groups.values()) {
    const variants = Object.fromEntries(Object.entries(group).filter(([, value]) => !!value));
    if (!(group.standing || group.hanging) || Object.keys(variants).length < 2) continue;
    for (const id of Object.values(group).filter((value): value is string => !!value)) variantsById.set(id, variants);
  }
  return records.map((record) => { const placementVariants = variantsById.get(record.id); return placementVariants ? { ...record, placementVariants } : record; });
}
function trustedTagIdsFor(id: string, tags: TagIndex): readonly string[] { return tags.contributions('block').filter((contribution) => tags.hasMember('block', contribution.id, id)).map((contribution) => contribution.id).sort(); }
function discoverPaintingVariants(json: Readonly<Record<string, unknown>>, sourceId = 'vanilla', sourceName = 'Vanilla', tags?: TagIndex): readonly PaintingVariant[] { const placeable = new Set<string>(); for (const [path, value] of Object.entries(json)) if (/^data\/[^/]+\/tags\/painting_variant\/placeable\.json$/.test(path)) { const entries = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)['values']) ? (value as Record<string, unknown>)['values'] as unknown[] : []; entries.forEach((entry) => { if (typeof entry === 'string' && !entry.startsWith('#')) placeable.add(resolveResourceLocation(entry) ?? entry); }); } return Object.entries(json).flatMap(([path, raw]) => { const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path); if (!match || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []; const value = raw as Record<string, unknown>; const width = Number(value['width']); const height = Number(value['height']); if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return []; const id = `${match[1]}:${match[2]}`; const assetPath = typeof value['asset_id'] === 'string' ? paintingTextureResource(value['asset_id'], match[1]) : paintingTextureResource(match[2], match[1]); const tagPlaceable = tags ? (tags.hasMember('painting_variant', 'minecraft:placeable', id) || tags.hasMember('painting_variant', `${match[1]}:placeable`, id)) : undefined; return [{ id, width, height, assetPath, placeable: tagPlaceable ?? (placeable.size ? placeable.has(id) : true), sourceId, sourceName }]; }); }
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

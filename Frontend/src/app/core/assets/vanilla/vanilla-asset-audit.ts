import * as THREE from 'three';
import { BehaviorSupportLevel, BlockDefinition, VisualSupportLevel } from '../../blocks/catalog/block-definition.types';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { BlockModelResolver, ResolverDiagnosticCode } from '../../blocks/resolver';
import { VanillaBlockVisualProvider } from '../../renderer/geometry/vanilla-block-visual-provider';
import { texturePath, VanillaAssetProvider } from './vanilla-asset-provider';
import { VanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import type { BlockCapabilityProfile } from '../../blocks/capabilities/block-capability.types';
import { auditContentDomains, type ContentDomainAudit } from './vanilla-content-domain-audit';

export type AssetAuditReason =
  | 'DEFAULT_STATE_UNKNOWN' | 'DEFAULT_STATE_INCOMPLETE' | 'DEFAULT_STATE_VARIANT_NO_MATCH'
  | 'BLOCKSTATE_NOT_FOUND' | 'BLOCKSTATE_PARSE_FAILED' | 'VARIANT_NO_MATCH' | 'MULTIPART_NO_MATCH' | 'UNSUPPORTED_BLOCKSTATE_CONDITION'
  | 'MODEL_NOT_FOUND' | 'PARENT_NOT_FOUND' | 'PARENT_CYCLE' | 'NO_ELEMENTS' | 'UNSUPPORTED_MODEL_FORMAT' | 'SPECIAL_RENDERER_REQUIRED' | 'INTENTIONALLY_INVISIBLE'
  | 'TEXTURE_NOT_FOUND' | 'TEXTURE_VARIABLE_UNRESOLVED' | 'TEXTURE_DECODE_FAILED'
  | 'GEOMETRY_BUILD_FAILED' | 'UNSUPPORTED_ELEMENT_ROTATION' | 'UNSUPPORTED_UV_CASE';

export interface VanillaAssetAuditRecord {
  readonly registryId: string;
  readonly family: string;
  readonly catalog: { readonly found: true; readonly displayName: string; readonly behaviorSupport: BehaviorSupportLevel; readonly capabilities: BlockCapabilityProfile };
  readonly defaultState: { readonly known: boolean; readonly source: string; readonly state: Readonly<Record<string, string>> };
  readonly blockstate: { readonly resource: string; readonly exists: boolean; readonly parsed: boolean; readonly kind: 'variants' | 'multipart' | 'both' | 'other'; readonly selectedConfigurationCount: number };
  readonly model: { readonly ids: readonly string[]; readonly parentResolved: boolean; readonly elementCount: number; readonly faceCount: number; readonly resources: readonly string[]; readonly parentResources: readonly string[] };
  readonly texture: { readonly referencedCount: number; readonly resolvedCount: number; readonly missingCount: number; readonly decodeSuccessCount: number; readonly decodeFailureCount: number };
  readonly geometry: { readonly buildSuccess: boolean; readonly geometryCount: number; readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } };
  readonly render: { readonly visualSupport: VisualSupportLevel; readonly classification: 'standard-json' | 'special-renderer-required' | 'intentionally-invisible'; readonly renderMode: 'real' | 'partial' | 'fallback'; readonly fallbackReason?: AssetAuditReason; readonly reasons: readonly AssetAuditReason[] };
  readonly thumbnail: 'real' | 'fallback' | 'unavailable';
}

export interface VanillaAssetCoverageReport {
  readonly schemaVersion: 1;
  readonly minecraftVersion: string;
  readonly sourceName: string;
  readonly generatedAt: string;
  readonly methodology: readonly string[];
  readonly summary: {
    readonly totalEntries: number;
    readonly visual: Readonly<Record<VisualSupportLevel, number>>;
    readonly behavior: Readonly<Record<BehaviorSupportLevel, number>>;
    readonly thumbnail: Readonly<Record<'real' | 'fallback' | 'unavailable', number>>;
    readonly defaultState: { readonly known: number; readonly unknown: number };
    readonly specialRendererRequired: number;
    readonly intentionallyInvisible: number;
    readonly failureReasons: Readonly<Record<string, number>>;
    readonly families: Readonly<Record<string, number>>;
    readonly contentDomain: ContentDomainAudit;
  };
  readonly records: readonly VanillaAssetAuditRecord[];
}

export interface VanillaAssetAuditOptions {
  readonly registry?: VanillaBlockRegistry;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number) => void;
  readonly decodeTexture?: (bytes: Uint8Array, path: string) => Promise<boolean>;
  readonly batchSize?: number;
}

export async function auditVanillaAssets(provider: VanillaAssetProvider, options: VanillaAssetAuditOptions = {}): Promise<VanillaAssetCoverageReport> {
  const catalog = new BlockCatalog(); catalog.load(provider.catalog(options.registry));
  const definitions = catalog.all();
  const resolver = new BlockModelResolver(provider);
  const visualProvider = new VanillaBlockVisualProvider(provider, async () => new THREE.Texture());
  const decodeCache = new Map<string, Promise<boolean>>();
  const records: VanillaAssetAuditRecord[] = [];
  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 16));
  for (let offset = 0; offset < definitions.length; offset += batchSize) {
    if (options.signal?.aborted) throw new DOMException('Vanilla asset audit was cancelled', 'AbortError');
    const batch = definitions.slice(offset, offset + batchSize);
    records.push(...await Promise.all(batch.map((definition) => auditDefinition(definition, provider, resolver, visualProvider, decodeCache, options.decodeTexture ?? decodePng))));
    options.onProgress?.(Math.min(offset + batch.length, definitions.length), definitions.length);
    await Promise.resolve();
  }
  visualProvider.dispose();
  return buildReport(provider, records);
}

async function auditDefinition(definition: BlockDefinition, provider: VanillaAssetProvider, resolver: BlockModelResolver, visualProvider: VanillaBlockVisualProvider, decodeCache: Map<string, Promise<boolean>>, decodeTexture: (bytes: Uint8Array, path: string) => Promise<boolean>): Promise<VanillaAssetAuditRecord> {
  const reasons = new Set<AssetAuditReason>();
  const blockstateResource = `assets/${definition.namespace}/blockstates/${definition.id.slice(definition.id.indexOf(':') + 1)}.json`;
  const blockstateDocument = provider.readJson(blockstateResource);
  const blockstateRecord = record(blockstateDocument);
  const kind = blockstateKind(blockstateRecord);
  if (!blockstateDocument) reasons.add('BLOCKSTATE_NOT_FOUND');
  if (definition.defaultStateSource === 'unknown') reasons.add('DEFAULT_STATE_UNKNOWN');
  const resolved = resolver.resolve(definition.id, definition.defaultState, definition.id);
  for (const diagnostic of resolved.diagnostics) { const reason = resolverReason(diagnostic.code); if (reason) reasons.add(reason); }
  if (resolved.diagnostics.some((item) => item.code === 'no-matching-variant')) {
    reasons.add('VARIANT_NO_MATCH');
    reasons.add(definition.defaultStateSource === 'unknown' ? 'DEFAULT_STATE_VARIANT_NO_MATCH' : 'DEFAULT_STATE_INCOMPLETE');
  }
  if ((kind === 'multipart' || kind === 'both') && !resolved.parts.length && !resolved.diagnostics.some((item) => item.code === 'no-matching-variant')) reasons.add('MULTIPART_NO_MATCH');
  if (!resolved.trace.elementCount) reasons.add('NO_ELEMENTS');
  const intentionallyInvisible = intentionallyInvisibleBlocks.has(definition.id);
  const specialRenderer = !intentionallyInvisible && (hasSpecialModel(resolved.trace.modelResources, provider) || !!blockstateDocument && resolved.parts.length > 0 && resolved.trace.elementCount === 0);
  if (intentionallyInvisible) reasons.add('INTENTIONALLY_INVISIBLE');
  else if (specialRenderer) reasons.add('SPECIAL_RENDERER_REQUIRED');

  const textureResources = resolved.trace.textureResources;
  const texturePaths = textureResources.map(texturePath);
  const textureResults = await Promise.all(texturePaths.map(async (path) => {
    const bytes = provider.readBinary(path);
    if (!bytes) { reasons.add('TEXTURE_NOT_FOUND'); return { found: false, decoded: false }; }
    let decoding = decodeCache.get(path); if (!decoding) { decoding = decodeTexture(bytes, path); decodeCache.set(path, decoding); }
    const decoded = await decoding; if (!decoded) reasons.add('TEXTURE_DECODE_FAILED');
    return { found: true, decoded };
  }));

  const [namespace] = definition.id.split(':');
  const visual = await visualProvider.create({ kind: 'resolved', id: definition.id, namespace, position: { x: 0, y: 0, z: 0 }, state: definition.defaultState });
  if (!visual.trace.geometryBuilt && resolved.trace.elementCount > 0 || visual.diagnostics.some((item) => item.code === 'GEOMETRY_BUILD_FAILED')) reasons.add('GEOMETRY_BUILD_FAILED');
  const visualSupport = classifyVisualSupport({ renderMode: visual.mode, defaultKnown: definition.defaultStateSource !== 'unknown', specialModel: specialRenderer || intentionallyInvisible, texturesDecoded: textureResults.every((item) => item.decoded), geometryBuilt: visual.trace.geometryBuilt });
  const thumbnail = visualProvider.thumbnailUrl(definition.id, definition.defaultState) ? 'real' : visual.object ? 'fallback' : 'unavailable';
  if (visual.object) disposeObject(visual.object);
  return {
    registryId: definition.id,
    family: reportFamily(definition.id),
    catalog: { found: true, displayName: definition.displayName, behaviorSupport: definition.behaviorSupport, capabilities: definition.capabilities ?? [] },
    defaultState: { known: definition.defaultStateSource !== 'unknown', source: definition.defaultStateSource, state: { ...definition.defaultState } },
    blockstate: { resource: blockstateResource, exists: !!blockstateDocument, parsed: !!blockstateDocument, kind, selectedConfigurationCount: resolved.parts.length },
    model: { ids: resolved.trace.selectedModelIds, parentResolved: !resolved.diagnostics.some((item) => item.code === 'missing-parent' || item.code === 'parent-cycle'), elementCount: resolved.trace.elementCount, faceCount: resolved.trace.faceCount, resources: resolved.trace.modelResources, parentResources: resolved.trace.parentResources },
    texture: { referencedCount: texturePaths.length, resolvedCount: textureResults.filter((item) => item.found).length, missingCount: textureResults.filter((item) => !item.found).length, decodeSuccessCount: textureResults.filter((item) => item.decoded).length, decodeFailureCount: textureResults.filter((item) => item.found && !item.decoded).length },
    geometry: { buildSuccess: visual.trace.geometryBuilt, geometryCount: resolved.trace.faceCount, bounds: visual.trace.bounds },
    render: { visualSupport, classification: intentionallyInvisible ? 'intentionally-invisible' : specialRenderer ? 'special-renderer-required' : 'standard-json', renderMode: visual.mode, fallbackReason: visualSupport === 'fallback' ? [...reasons][0] : undefined, reasons: [...reasons].sort() },
    thumbnail,
  };
}

export function classifyVisualSupport(input: { readonly renderMode: 'real' | 'partial' | 'fallback'; readonly defaultKnown: boolean; readonly specialModel: boolean; readonly texturesDecoded: boolean; readonly geometryBuilt: boolean }): VisualSupportLevel {
  if (input.renderMode === 'fallback' || !input.geometryBuilt) return 'fallback';
  return input.renderMode === 'partial' || !input.defaultKnown || input.specialModel || !input.texturesDecoded ? 'partial' : 'real';
}

function buildReport(provider: VanillaAssetProvider, records: readonly VanillaAssetAuditRecord[]): VanillaAssetCoverageReport {
  const minecraftVersion = provider.minecraftVersion;
  const sourceName = provider.sourceName;
  const count = <T extends string>(values: readonly T[], choices: readonly T[]): Record<T, number> => Object.fromEntries(choices.map((choice) => [choice, values.filter((value) => value === choice).length])) as Record<T, number>;
  const reasons: Record<string, number> = {}; const families: Record<string, number> = {};
  for (const item of records) { families[item.family] = (families[item.family] ?? 0) + 1; for (const reason of item.render.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1; }
  return {
    schemaVersion: 1, minecraftVersion, sourceName, generatedAt: new Date().toISOString(),
    methodology: [`Catalog entries and default states come from the selected Minecraft ${minecraftVersion} asset source.`, 'Display names come from the active en_us language resource; visual resources and behavior metadata remain independent.', 'Geometry is built headlessly through the production resolver/geometry provider without a viewport.', 'PNG decode uses createImageBitmap when available and a strict PNG container check in headless tooling.'],
    summary: { totalEntries: records.length, visual: count(records.map((item) => item.render.visualSupport), ['real', 'partial', 'fallback']), behavior: count(records.map((item) => item.catalog.behaviorSupport), ['full', 'partial', 'unknown']), thumbnail: count(records.map((item) => item.thumbnail), ['real', 'fallback', 'unavailable']), defaultState: { known: records.filter((item) => item.defaultState.known).length, unknown: records.filter((item) => !item.defaultState.known).length }, specialRendererRequired: records.filter((item) => item.render.classification === 'special-renderer-required').length, intentionallyInvisible: records.filter((item) => item.render.classification === 'intentionally-invisible').length, failureReasons: sortCounts(reasons), families: sortCounts(families), contentDomain: auditContentDomains(provider) },
    records,
  };
}

function blockstateKind(value: Record<string, unknown>): 'variants' | 'multipart' | 'both' | 'other' { const variants = typeof value['variants'] === 'object' && value['variants'] !== null; const multipart = Array.isArray(value['multipart']); return variants && multipart ? 'both' : variants ? 'variants' : multipart ? 'multipart' : 'other'; }
function resolverReason(code: ResolverDiagnosticCode): AssetAuditReason | undefined { return ({ 'missing-blockstate': 'BLOCKSTATE_NOT_FOUND', 'malformed-blockstate': 'BLOCKSTATE_PARSE_FAILED', 'no-matching-variant': 'VARIANT_NO_MATCH', 'missing-model': 'MODEL_NOT_FOUND', 'malformed-model': 'UNSUPPORTED_MODEL_FORMAT', 'missing-parent': 'PARENT_NOT_FOUND', 'parent-cycle': 'PARENT_CYCLE', 'missing-texture': 'TEXTURE_VARIABLE_UNRESOLVED', 'texture-cycle': 'TEXTURE_VARIABLE_UNRESOLVED', 'unsupported-model-behavior': 'UNSUPPORTED_MODEL_FORMAT' } as const)[code]; }
function hasSpecialModel(resources: readonly string[], provider: VanillaAssetProvider): boolean { return resources.some((path) => { const model = record(provider.readJson(path)); const parent = model['parent']; const particleOnly = parent === undefined && model['elements'] === undefined && Object.keys(record(model['textures'])).length > 0; return particleOnly || typeof parent === 'string' && (parent.includes('builtin/') || parent === 'item/generated' || parent === 'item/handheld'); }); }
const intentionallyInvisibleBlocks = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void', 'minecraft:light']);
async function decodePng(bytes: Uint8Array): Promise<boolean> { if (typeof createImageBitmap === 'function') { try { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' })); bitmap.close(); return true; } catch { return false; } } return validPngContainer(bytes); }
function validPngContainer(bytes: Uint8Array): boolean { if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return false; let offset = 8; let ihdr = false; let iend = false; while (offset + 12 <= bytes.length) { const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]; if (length < 0 || offset + 12 + length > bytes.length) return false; const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8)); if (type === 'IHDR') ihdr = length === 13; if (type === 'IEND') { iend = length === 0; break; } offset += 12 + length; } return ihdr && iend; }
function reportFamily(id: string): string { const name = id.slice(id.indexOf(':') + 1); const groups: readonly [RegExp, string][] = [[/_slab$/, 'slabs'], [/_stairs$/, 'stairs'], [/_door$/, 'doors'], [/_trapdoor$/, 'trapdoors'], [/_bed$/, 'beds'], [/(sapling|flower|tulip|orchid|dandelion|sunflower|rose|mushroom|bush|fern|grass)$/, 'plants'], [/_torch$/, 'torches'], [/_wall$/, 'walls'], [/_fence$/, 'fences'], [/(pane|iron_bars)$/, 'panes-bars'], [/_rail$/, 'rails'], [/(redstone|repeater|comparator|observer|piston)/, 'redstone-like'], [/(crop|wheat|carrots|potatoes|beetroots|stem)$/, 'crops'], [/(water|lava)$/, 'fluids'], [/(head|skull)$/, 'heads-skulls'], [/(banner|sign)$/, 'banners-signs'], [/(chest|barrel|shulker_box)$/, 'containers']]; return groups.find(([pattern]) => pattern.test(name))?.[1] ?? 'other'; }
function sortCounts(values: Record<string, number>): Record<string, number> { return Object.fromEntries(Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))); }
function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function disposeObject(object: THREE.Object3D): void { object.traverse((child) => { if (!(child instanceof THREE.Mesh)) return; if (!child.geometry.userData['providerOwnedGeometry']) child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { if (material.map?.userData['ownedBedAtlasTexture']) material.map.dispose(); material.dispose(); } }); }

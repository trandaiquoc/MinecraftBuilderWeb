import { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';
import { AssetBlockRecord, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { AssetResourceProvider, BlockModelResolver } from '../../blocks/resolver';
import { AUTHORITATIVE_DEFAULT_STATE_SOURCE, VanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import { VanillaBehaviorRegistry } from '../../block-behavior/vanilla/vanilla-behavior-registry';
import { ZipArchive } from '../archive/zip-archive';
import { ContentSourceProvider } from '../content-source/content-source.types';
import { VanillaResourceFormatProfile } from './vanilla-resource-format';
import { selectVanillaResourceFormatAdapter } from './format/resource-format-adapter';
import { evaluateCommonBehavior } from '../../block-behavior/compatibility/common-behavior';

export const VANILLA_ASSET_VERSION = '1.21.1';
export const VANILLA_ASSET_CACHE_SCHEMA_VERSION = 2;
const RESOURCE_PATH = /^assets\/[^/]+\/(?:blockstates\/.*\.json|models\/.*\.json|textures\/.*\.(?:png|png\.mcmeta)|lang\/[^/]+\.json)$/;
const BLOCK_TAG_PATH = /^data\/[^/]+\/tags\/block\/.*\.json$/;
const DECORATION_DATA_PATH = /^data\/[^/]+\/(?:painting_variant\/.*\.json|tags\/painting_variant\/.*\.json)$/;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;

export interface SerializedVanillaAssets {
  readonly schemaVersion: 2;
  readonly minecraftVersion: string;
  readonly sourceName: string;
  readonly json: Readonly<Record<string, unknown>>;
  readonly binary: readonly { readonly path: string; readonly data: ArrayBuffer }[];
}

export interface VanillaAssetProviderDiagnostics {
  readonly resourceCount: number;
  readonly stoneBlockstate: boolean;
  readonly stoneModel: boolean;
  readonly stoneTexture: boolean;
  readonly language: boolean;
  readonly resourceFormat: VanillaResourceFormatProfile;
}

export class VanillaAssetProvider implements ContentSourceProvider {
  private readonly objectUrls = new Map<string, string>();
  readonly gameEdition = 'java' as const;
  readonly gameVersion: string;
  readonly source;

  constructor(sourceName: string, json: Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>);
  constructor(sourceName: string, minecraftVersion: string, json: Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>);
  constructor(sourceName: string, versionOrJson: string | Readonly<Record<string, unknown>>, jsonOrBinary: Readonly<Record<string, unknown>> | ReadonlyMap<string, Uint8Array>, maybeBinary?: ReadonlyMap<string, Uint8Array>) {
    this.sourceName = sourceName;
    this.minecraftVersion = typeof versionOrJson === 'string' ? versionOrJson : VANILLA_ASSET_VERSION;
    this.json = (typeof versionOrJson === 'string' ? jsonOrBinary : versionOrJson) as Readonly<Record<string, unknown>>;
    this.binary = (typeof versionOrJson === 'string' ? maybeBinary : jsonOrBinary) as ReadonlyMap<string, Uint8Array>;
    this.gameVersion = this.minecraftVersion;
    this.source = { id: 'vanilla', kind: 'vanilla' as const, displayName: 'Vanilla', minecraftVersion: this.minecraftVersion, sourceVersion: this.minecraftVersion, namespaces: ['minecraft'] as const, decorationSupport: true };
  }
  readonly sourceName: string;
  readonly minecraftVersion: string;
  private readonly json: Readonly<Record<string, unknown>>;
  private readonly binary: ReadonlyMap<string, Uint8Array>;

  static async fromJar(file: Blob, minecraftVersion = VANILLA_ASSET_VERSION, sourceName = 'Imported Minecraft assets'): Promise<VanillaAssetProvider> {
    const archive = await ZipArchive.open(file);
    const entries = archive.entries.filter((entry) => RESOURCE_PATH.test(entry.name) || BLOCK_TAG_PATH.test(entry.name) || DECORATION_DATA_PATH.test(entry.name));
    const totalSize = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (!entries.length) throw new Error('The selected archive contains no Minecraft asset resources');
    if (totalSize > MAX_CACHE_BYTES) throw new Error('The selected Minecraft asset set is too large');
    const json: Record<string, unknown> = {};
    const binary = new Map<string, Uint8Array>();
    for (let offset = 0; offset < entries.length; offset += 32) {
      const batch = entries.slice(offset, offset + 32);
      const decoded = await Promise.all(batch.map(async (entry) => ({ entry, bytes: await entry.read() })));
      for (const { entry, bytes } of decoded) {
        if (entry.name.endsWith('.json') || entry.name.endsWith('.png.mcmeta')) {
          try { json[entry.name] = JSON.parse(new TextDecoder().decode(bytes)); }
          catch { throw new Error(`Invalid JSON resource: ${entry.name}`); }
        } else binary.set(entry.name, bytes);
      }
    }
    return new VanillaAssetProvider(sourceName, minecraftVersion, json, binary);
  }

  static deserialize(bundle: SerializedVanillaAssets): VanillaAssetProvider {
    if (bundle.schemaVersion !== VANILLA_ASSET_CACHE_SCHEMA_VERSION) throw new Error('Vanilla asset cache is outdated. Import the selected Minecraft JAR again.');
    return new VanillaAssetProvider(bundle.sourceName, bundle.minecraftVersion, bundle.json, new Map(bundle.binary.map((entry) => [entry.path, new Uint8Array(entry.data)])));
  }

  serialize(): SerializedVanillaAssets {
    return { schemaVersion: VANILLA_ASSET_CACHE_SCHEMA_VERSION, minecraftVersion: this.minecraftVersion, sourceName: this.sourceName, json: this.json, binary: [...this.binary].map(([path, data]) => ({ path, data: data.slice().buffer })) };
  }

  readJson(path: string): unknown | undefined { return this.json[path]; }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  paths(): readonly string[] { return [...Object.keys(this.json), ...this.binary.keys()]; }

  diagnostics(): VanillaAssetProviderDiagnostics {
    const resourceFormat = selectVanillaResourceFormatAdapter(this.json, this.binary, this.minecraftVersion === VANILLA_ASSET_VERSION).profile;
    return {
      resourceCount: Object.keys(this.json).length + this.binary.size,
      stoneBlockstate: !!this.json['assets/minecraft/blockstates/stone.json'],
      stoneModel: !!this.json['assets/minecraft/models/block/stone.json'],
      stoneTexture: this.binary.has('assets/minecraft/textures/block/stone.png'),
      language: Object.keys(this.json).some((path) => /^assets\/[^/]+\/lang\/[^/]+\.json$/.test(path)),
      resourceFormat,
    };
  }

  assertUsable(): void {
    const state = this.diagnostics();
    if (state.resourceFormat.support === 'unsupported-resource-format') throw new Error(`Official assets for Minecraft ${this.minecraftVersion} were downloaded, but their resource format is not supported yet.`);
    if (this.minecraftVersion === VANILLA_ASSET_VERSION && (!state.language || !state.stoneBlockstate || !state.stoneModel || !state.stoneTexture)) throw new Error(`Cached vanilla assets for Minecraft ${this.minecraftVersion} are incomplete. Import the selected JAR again.`);
  }

  textureUrl(resource: string): string | undefined {
    const path = texturePath(resource);
    const bytes = this.binary.get(path);
    if (!bytes) return undefined;
    const cached = this.objectUrls.get(path);
    if (cached) return cached;
    const data = new Uint8Array(bytes).buffer;
    const url = URL.createObjectURL(new Blob([data], { type: 'image/png' }));
    this.objectUrls.set(path, url);
    return url;
  }

  dispose(): void { for (const url of this.objectUrls.values()) URL.revokeObjectURL(url); this.objectUrls.clear(); }

  catalog(registry?: VanillaBlockRegistry): BlockCatalogSource {
    const format = selectVanillaResourceFormatAdapter(this.json, this.binary, this.minecraftVersion === VANILLA_ASSET_VERSION);
    const language = record(this.json['assets/minecraft/lang/en_us.json'] ?? this.json[format.languagePath(this.json) ?? '']);
    const verified = new Map<string, typeof representativeBlockFixture.blocks[number]>(this.minecraftVersion === VANILLA_ASSET_VERSION ? representativeBlockFixture.blocks.map((entry) => [entry.id, entry]) : []);
    const behaviorRegistry = this.minecraftVersion === VANILLA_ASSET_VERSION ? new VanillaBehaviorRegistry(this) : undefined;
    const resolver = new BlockModelResolver(this);
    const resources = registry ? registry.all().map((entry) => ({ id: entry.id, registry: entry })) : format.blockstatePaths(this.json).map((path) => {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path)!; return { id: `${match[1]}:${match[2]}`, registry: undefined };
    });
    const blocks = resources.map(({ id, registry: registryEntry }): AssetBlockRecord => {
      const [namespace, name] = id.split(':', 2);
      const path = `assets/${namespace}/blockstates/${name}.json`;
      const known = verified.get(id);
      const blockstate = this.json[path];
      const models = configuredModelIds(blockstate);
      const generated: AssetBlockRecord = {
        id,
        displayName: typeof language[`block.${namespace}.${name.replaceAll('/', '.')}`] === 'string' ? language[`block.${namespace}.${name.replaceAll('/', '.')}`] as string : humanize(name),
        defaultState: registryEntry?.defaultState ?? known?.defaultState ?? {},
        stateDefinitions: registryEntry?.properties ?? known?.stateDefinitions ?? inferStateDefinitions(blockstate),
        resources: { blockstate: path, model: models[0], textures: [] },
        support: 'partial',
        visualSupport: 'partial',
        behaviorSupport: 'unknown', defaultStateSource: registryEntry ? AUTHORITATIVE_DEFAULT_STATE_SOURCE : known ? 'verified-fixture' : 'unknown',
        capabilities: known?.capabilities,
      };
      const enriched = behaviorRegistry?.enrich(generated) ?? applyCommonBehavior(generated, evaluateCommonBehavior(generated, this));
      const resolved = resolver.resolve(id, enriched.defaultState, 'catalog');
      const texturesAvailable = resolved.trace.textureResources.every((resource) => this.binary.has(texturePath(resource)));
      const fluid = id === 'minecraft:water' || id === 'minecraft:lava';
      const visualSupport = fluid ? 'partial' : resolved.parts.length ? resolved.support === 'full' && texturesAvailable ? 'real' : 'partial' : known ? 'fallback' : 'partial';
      const intentionallyInvisible = intentionallyInvisibleBlocks.has(id) || known?.capabilities?.some((capability) => capability.kind === 'intentionally-invisible') === true;
      const specialRenderer = !intentionallyInvisible && (fluid || known?.capabilities?.some((capability) => capability.kind === 'special-renderer') === true || resolved.parts.length > 0 && resolved.trace.elementCount === 0);
      const visualClassification = intentionallyInvisible ? 'intentionally-invisible' : specialRenderer ? 'special-renderer-required' : 'standard-json';
      return { ...enriched, support: visualSupport === 'real' ? 'full' : visualSupport, visualSupport, visualClassification, visualClassificationEvidence: specialRenderer || intentionallyInvisible ? 'verified' : 'inferred' };
    });
    return { minecraftVersion: this.minecraftVersion, sourceId: this.source.id, sourceName: this.source.displayName, blocks: blocks.map((block) => ({ ...block, sourceId: this.source.id, sourceName: this.source.displayName })) };
  }
}

function applyCommonBehavior(record: AssetBlockRecord, evaluation: ReturnType<typeof evaluateCommonBehavior>): AssetBlockRecord {
  return {
    ...record,
    defaultState: evaluation.defaultState,
    stateDefinitions: evaluation.stateDefinitions,
    ...(evaluation.behavior ? { behavior: evaluation.behavior, behaviorSupport: 'partial' as const } : {}),
    defaultStateSource: evaluation.defaultStateSource,
  };
}

export function texturePath(resource: string): string {
  const [namespace, path] = resource.includes(':') ? resource.split(':', 2) : ['minecraft', resource];
  return `assets/${namespace}/textures/${path}.png`;
}

function configuredModelIds(value: unknown): string[] {
  const result = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const entry of item) visit(entry); return; }
    const object = record(item); if (typeof object['model'] === 'string') result.add(object['model'] as string);
    for (const child of Object.values(object)) if (typeof child === 'object' && child !== null) visit(child);
  };
  visit(value); return [...result];
}

function inferStateDefinitions(value: unknown): readonly BlockStateDefinition[] {
  const values = new Map<string, Set<string>>();
  const addExpression = (expression: string): void => { for (const item of expression.split(',')) { const [name, raw] = item.split('='); if (!name || raw === undefined) continue; const options = values.get(name) ?? new Set<string>(); for (const option of raw.split('|')) options.add(option); values.set(name, options); } };
  const document = record(value); const variants = record(document['variants']); for (const key of Object.keys(variants)) addExpression(key);
  const visitCondition = (condition: unknown): void => { const object = record(condition); for (const [name, raw] of Object.entries(object)) { if (name === 'OR' || name === 'AND') { if (Array.isArray(raw)) for (const child of raw) visitCondition(child); } else if (typeof raw === 'string') addExpression(`${name}=${raw}`); } };
  if (Array.isArray(document['multipart'])) for (const part of document['multipart']) visitCondition(record(part)['when']);
  return [...values].map(([name, options]) => ({ name, values: [...options] }));
}

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function humanize(value: string): string { return value.split('/').at(-1)!.split('_').map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' '); }
const intentionallyInvisibleBlocks = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void', 'minecraft:light']);

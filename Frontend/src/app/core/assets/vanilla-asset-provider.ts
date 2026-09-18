import { BlockCatalogSource } from '../blocks/block-catalog';
import { representativeBlockFixture } from '../blocks/block-catalog.fixture';
import { AssetBlockRecord, BlockStateDefinition } from '../blocks/block-definition.types';
import { AssetResourceProvider, BlockModelResolver } from '../blocks/resolver';
import { AUTHORITATIVE_DEFAULT_STATE_SOURCE, VanillaBlockRegistry } from '../blocks/vanilla-block-registry';
import { VanillaBehaviorRegistry } from '../behavior/vanilla-behavior-registry';
import { ZipArchive } from './zip-archive';

export const VANILLA_ASSET_VERSION = '1.21.1';
export const VANILLA_ASSET_CACHE_SCHEMA_VERSION = 2;
const RESOURCE_PATH = /^assets\/[^/]+\/(?:blockstates\/.*\.json|models\/.*\.json|textures\/.*\.png|lang\/en_us\.json)$/;
const BLOCK_TAG_PATH = /^data\/[^/]+\/tags\/block\/.*\.json$/;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;

export interface SerializedVanillaAssets {
  readonly schemaVersion: 2;
  readonly minecraftVersion: '1.21.1';
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
}

export class VanillaAssetProvider implements AssetResourceProvider {
  private readonly objectUrls = new Map<string, string>();
  readonly gameEdition = 'java' as const;
  readonly gameVersion = VANILLA_ASSET_VERSION;

  constructor(
    readonly sourceName: string,
    private readonly json: Readonly<Record<string, unknown>>,
    private readonly binary: ReadonlyMap<string, Uint8Array>,
  ) {}

  static async fromJar(file: File): Promise<VanillaAssetProvider> {
    const archive = await ZipArchive.open(file);
    const entries = archive.entries.filter((entry) => RESOURCE_PATH.test(entry.name) || BLOCK_TAG_PATH.test(entry.name));
    const totalSize = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (!entries.length) throw new Error('The selected archive contains no Minecraft asset resources');
    if (totalSize > MAX_CACHE_BYTES) throw new Error('The selected Minecraft asset set is too large');
    const json: Record<string, unknown> = {};
    const binary = new Map<string, Uint8Array>();
    for (let offset = 0; offset < entries.length; offset += 32) {
      const batch = entries.slice(offset, offset + 32);
      const decoded = await Promise.all(batch.map(async (entry) => ({ entry, bytes: await entry.read() })));
      for (const { entry, bytes } of decoded) {
        if (entry.name.endsWith('.json')) {
          try { json[entry.name] = JSON.parse(new TextDecoder().decode(bytes)); }
          catch { throw new Error(`Invalid JSON resource: ${entry.name}`); }
        } else binary.set(entry.name, bytes);
      }
    }
    if (!json['assets/minecraft/lang/en_us.json']) throw new Error('Minecraft en_us language resource is missing');
    return new VanillaAssetProvider(file.name, json, binary);
  }

  static deserialize(bundle: SerializedVanillaAssets): VanillaAssetProvider {
    if (bundle.schemaVersion !== VANILLA_ASSET_CACHE_SCHEMA_VERSION) throw new Error('Vanilla asset cache is outdated. Import the Minecraft 1.21.1 JAR again.');
    if (bundle.minecraftVersion !== VANILLA_ASSET_VERSION) throw new Error(`Unsupported asset version: ${bundle.minecraftVersion}`);
    return new VanillaAssetProvider(bundle.sourceName, bundle.json, new Map(bundle.binary.map((entry) => [entry.path, new Uint8Array(entry.data)])));
  }

  serialize(): SerializedVanillaAssets {
    return { schemaVersion: VANILLA_ASSET_CACHE_SCHEMA_VERSION, minecraftVersion: VANILLA_ASSET_VERSION, sourceName: this.sourceName, json: this.json, binary: [...this.binary].map(([path, data]) => ({ path, data: data.slice().buffer })) };
  }

  readJson(path: string): unknown | undefined { return this.json[path]; }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  paths(): readonly string[] { return [...Object.keys(this.json), ...this.binary.keys()]; }

  diagnostics(): VanillaAssetProviderDiagnostics {
    return {
      resourceCount: Object.keys(this.json).length + this.binary.size,
      stoneBlockstate: !!this.json['assets/minecraft/blockstates/stone.json'],
      stoneModel: !!this.json['assets/minecraft/models/block/stone.json'],
      stoneTexture: this.binary.has('assets/minecraft/textures/block/stone.png'),
      language: !!this.json['assets/minecraft/lang/en_us.json'],
    };
  }

  assertUsable(): void {
    const state = this.diagnostics();
    if (!state.language || !state.stoneBlockstate || !state.stoneModel || !state.stoneTexture) throw new Error('Cached vanilla assets are incomplete. Import the Minecraft 1.21.1 JAR again.');
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
    const language = record(this.json['assets/minecraft/lang/en_us.json']);
    const verified = new Map(representativeBlockFixture.blocks.map((entry) => [entry.id, entry]));
    const behaviorRegistry = new VanillaBehaviorRegistry(this);
    const resolver = new BlockModelResolver(this);
    const resources = registry ? registry.all().map((entry) => ({ id: entry.id, registry: entry })) : Object.keys(this.json).filter((path) => /\/blockstates\/[^/]+\.json$/.test(path)).sort().map((path) => {
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
      };
      const enriched = behaviorRegistry.enrich(generated);
      const resolved = resolver.resolve(id, enriched.defaultState, 'catalog');
      const texturesAvailable = resolved.trace.textureResources.every((resource) => this.binary.has(texturePath(resource)));
      const visualSupport = id === 'minecraft:water' ? 'fallback' : resolved.parts.length ? resolved.support === 'full' && texturesAvailable ? 'real' : 'partial' : known ? 'fallback' : 'partial';
      const intentionallyInvisible = intentionallyInvisibleBlocks.has(id);
      const specialRenderer = !intentionallyInvisible && resolved.parts.length > 0 && resolved.trace.elementCount === 0;
      const visualClassification = intentionallyInvisible ? 'intentionally-invisible' : specialRenderer ? 'special-renderer-required' : 'standard-json';
      return { ...enriched, support: visualSupport === 'real' ? 'full' : visualSupport, visualSupport, visualClassification };
    });
    return { minecraftVersion: VANILLA_ASSET_VERSION, blocks };
  }
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

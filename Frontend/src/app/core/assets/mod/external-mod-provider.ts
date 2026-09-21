import type { AssetBlockRecord, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import { CONTENT_SOURCE_MINECRAFT_VERSION } from '../content-source/content-source.types';
import { texturePath } from '../vanilla/vanilla-asset-provider';

export const EXTERNAL_MOD_CACHE_SCHEMA_VERSION = 1 as const;
export type SupportedModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'unknown';

export interface FabricModMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly minecraftCompatibility?: string;
}

export interface ModImportDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface ModImportReport {
  readonly metadataFormat: SupportedModLoader;
  readonly metadata?: FabricModMetadata;
  readonly namespaces: readonly string[];
  readonly retainedResourceCount: number;
  readonly candidateBlockCount: number;
  readonly diagnostics: readonly ModImportDiagnostic[];
}

export interface SerializedExternalMod {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly metadata: FabricModMetadata;
  readonly minecraftVersion: string;
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
}

export class ExternalModProvider implements ContentSourceProvider {
  readonly source;
  readonly gameEdition = 'java' as const;
  readonly gameVersion: string;
  readonly metadata: FabricModMetadata;
  readonly report: ModImportReport;
  private readonly objectUrls = new Map<string, string>();

  private constructor(
    metadata: FabricModMetadata,
    private readonly json: Readonly<Record<string, unknown>>,
    private readonly binary: ReadonlyMap<string, Uint8Array>,
    namespaces: readonly string[],
    minecraftVersion: string,
    diagnostics: readonly ModImportDiagnostic[] = [],
  ) {
    this.metadata = metadata;
    this.gameVersion = minecraftVersion;
    this.source = { id: `mod:${metadata.id}`, kind: 'external' as const, displayName: metadata.displayName, minecraftVersion, sourceVersion: metadata.version, namespaces: [...namespaces] };
    const candidateBlockCount = namespaces.reduce((count, namespace) => count + Object.keys(json).filter((path) => path.startsWith(`assets/${namespace}/blockstates/`) && path.endsWith('.json')).length, 0);
    this.report = { metadataFormat: 'fabric', metadata, namespaces: [...namespaces], retainedResourceCount: Object.keys(json).length + binary.size, candidateBlockCount, diagnostics: [...diagnostics] };
  }

  static create(input: ExternalModResourceInput): ExternalModProvider {
    const metadata = parseFabricModMetadata(input.metadata);
    const namespaces = discoverNamespaces(input.json, input.resources);
    if (!namespaces.length) throw new Error('The Fabric mod contains no supported assets namespaces');
    const diagnostics = [...(input.diagnostics ?? [])];
    const compatibility = assessFabricCompatibility(metadata.minecraftCompatibility, input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION);
    if (compatibility === 'incompatible') throw new Error(`Fabric mod ${metadata.id} is not compatible with Minecraft ${input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION}.`);
    if (compatibility === 'unknown') diagnostics.push({ severity: 'warning', code: 'minecraft-version-unknown', message: 'Minecraft compatibility could not be verified for the selected project version.' });
    for (const [path, value] of input.json) {
      if (!path.includes('/models/') || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (typeof (value as Record<string, unknown>)['loader'] === 'string') diagnostics.push({ severity: 'warning', code: 'custom-model-loader', message: 'Custom model loader was retained but is not executed.', path });
    }
    return new ExternalModProvider(metadata, Object.fromEntries(input.json), input.resources, namespaces, input.minecraftVersion ?? CONTENT_SOURCE_MINECRAFT_VERSION, diagnostics);
  }

  static deserialize(value: SerializedExternalMod): ExternalModProvider {
    if (value.schemaVersion !== EXTERNAL_MOD_CACHE_SCHEMA_VERSION || typeof value.minecraftVersion !== 'string') throw new Error('Imported mod cache is outdated or incompatible');
    const metadata = parseFabricModMetadata(value.metadata);
    if (!Array.isArray(value.namespaces) || !value.namespaces.every((namespace) => typeof namespace === 'string') || !value.json || typeof value.json !== 'object' || !Array.isArray(value.binary)) throw new Error('Imported mod cache is malformed');
    return new ExternalModProvider(metadata, value.json, new Map(value.binary.map((entry) => [entry.path, new Uint8Array(entry.data)])), value.namespaces, value.minecraftVersion, Array.isArray(value.report?.diagnostics) ? value.report.diagnostics : []);
  }

  serialize(): SerializedExternalMod {
    return { schemaVersion: EXTERNAL_MOD_CACHE_SCHEMA_VERSION, sourceId: this.source.id, metadata: this.metadata, minecraftVersion: this.source.minecraftVersion, namespaces: this.source.namespaces, json: this.json, binary: [...this.binary].map(([path, data]) => ({ path, data: data.slice().buffer })), report: this.report };
  }

  readJson(path: string): unknown | undefined { return this.json[path]; }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  paths(): readonly string[] { return [...Object.keys(this.json), ...this.binary.keys()]; }
  textureUrl(resource: string): string | undefined {
    const path = texturePath(resource);
    const bytes = this.binary.get(path);
    if (!bytes) return undefined;
    const existing = this.objectUrls.get(path);
    if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    this.objectUrls.set(path, url);
    return url;
  }

  catalog(): BlockCatalogSource {
    const records: AssetBlockRecord[] = [];
    for (const path of Object.keys(this.json).filter((value) => /^assets\/[^/]+\/blockstates\/.*\.json$/.test(value)).sort()) {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path);
      if (!match) continue;
      const namespace = match[1]; const blockPath = match[2]; const id = `${namespace}:${blockPath}`;
      const blockstate = this.json[path];
      const stateDefinitions = inferStateDefinitions(blockstate);
      const models = configuredModelIds(blockstate);
      const language = this.languageFor(namespace);
      const displayKey = `block.${namespace}.${blockPath.replaceAll('/', '.')}`;
      const model = models[0];
      records.push({
        id,
        displayName: typeof language[displayKey] === 'string' ? language[displayKey] as string : humanize(blockPath),
        // Resource-only archives do not expose runtime defaults; this deterministic
        // editor fallback is kept explicitly non-authoritative below.
        defaultState: editorFallbackState(stateDefinitions),
        stateDefinitions,
        resources: { blockstate: path, model, textures: [] },
        support: 'partial',
        visualSupport: 'partial',
        behaviorSupport: 'unknown',
        defaultStateSource: 'unknown',
        visualClassification: 'standard-json',
        visualClassificationEvidence: 'inferred',
        sourceId: this.source.id,
        sourceName: this.source.displayName,
        modName: this.source.displayName,
      });
    }
    return { minecraftVersion: this.source.minecraftVersion, sourceId: this.source.id, sourceName: this.source.displayName, blocks: records };
  }

  dispose(): void { for (const url of this.objectUrls.values()) URL.revokeObjectURL(url); this.objectUrls.clear(); }

  private languageFor(namespace: string): Record<string, unknown> {
    const exact = this.json[`assets/${namespace}/lang/en_us.json`];
    if (exact && typeof exact === 'object' && !Array.isArray(exact)) return exact as Record<string, unknown>;
    const fallback = Object.entries(this.json).find(([path, value]) => path.startsWith(`assets/${namespace}/lang/`) && path.endsWith('.json') && !!value && typeof value === 'object' && !Array.isArray(value));
    return (fallback?.[1] ?? {}) as Record<string, unknown>;
  }
}

export type FabricCompatibility = 'compatible' | 'incompatible' | 'unknown';
export function assessFabricCompatibility(expression: string | undefined, version: string): FabricCompatibility {
  if (!expression) return 'unknown';
  const value = expression.trim();
  if (value === version) return 'compatible';
  const wildcard = /^(\d+)\.(\d+)(?:\.x|\.\*)$/.exec(value);
  if (wildcard) return version.startsWith(`${wildcard[1]}.${wildcard[2]}.`) ? 'compatible' : 'incompatible';
  if (/^\d+\.\d+\.\d+$/.test(value)) return 'incompatible';
  return 'unknown';
}

export function parseFabricModMetadata(value: unknown): FabricModMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fabric.mod.json is malformed');
  const source = value as Record<string, unknown>;
  if (typeof source['id'] !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(source['id'])) throw new Error('fabric.mod.json has an invalid mod id');
  if (typeof source['version'] !== 'string' || !source['version'].trim()) throw new Error('fabric.mod.json has no valid version');
  const depends = source['depends'];
  const minecraftCompatibility = depends && typeof depends === 'object' && !Array.isArray(depends) && typeof (depends as Record<string, unknown>)['minecraft'] === 'string' ? (depends as Record<string, unknown>)['minecraft'] as string : undefined;
  return { id: source['id'], displayName: typeof source['name'] === 'string' && source['name'].trim() ? source['name'] : source['id'], version: source['version'], ...(minecraftCompatibility ? { minecraftCompatibility } : {}) };
}

export function discoverNamespaces(json: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>, binary: ReadonlyMap<string, Uint8Array>): readonly string[] {
  const paths = [...(json instanceof Map ? json.keys() : Object.keys(json)), ...binary.keys()];
  return [...new Set(paths.map((path) => /^assets\/([^/]+)\/(?:blockstates|models|textures|lang)\//.exec(path)?.[1]).filter((value): value is string => !!value))].sort();
}

function configuredModelIds(value: unknown): string[] {
  const result = new Set<string>();
  const visit = (item: unknown): void => { if (Array.isArray(item)) { item.forEach(visit); return; } if (!item || typeof item !== 'object') return; const object = item as Record<string, unknown>; if (typeof object['model'] === 'string') result.add(object['model']); Object.values(object).forEach(visit); };
  visit(value); return [...result];
}

function inferStateDefinitions(value: unknown): readonly BlockStateDefinition[] {
  const values = new Map<string, Set<string>>();
  const add = (expression: string): void => { for (const item of expression.split(',')) { const [name, raw] = item.split('='); if (!name || raw === undefined) continue; const options = values.get(name) ?? new Set<string>(); raw.split('|').forEach((option) => options.add(option)); values.set(name, options); } };
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const variants = object['variants']; if (variants && typeof variants === 'object' && !Array.isArray(variants)) Object.keys(variants).forEach(add);
  const visit = (condition: unknown): void => { if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return; for (const [name, raw] of Object.entries(condition as Record<string, unknown>)) { if (name === 'AND' || name === 'OR') { if (Array.isArray(raw)) raw.forEach(visit); } else if (typeof raw === 'string') add(`${name}=${raw}`); } };
  if (Array.isArray(object['multipart'])) for (const part of object['multipart']) if (part && typeof part === 'object') visit((part as Record<string, unknown>)['when']);
  return [...values].map(([name, options]) => ({ name, values: [...options] }));
}

function humanize(value: string): string { return value.split('/').at(-1)!.split('_').map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' '); }
function editorFallbackState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> {
  return Object.fromEntries(definitions.flatMap((definition) => definition.values[0] === undefined ? [] : [[definition.name, definition.values[0]]]));
}

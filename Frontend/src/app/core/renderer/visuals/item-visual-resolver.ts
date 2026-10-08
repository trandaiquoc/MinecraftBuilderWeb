import type { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';
import { resolveResourceLocation, resourcePath } from '../../content/resource-location';

export type ItemVisualKind = 'generated-layers' | 'block-model' | 'special-static' | 'unsupported';

export interface ResolvedItemVisual {
  readonly kind: ItemVisualKind;
  readonly layers: readonly string[];
  readonly model?: string;
  readonly displayFixed?: Readonly<Record<string, unknown>>;
  readonly elements?: readonly unknown[];
  readonly textures?: Readonly<Record<string, string>>;
  readonly modelChain?: readonly string[];
  readonly diagnostics: readonly string[];
}

type ItemResourceReader = Pick<RenderableAssetResourceProvider, 'readJson'> & Partial<Pick<RenderableAssetResourceProvider, 'gameVersion'>>;
type JsonDocument = Record<string, unknown>;

/** Resolves the first statically declared inventory texture for an Item. */
export function itemVisualResource(provider: ItemResourceReader, itemId: string): string | undefined {
  const location = resolveResourceLocation(itemId);
  if (!location) return undefined;
  const [namespace, name] = location.split(':', 2);
  const raw = readItemEntry(provider, namespace, name);
  const model = modelReference(raw) ?? `${namespace}:item/${name}`;
  const visited = new Set<string>();
  const visit = (modelId: string): string | undefined => {
    const normalized = resolveResourceLocation(modelId, namespace) ?? modelId;
    const path = resourcePath(normalized, 'models') ?? `assets/${namespace}/models/${normalized.split(':').at(-1)}.json`;
    if (visited.has(path)) return undefined;
    visited.add(path);
    const document = provider.readJson(path);
    if (!isRecord(document)) return undefined;
    const textures = isRecord(document['textures']) ? document['textures'] : {};
    for (const key of Object.keys(textures).filter((key) => /^layer\d+$/.test(key)).sort()) {
      const value = textures[key];
      if (typeof value === 'string') return resolveResourceLocation(value, normalized.split(':')[0]) ?? value;
    }
    return typeof document['parent'] === 'string' ? visit(document['parent']) : undefined;
  };
  return model ? visit(model) : undefined;
}

export function itemVisualTextureResources(provider: Pick<RenderableAssetResourceProvider, 'readJson'>, itemId: string): readonly string[] {
  const visual = resolveItemVisual(provider, itemId);
  return visual.kind === 'generated-layers' ? visual.layers : [];
}

/** Resolves supported data-driven item models; runtime-only selectors stay unknown. */
export function resolveItemVisual(provider: ItemResourceReader, itemId: string): ResolvedItemVisual {
  const location = resolveResourceLocation(itemId);
  if (!location) return { kind: 'unsupported', layers: [], diagnostics: ['invalid item resource location'] };
  const [namespace, name] = location.split(':', 2);
  const root = readItemEntry(provider, namespace, name);
  if (isRecord(root) && isRecord(root['model']) && typeof root['model']['type'] === 'string' && typeof root['model']['model'] !== 'string') return { kind: 'unsupported', layers: [], diagnostics: ['conditional item model requires runtime selection'] };
  const model = modelReference(root) ?? `${namespace}:item/${name}`;
  const inherited = resolveInheritedItemModel(provider, model, new Set());
  if (!inherited.document || inherited.diagnostics.some((diagnostic) => diagnostic.includes('item model cycle'))) return { kind: 'unsupported', layers: [], modelChain: inherited.modelChain, diagnostics: inherited.diagnostics };
  const document = inherited.document;
  const textures = resolveTextureVariables(document['textures'], inherited.diagnostics);
  const layers = Object.keys(textures).filter((key) => /^layer\d+$/.test(key)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).flatMap((key) => textures[key] ? [textures[key]] : []);
  if (layers.length) {
    if (isRecord(root) && Array.isArray(root['overrides'])) inherited.diagnostics.push('item overrides require static ItemStack predicates');
    return { kind: 'generated-layers', layers, model: inherited.model, modelChain: inherited.modelChain, displayFixed: fixedDisplay(document['display']), textures, diagnostics: inherited.diagnostics };
  }
  const parent = typeof document['parent'] === 'string' ? document['parent'] : undefined;
  const blockParent = parent && (/(?:^|:)block\//.test(parent) || parent.startsWith('block/')) ? resolveResourceLocation(parent, namespace) ?? parent : undefined;
  if (blockParent || Array.isArray(document['elements'])) return { kind: 'block-model', layers: [], model: blockParent ?? inherited.model, modelChain: inherited.modelChain, displayFixed: fixedDisplay(document['display']), elements: Array.isArray(document['elements']) ? document['elements'] : undefined, textures, diagnostics: inherited.diagnostics };
  if (isRecord(root) && Array.isArray(root['overrides'])) inherited.diagnostics.push('item overrides require static ItemStack predicates');
  return { kind: 'unsupported', layers: [], diagnostics: [...inherited.diagnostics, 'item model has no supported static representation'] };
}

function itemModelEntryPath(provider: ItemResourceReader, namespace: string, name: string): string {
  return isLegacyItemModelVersion(provider.gameVersion ?? '1.21.1') ? `assets/${namespace}/models/item/${name}.json` : `assets/${namespace}/items/${name}.json`;
}

function isLegacyItemModelVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
  if (!match) return true;
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  return Number(match[1]) < 1 || (Number(match[1]) === 1 && (minor < 21 || (minor === 21 && patch <= 3)));
}

function readItemEntry(provider: ItemResourceReader, namespace: string, name: string): unknown {
  const preferred = itemModelEntryPath(provider, namespace, name);
  const fallback = preferred.includes('/models/item/') ? `assets/${namespace}/items/${name}.json` : `assets/${namespace}/models/item/${name}.json`;
  return provider.readJson(preferred) ?? provider.readJson(fallback);
}

function resolveInheritedItemModel(provider: Pick<RenderableAssetResourceProvider, 'readJson'>, modelId: string, visited: Set<string>): { document?: JsonDocument; model?: string; modelChain: string[]; diagnostics: string[] } {
  const normalized = resolveResourceLocation(modelId) ?? modelId;
  const path = resourcePath(normalized, 'models') ?? `assets/${normalized.split(':')[0]}/models/${normalized.split(':').at(-1)}.json`;
  if (visited.has(path)) return { modelChain: [normalized], diagnostics: ['item model cycle'] };
  visited.add(path);
  const document = provider.readJson(path);
  if (!isRecord(document)) return { modelChain: [normalized], diagnostics: [`missing item model: ${path}`] };
  const parent = typeof document['parent'] === 'string' ? document['parent'] : undefined;
  const parentResult = parent ? resolveInheritedItemModel(provider, parent, visited) : { document: {}, model: undefined, modelChain: [] as string[], diagnostics: [] as string[] };
  const merged: JsonDocument = { ...(parentResult.document ?? {}), ...document };
  if (isRecord(parentResult.document?.['textures']) || isRecord(document['textures'])) merged['textures'] = { ...(isRecord(parentResult.document?.['textures']) ? parentResult.document!['textures'] as JsonDocument : {}), ...(isRecord(document['textures']) ? document['textures'] : {}) };
  if (isRecord(parentResult.document?.['display']) || isRecord(document['display'])) merged['display'] = { ...(isRecord(parentResult.document?.['display']) ? parentResult.document!['display'] as JsonDocument : {}), ...(isRecord(document['display']) ? document['display'] : {}) };
  return { document: merged, model: normalized, modelChain: [normalized, ...parentResult.modelChain], diagnostics: [...parentResult.diagnostics] };
}

function resolveTextureVariables(raw: unknown, diagnostics: string[]): Record<string, string> {
  if (!isRecord(raw)) return {};
  const values = new Map(Object.entries(raw).filter(([, value]) => typeof value === 'string') as [string, string][]);
  const result: Record<string, string> = {};
  const visit = (key: string, chain: Set<string>): string | undefined => {
    const value = values.get(key);
    if (!value) return undefined;
    if (!value.startsWith('#')) return resolveResourceLocation(value) ?? value;
    const target = value.slice(1);
    if (chain.has(target)) { diagnostics.push(`texture variable cycle: ${target}`); return undefined; }
    return visit(target, new Set([...chain, target]));
  };
  for (const key of values.keys()) { const value = visit(key, new Set([key])); if (value) result[key] = value; }
  return result;
}

function fixedDisplay(raw: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(raw) && isRecord(raw['fixed']) ? raw['fixed'] : undefined;
}

function modelReference(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value['model'] === 'string') return value['model'];
  const model = value['model'];
  return isRecord(model) && typeof model['model'] === 'string' ? model['model'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

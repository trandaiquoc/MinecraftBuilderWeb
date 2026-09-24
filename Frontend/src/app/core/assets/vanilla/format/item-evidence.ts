import type { CatalogItemEvidence } from '../../../blocks/catalog/block-definition.types';
import { resolveResourceLocation } from '../../../content/resource-location';

/** Normalized evidence extracted from a target-version item definition. */
export type TargetItemEvidence = Omit<CatalogItemEvidence, 'sourceFormat'> & { readonly sourceFormat: 'modern-item-definition' | 'legacy-item-model' | 'unknown' };

export interface ItemIdentityIndex {
  readonly ids: ReadonlySet<string>;
  readonly reasons: ReadonlyMap<string, readonly string[]>;
}

export function itemEvidenceFromResources(
  json: Readonly<Record<string, unknown>>,
  paths: readonly string[],
  sourceFormat: TargetItemEvidence['sourceFormat'] = 'modern-item-definition',
  identity: ItemIdentityIndex = itemIdentityIndexFromResources(json),
): readonly TargetItemEvidence[] {
  const entries = paths
    .filter((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path) || /^assets\/[^/]+\/models\/item\/.+\.json$/.test(path))
    .map((path): TargetItemEvidence | undefined => {
      const match = /^assets\/([^/]+)\/(?:items|models\/item)\/(.+)\.json$/.exec(path);
      if (!match) return undefined;
      const isModernDefinition = path.includes('/items/');
      const itemId = `${match[1]}:${match[2]}`;
      // A legacy model is a resource graph node, not proof that a registered
      // Item exists. Modern item definitions are authoritative; legacy roots
      // require separate identity evidence (registry/block/language/data).
      if (!isModernDefinition && !identity.ids.has(itemId)) return undefined;
      const models = new Set<string>();
      const resources = new Set<string>();
      collectItemReferences(json[path], models, resources, match[1]);
      return {
        itemId,
        referencedModels: [...models],
        referencedResources: [...resources],
        sourceFormat,
      };
    })
    .filter(isItemEvidence);
  const byId = new Map<string, TargetItemEvidence>();
  for (const entry of entries) {
    const previous = byId.get(entry.itemId);
    // Prefer an explicit modern definition over a legacy model with the same
    // path. Both remain available to the resource/model resolver itself.
    if (!previous || entry.sourceFormat === 'modern-item-definition') byId.set(entry.itemId, entry);
  }
  return [...byId.values()];
}

/** Builds Item identity evidence once from retained static resources. Model
 * files are intentionally excluded unless another resource proves the ID. */
export function itemIdentityIndexFromResources(json: Readonly<Record<string, unknown>>): ItemIdentityIndex {
  const reasons = new Map<string, Set<string>>();
  const add = (id: string, reason: string): void => {
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) return;
    const values = reasons.get(id) ?? new Set<string>(); values.add(reason); reasons.set(id, values);
  };
  for (const path of Object.keys(json)) {
    let match = /^assets\/([^/]+)\/items\/(.+)\.json$/.exec(path);
    if (match) { add(`${match[1]}:${match[2]}`, 'modern-item-definition'); continue; }
    match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path);
    if (match) { add(`${match[1]}:${match[2]}`, 'block-item-registration'); continue; }
    match = /^assets\/([^/]+)\/models\/item\/(.+)\.json$/.exec(path);
    if (match && isLegacyItemRootModel(json[path])) { add(`${match[1]}:${match[2]}`, 'legacy-item-root-model'); continue; }
    match = /^assets\/([^/]+)\/lang\/[^/]+\.json$/.exec(path);
    if (match) { collectLanguageItemIds(json[path], match[1], add); continue; }
    if (/^data\/[^/]+\/(?:tags\/item|recipes|loot_tables|advancements|predicates)\//.test(path)) collectDataItemIds(json[path], path, add);
  }
  return { ids: new Set(reasons.keys()), reasons: new Map([...reasons].map(([id, values]) => [id, [...values].sort()])) };
}

const providerIdentityCache = new WeakMap<object, { readonly revision?: number; readonly paths: readonly string[]; readonly index: ItemIdentityIndex }>();

export function itemIdentityEvidenceFromProvider(provider: { readonly readJson: (path: string) => unknown | undefined; readonly paths?: () => readonly string[]; readonly revision?: number }, itemId: string): readonly string[] {
  const paths = provider.paths?.() ?? [];
  const cached = providerIdentityCache.get(provider);
  if (cached && cached.revision === provider.revision && cached.paths.length === paths.length && cached.paths.every((path, index) => path === paths[index])) return cached.index.reasons.get(itemId) ?? [];
  const json: Record<string, unknown> = {};
  for (const path of paths) {
    const value = provider.readJson(path);
    if (value !== undefined) json[path] = value;
  }
  const index = itemIdentityIndexFromResources(json);
  providerIdentityCache.set(provider, { revision: provider.revision, paths: [...paths], index });
  return index.reasons.get(itemId) ?? [];
}

function isItemEvidence(value: TargetItemEvidence | undefined): value is TargetItemEvidence { return value !== undefined; }

function collectLanguageItemIds(value: unknown, namespace: string, add: (id: string, reason: string) => void): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) if (key.startsWith(`item.${namespace}.`)) add(`${namespace}:${key.slice(`item.${namespace}.`.length).replaceAll('.', '/')}`, 'item-language-key');
}

function collectDataItemIds(value: unknown, path: string, add: (id: string, reason: string) => void): void {
  const reason = path.includes('/tags/item/') ? 'item-tag-member' : path.includes('/recipes/') ? 'recipe-item-reference' : path.includes('/loot_tables/') ? 'loot-item-reference' : 'item-predicate-reference';
  const allowedKeys = new Set(['id', 'item', 'items', 'ingredient', 'ingredients', 'result', 'values', ...(reason === 'loot-item-reference' ? ['name'] : [])]);
  const visit = (entry: unknown, key?: string): void => {
    if (Array.isArray(entry)) { entry.forEach((child) => visit(child, key)); return; }
    if (!isRecord(entry)) {
      if (typeof entry === 'string' && key && allowedKeys.has(key) && !entry.startsWith('#')) add(entry, reason);
      return;
    }
    Object.entries(entry).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function isLegacyItemRootModel(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const parent = typeof value['parent'] === 'string' ? value['parent'] : '';
  return /^(?:[a-z0-9_.-]+:)?item\/(?:generated|handheld)$/.test(parent);
}

function collectItemReferences(value: unknown, models: Set<string>, resources: Set<string>, namespace = 'minecraft'): void {
  if (Array.isArray(value)) { value.forEach((entry) => collectItemReferences(entry, models, resources, namespace)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && (key === 'model' || key === 'parent' || key === 'texture' || key === 'textures')) {
      (key === 'model' || key === 'parent' ? models : resources).add(resolveResourceLocation(child, namespace) ?? child);
    } else if (typeof child === 'object') collectItemReferences(child, models, resources, namespace);
  }
}

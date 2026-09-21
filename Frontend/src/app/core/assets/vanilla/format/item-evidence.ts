import type { CatalogItemEvidence } from '../../../blocks/catalog/block-definition.types';

/** Normalized evidence extracted from a target-version item definition. */
export type TargetItemEvidence = Omit<CatalogItemEvidence, 'sourceFormat'> & { readonly sourceFormat: 'modern-item-definition' | 'legacy-item-model' | 'unknown' };

export function itemEvidenceFromResources(
  json: Readonly<Record<string, unknown>>,
  paths: readonly string[],
  sourceFormat: TargetItemEvidence['sourceFormat'] = 'modern-item-definition',
): readonly TargetItemEvidence[] {
  const entries = paths
    .filter((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path) || /^assets\/[^/]+\/models\/item\/.+\.json$/.test(path))
    .map((path): TargetItemEvidence | undefined => {
      const match = /^assets\/([^/]+)\/(?:items|models\/item)\/(.+)\.json$/.exec(path);
      if (!match) return undefined;
      const itemId = `${match[1]}:${match[2]}`;
      const models = new Set<string>();
      const resources = new Set<string>();
      collectItemReferences(json[path], models, resources);
      return {
        itemId,
        referencedModels: [...models],
        referencedResources: [...resources],
        sourceFormat,
      };
    })
    .filter(isItemEvidence);
  return entries;
}

function isItemEvidence(value: TargetItemEvidence | undefined): value is TargetItemEvidence { return value !== undefined; }

function collectItemReferences(value: unknown, models: Set<string>, resources: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((entry) => collectItemReferences(entry, models, resources)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && (key === 'model' || key === 'parent' || key === 'texture' || key === 'textures')) {
      (key === 'model' || key === 'parent' ? models : resources).add(child);
    } else if (typeof child === 'object') collectItemReferences(child, models, resources);
  }
}

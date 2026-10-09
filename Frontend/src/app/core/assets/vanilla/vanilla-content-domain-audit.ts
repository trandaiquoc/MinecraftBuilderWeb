import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { buildPlaceableItems } from '../../blocks/placement-palette/placeable-item';
import type { PlaceableItemDefinition, PlaceableItemEvidence } from '../../blocks/placement-palette/placeable-item.types';
import { classifyBlockDefinition, classifyContent, isDecorationEntityId, isTechnicalBlockId, type MinecraftContentKind } from '../../content/content-classifier';
import type { VanillaAssetProvider } from './vanilla-asset-provider';

export interface ContentDomainAudit {
  readonly counts: Readonly<Record<MinecraftContentKind, number>>;
  readonly paletteLeaks: readonly { readonly itemId: string; readonly code: 'CONTENT_DOMAIN_MISMATCH' | 'ENTITY_IN_BLOCK_PALETTE' | 'INTERNAL_BLOCK_IN_PALETTE' | 'TECHNICAL_BLOCK_IN_PALETTE' | 'ITEM_ONLY_IN_BLOCK_PALETTE' }[];
}

export function auditContentDomains(provider: VanillaAssetProvider): ContentDomainAudit {
  const source = provider.catalog();
  const catalog = new BlockCatalog();
  catalog.load(source);
  const definitions = catalog.all();
  const kinds: readonly MinecraftContentKind[] = ['world-block', 'block-backed-item', 'logical-block-item', 'internal-block', 'technical-block', 'decoration-entity', 'item-only', 'unknown'];
  const counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<MinecraftContentKind, number>;
  for (const definition of definitions) counts[classifyBlockDefinition(definition).kind] += 1;
  const targetItems = source.targetItems ?? [];
  const worldIds = new Set(definitions.map((definition) => definition.id));
  const placeableItems = buildPlaceableItems(definitions, targetItems, source.itemEvidenceAvailable);
  const placeableIds = new Set(placeableItems.map((item) => item.itemId));
  for (const evidence of targetItems) {
    if (worldIds.has(evidence.itemId)) continue;
    counts[placeableIds.has(evidence.itemId) ? 'logical-block-item' : classifyContent({ id: evidence.itemId, hasItemEvidence: true }).kind] += 1;
  }
  return { counts, paletteLeaks: auditPaletteLeaks(placeableItems, definitions, targetItems, source.itemEvidenceAvailable) };
}

export function auditPaletteLeaks(
  items: readonly PlaceableItemDefinition[],
  definitions: readonly BlockDefinition[],
  targetItems: readonly (CatalogItemEvidence | PlaceableItemEvidence)[] = [],
  itemEvidenceAvailable = targetItems.length > 0,
): ContentDomainAudit['paletteLeaks'] {
  const worldIds = new Set(definitions.map((definition) => definition.id));
  const targetIds = new Set(targetItems.map((item) => item.itemId));
  return items.flatMap((item): ContentDomainAudit['paletteLeaks'] => {
    if (isDecorationEntityId(item.itemId)) return [{ itemId: item.itemId, code: 'ENTITY_IN_BLOCK_PALETTE' as const }];
    if (isTechnicalBlockId(item.displayBlockId)) return [{ itemId: item.itemId, code: 'TECHNICAL_BLOCK_IN_PALETTE' as const }];
    if (item.contentKind === 'internal-block') return [{ itemId: item.itemId, code: 'INTERNAL_BLOCK_IN_PALETTE' as const }];
    if (!item.concreteBlockIds.every((id) => worldIds.has(id))) return [{ itemId: item.itemId, code: 'ITEM_ONLY_IN_BLOCK_PALETTE' as const }];
    if (itemEvidenceAvailable && !targetIds.has(item.itemId)) return [{ itemId: item.itemId, code: 'ITEM_ONLY_IN_BLOCK_PALETTE' as const }];
    if (item.concreteBlockIds.length === 0) return [{ itemId: item.itemId, code: 'CONTENT_DOMAIN_MISMATCH' as const }];
    return [];
  });
}

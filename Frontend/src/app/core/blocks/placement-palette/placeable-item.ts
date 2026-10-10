import type { BlockDefinition } from '../catalog/block-definition.types';
import { addBlockCapability } from '../capabilities/block-capability-resolver';
import type { BlockCapabilityProfile } from '../capabilities/block-capability.types';
import type { BlockPlacementVariants } from '../catalog/block-definition.types';
import {
  isInternalContent,
  isTechnicalBlockId,
  isDecorationEntityId,
  vanillaTechnicalBlockIds,
} from '../../content/content-classifier';
import { logicalPlacementForBehavior } from '../../block-behavior/logical-objects/logical-placement';
import { rankSearchResults } from '../../search/relevance-search';
import type {
  PlaceableItemDefinition,
  PlaceableItemEvidence,
  PlaceableManifestEntry,
} from './placeable-item.types';
import {
  vanillaPlaceableForConcreteId,
  VANILLA_PLACEABLE_MANIFEST,
} from './manifest/vanilla-placeable-manifest';
import { createPlaceablePreviewBlocks } from './logical-placement-preview';

export type {
  PlaceableItemDefinition,
  PlaceableItemEvidence,
  PlaceableManifestEntry,
  PlaceablePlacementKind,
  PreviewRecipe,
} from './placeable-item.types';
export { VANILLA_PLACEABLE_MANIFEST } from './manifest/vanilla-placeable-manifest';
export {
  canonicalPlaceableItemId,
  resolveConcreteBlockId,
  resolveItemBlock,
} from './placeable-item-resolution';
export { previewBlocksForItem } from './logical-placement-preview';

/** Palette selection policy: whether a registry block is a standalone item. */
export function isNormalBuildingPaletteEligible(
  block: Pick<BlockDefinition, 'id' | 'namespace' | 'contentKind' | 'itemEvidence'>,
): boolean {
  const contentKind = block.contentKind ?? block.itemEvidence?.contentKind;
  return (
    !isTechnicalBlockId(block.id) &&
    !isInternalContent(contentKind) &&
    !isDecorationEntityId(block.id)
  );
}

export function isPaletteEligible(
  block: Pick<BlockDefinition, 'id' | 'namespace' | 'contentKind' | 'itemEvidence'>,
): boolean {
  return isNormalBuildingPaletteEligible(block);
}

/** World serialization policy is distinct from palette visibility. */
export function isWorldBlockSerializable(blockId: string): boolean {
  return !isTechnicalBlockId(blockId) && !isDecorationEntityId(blockId);
}

/** @deprecated Use isWorldBlockSerializable; retained for callers during the policy split. */
export function isNormalBuildingExportEligible(blockId: string): boolean {
  return isWorldBlockSerializable(blockId);
}

export function technicalBuildingIds(): readonly string[] {
  return vanillaTechnicalBlockIds();
}

export function buildPlaceableItems(
  definitions: readonly BlockDefinition[],
  targetItems: readonly PlaceableItemEvidence[] = [],
  targetItemsAvailable?: boolean,
): readonly PlaceableItemDefinition[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const targetItemIds = new Set(
    targetItems.filter((item) => isTargetItemPlaceable(item, byId)).map((item) => item.itemId),
  );
  const hasTargetItemEvidence =
    targetItemsAvailable ??
    (targetItems.length > 0 ||
      definitions.some((definition) => definition.itemEvidence !== undefined));
  if (targetItemsAvailable === undefined && targetItems.length === 0) {
    for (const definition of definitions)
      if (definition.itemEvidence?.placeable === true)
        targetItemIds.add(definition.itemEvidence.itemId);
  }
  const covered = new Set<string>();
  const result: PlaceableItemDefinition[] = [];
  for (const entry of VANILLA_PLACEABLE_MANIFEST) {
    const concreteBlockIds = entry.concreteBlockIds.filter((blockId) => byId.has(blockId));
    const display = byId.get(entry.itemId) ?? byId.get(concreteBlockIds[0]);
    if (!display || !concreteBlockIds.length || !isNormalBuildingPaletteEligible(display)) continue;
    if (hasTargetItemEvidence && !targetItemIds.has(entry.itemId)) continue;
    for (const blockId of concreteBlockIds) covered.add(blockId);
    result.push(toItem(display, entry, concreteBlockIds));
  }
  for (const entry of discoverLogicalEntries(definitions, byId)) {
    if (covered.has(entry.itemId) || !entry.concreteBlockIds.every((blockId) => byId.has(blockId)))
      continue;
    const display = byId.get(entry.itemId);
    if (!display || !isNormalBuildingPaletteEligible(display)) continue;
    if (hasTargetItemEvidence && !targetItemIds.has(entry.itemId)) continue;
    for (const blockId of entry.concreteBlockIds) covered.add(blockId);
    result.push(toItem(display, entry, entry.concreteBlockIds));
  }
  for (const definition of definitions) {
    if (
      !isNormalBuildingPaletteEligible(definition) ||
      covered.has(definition.id) ||
      vanillaPlaceableForConcreteId(definition.id)
    )
      continue;
    if (hasTargetItemEvidence && !targetItemIds.has(definition.id)) continue;
    result.push(
      toItem(
        definition,
        {
          itemId: definition.id,
          concreteBlockIds: [definition.id],
          kind: 'direct',
          recipe: 'single',
        },
        [definition.id],
      ),
    );
  }
  return result.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function isTargetItemPlaceable(
  item: PlaceableItemEvidence,
  byId: ReadonlyMap<string, BlockDefinition>,
): boolean {
  if (item.placeable === false) return false;
  const direct = byId.get(item.itemId);
  if (direct && isNormalBuildingPaletteEligible(direct)) return true;
  const manifestEntry = VANILLA_PLACEABLE_MANIFEST.find((entry) => entry.itemId === item.itemId);
  if (manifestEntry)
    return manifestEntry.concreteBlockIds.some((blockId) => {
      const concrete = byId.get(blockId);
      return (
        concrete !== undefined &&
        isNormalBuildingPaletteEligible(
          byId.get(entryDisplayId(manifestEntry, byId, blockId)) ?? concrete,
        )
      );
    });
  const explicit = item.explicitBlockPlacement?.blockId;
  return (
    explicit !== undefined &&
    byId.has(explicit) &&
    isNormalBuildingPaletteEligible(byId.get(explicit)!)
  );
}

function entryDisplayId(
  entry: PlaceableManifestEntry,
  byId: ReadonlyMap<string, BlockDefinition>,
  fallback: string,
): string {
  return byId.has(entry.itemId)
    ? entry.itemId
    : (entry.concreteBlockIds.find((blockId) => byId.has(blockId)) ?? fallback);
}

function discoverLogicalEntries(
  definitions: readonly BlockDefinition[],
  byId: ReadonlyMap<string, BlockDefinition>,
): readonly PlaceableManifestEntry[] {
  const entries: PlaceableManifestEntry[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.id)) continue;
    const variants = definition.placementVariants;
    if (variants?.standing || variants?.hanging) {
      const ids = [...new Set(Object.values(variants).filter((value): value is string => !!value))];
      if (ids.every((id) => byId.has(id))) {
        const itemId = variants.standing ?? variants.hanging!;
        const kind = variants.hanging ? 'hanging-sign' : 'sign';
        if (!seen.has(itemId)) {
          ids.forEach((id) => seen.add(id));
          entries.push({
            itemId,
            concreteBlockIds: ids,
            kind,
            recipe: 'single',
            placementVariants: variants,
          });
        }
      }
      continue;
    }
    const logicalPlacement =
      definition.logicalPlacement ?? logicalPlacementForBehavior(definition.behavior);
    if (logicalPlacement)
      entries.push({
        itemId: definition.id,
        concreteBlockIds: [definition.id],
        kind: 'multi-block',
        recipe: logicalPlacement.layout,
        logicalPlacement,
      });
  }
  return entries;
}

function toItem(
  definition: BlockDefinition,
  entry: PlaceableManifestEntry,
  concreteBlockIds: readonly string[],
): PlaceableItemDefinition {
  const defaultState = { ...definition.defaultState, ...(entry.defaultState ?? {}) };
  const previewState = definition.contentDescriptor?.representativeVisualState
    ? { ...defaultState, ...definition.contentDescriptor.representativeVisualState }
    : undefined;
  const logicalPlacement =
    entry.logicalPlacement ??
    definition.logicalPlacement ??
    logicalPlacementForBehavior(definition.behavior);
  const previewBlocks = createPlaceablePreviewBlocks(
    entry,
    definition,
    previewState ?? defaultState,
    logicalPlacement,
  );
  const placementVariants: BlockPlacementVariants | undefined =
    entry.placementVariants ??
    (definition.namespace === 'minecraft' && entry.concreteBlockIds.length > 1
      ? { standing: entry.concreteBlockIds[0], wall: entry.concreteBlockIds[1] }
      : undefined);
  const itemEvidence =
    definition.sourceId && definition.sourceId !== 'vanilla' ? 'inferred' : 'verified';
  const contentKind = definition.contentKind ?? definition.itemEvidence?.contentKind;
  return {
    itemId: entry.itemId,
    displayBlockId: definition.id,
    namespace: definition.namespace,
    displayName: entry.displayName ?? definition.displayName,
    modName: definition.modName,
    sourceId: definition.sourceId,
    sourceName: definition.sourceName,
    ...(definition.itemEvidence?.maxStackSize === undefined
      ? {}
      : { maxStackSize: definition.itemEvidence.maxStackSize }),
    ...(contentKind ? { contentKind } : {}),
    defaultState,
    ...(previewState ? { previewState } : {}),
    concreteBlockIds,
    ...(placementVariants ? { placementVariants } : {}),
    placementKind: entry.kind,
    previewRecipe: entry.recipe,
    ...(logicalPlacement ? { logicalPlacement } : {}),
    support: definition.support,
    visualSupport: definition.visualSupport,
    capabilities: addBlockCapability(definition.capabilities, {
      kind: 'item-backed',
      evidence: itemEvidence,
    }),
    previewBlocks,
  };
}

export function placementItemSearch(
  items: readonly PlaceableItemDefinition[],
  query: string,
): readonly PlaceableItemDefinition[] {
  return rankSearchResults(items, query, (item) => [
    item.displayName,
    item.itemId,
    item.displayBlockId,
    item.namespace,
    item.modName ?? '',
    item.sourceName ?? '',
  ]);
}

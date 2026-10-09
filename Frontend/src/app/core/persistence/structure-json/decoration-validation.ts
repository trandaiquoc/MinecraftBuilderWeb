import type { PlacedDecoration } from '../../decorations/decoration.types';
import { allPaintingVariants, paintingVariant } from '../../decorations/decoration.types';
import { decorationAabb, decorationInBounds, paintingSupportFootprint, supportsDecoration } from '../../decorations/placement/decoration-placement';
import { coordinateKey } from '../../domain/coordinates';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { validateItemStack, type ItemMaxStackResolver } from '../../items/item-stack-validation';
import { addDecorationToSpatialIndex, blocksIntersectingAabb, buildDecorationSpatialIndex, buildStructureImportSpatialContext, buildStructureImportSpatialContextAsync, queryDecorationSpatialIndex } from './structure-json-spatial';
import type { NormalizedValidationContentLimits, StructureJsonDecorationIssue, StructureJsonValidationOptions } from './structure-json-validation.types';
import type { StructureJson, StructureJsonDecoration } from './structure-json';
import { normalizeValidationContentLimits } from './structure-json-content-limits';
import { CooperativeWorkBudget } from '../../assets/cooperative-yield';
import { cooperativeValidationCheckpoint } from './structure-json-validation-scheduling';

type DecorationValidationSummary = {
  readonly totalDecorations: number;
  readonly validDecorations: number;
  readonly missingDecorationAssets: number;
  readonly invalidDecorations: number;
  readonly decorationIssues: readonly StructureJsonDecorationIssue[];
};

export function validateStructureJsonDecorations(document: StructureJson, project: ProjectDocument, options?: StructureJsonValidationOptions): DecorationValidationSummary {
  return validateDecorations(document, project, undefined, normalizeValidationContentLimits(options));
}

export async function validateStructureJsonDecorationsAsync(document: StructureJson, project: ProjectDocument, options?: StructureJsonValidationOptions, cancellation?: import('./structure-json-validation.types').StructureJsonValidationCancellation): Promise<DecorationValidationSummary | undefined> {
  return validateDecorationsAsync(document, project, undefined, normalizeValidationContentLimits(options), cancellation, new CooperativeWorkBudget(8, 4096));
}

export function validateDecorations(document: StructureJson, project: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, limits?: NormalizedValidationContentLimits): DecorationValidationSummary {
  const decorations = document.decorations;
  const issues: StructureJsonDecorationIssue[] = [];
  const variants = paintingVariantsById();
  const spatial = buildStructureImportSpatialContext(project.blocks, project.decorations ?? []);
  const candidateSpatial = buildDecorationSpatialIndex([]);
  for (let index = 0; index < decorations.length; index += 1) {
    validateDecorationEntry(decorations[index], index, project.size, resolveMaxStackSize, limits, variants, spatial, candidateSpatial, issues);
  }
  return summarizeDecorationIssues(decorations.length, issues);
}

export async function validateDecorationsAsync(document: StructureJson, project: ProjectDocument, resolveMaxStackSize: ItemMaxStackResolver | undefined, limits: NormalizedValidationContentLimits, cancellation: import('./structure-json-validation.types').StructureJsonValidationCancellation | undefined, budget: CooperativeWorkBudget): Promise<DecorationValidationSummary | undefined> {
  const decorations = document.decorations;
  const issues: StructureJsonDecorationIssue[] = [];
  const variants = paintingVariantsById();
  const spatial = await buildStructureImportSpatialContextAsync(project.blocks, project.decorations ?? [], cancellation);
  if (!spatial) return undefined;
  const candidateSpatial = buildDecorationSpatialIndex([]);
  for (let index = 0; index < decorations.length; index += 1) {
    validateDecorationEntry(decorations[index], index, project.size, resolveMaxStackSize, limits, variants, spatial, candidateSpatial, issues);
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined;
  }
  return summarizeDecorationIssues(decorations.length, issues);
}

function paintingVariantsById(): Map<string, ReturnType<typeof paintingVariant>> {
  return new Map(allPaintingVariants().map((entry) => [entry.id, entry]));
}

function validateDecorationEntry(decoration: StructureJsonDecoration, index: number, size: ProjectDocument['size'], resolveMaxStackSize: ItemMaxStackResolver | undefined, limits: NormalizedValidationContentLimits | undefined, variants: ReadonlyMap<string, ReturnType<typeof paintingVariant>>, spatial: ReturnType<typeof buildStructureImportSpatialContext>, candidateSpatial: ReturnType<typeof buildDecorationSpatialIndex>, issues: StructureJsonDecorationIssue[]): void {
  const variant = decoration.kind === 'painting' ? variants.get(decoration.variantId.replace(/^minecraft:/, '')) ?? paintingVariant(decoration.variantId) : undefined;
  if (decoration.kind !== 'painting' && decoration.item && limits?.enabled && limits.items.has(decoration.item.id)) { appendDecorationIssue(issues, decoration, index, 'content-limit', 'content-limit', decoration.item.id, 'item.id'); return; }
  if (decoration.kind !== 'painting' && decoration.item && !validateItemStack({ id: decoration.item.id, count: decoration.item.count ?? 1, ...(decoration.item.components ? { components: decoration.item.components } : {}) }, resolveMaxStackSize).valid) { appendDecorationIssue(issues, decoration, index, 'invalid', 'invalid-item-stack'); return; }
  const paintingId = decoration.kind === 'painting' ? namespacedDecorationId(decoration.variantId) : undefined;
  if (paintingId && limits?.enabled && limits.decorations.has(paintingId)) { appendDecorationIssue(issues, decoration, index, 'content-limit', 'content-limit', paintingId, 'variantId'); return; }
  if (decoration.kind === 'painting' && !variant) { appendDecorationIssue(issues, decoration, index, 'missing-asset', 'missing-painting-variant'); return; }
  if (!decorationInBounds(decoration.anchor, size)) { appendDecorationIssue(issues, decoration, index, 'bounds', 'out-of-bounds'); return; }
  const direction = decorationDirection(decoration.facing);
  const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z };
  if (!supportsDecoration(decoration.kind, decoration.facing, spatial.occupiedCoordinates.has(coordinateKey(support)), decoration.kind === 'painting' ? false : decoration.fixed)) { appendDecorationIssue(issues, decoration, index, 'invalid', 'missing-support'); return; }
  if (variant && paintingSupportFootprint(decoration.anchor, decoration.facing, variant).some((position) => !spatial.occupiedCoordinates.has(coordinateKey(position)))) { appendDecorationIssue(issues, decoration, index, 'invalid', 'missing-painting-support'); return; }
  const aabb = decorationAabb({ ...decoration, ...(variant ? { variantId: variant.id } : {}) });
  if (blocksIntersectingAabb(aabb, spatial).some((block) => coordinateKey(block.position) !== coordinateKey(support))) { appendDecorationIssue(issues, decoration, index, 'conflict', 'blocked-by-block'); return; }
  if (queryDecorationSpatialIndex(spatial.decorations, aabb).length > 0 || queryDecorationSpatialIndex(candidateSpatial, aabb).length > 0) { appendDecorationIssue(issues, decoration, index, 'conflict', 'overlap-decoration'); return; }
  addDecorationToSpatialIndex(candidateSpatial, { instanceId: `preview-${index}`, kind: decoration.kind, entityTypeId: decoration.kind === 'painting' ? 'minecraft:painting' : decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow-item-frame', anchor: decoration.anchor, facing: decoration.facing, ...(decoration.kind === 'painting' ? { variantId: decoration.variantId } : {}) } as PlacedDecoration);
}

function appendDecorationIssue(issues: StructureJsonDecorationIssue[], decoration: StructureJsonDecoration, index: number, category: StructureJsonDecorationIssue['category'], reason: string, restrictedId?: string, path?: string): void {
  issues.push({ category, index, kind: decoration.kind, anchor: decoration.anchor, reason, ...(restrictedId ? { restrictedId } : {}), ...(path ? { path } : {}) });
}

function decorationDirection(facing: StructureJsonDecoration['facing']): VoxelCoordinate {
  return facing === 'up' ? { x: 0, y: 1, z: 0 } : facing === 'down' ? { x: 0, y: -1, z: 0 } : facing === 'north' ? { x: 0, y: 0, z: -1 } : facing === 'south' ? { x: 0, y: 0, z: 1 } : facing === 'west' ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
}

function namespacedDecorationId(id: string): string { return id.includes(':') ? id : `minecraft:${id}`; }

function summarizeDecorationIssues(totalDecorations: number, issues: StructureJsonDecorationIssue[]): DecorationValidationSummary {
  return { totalDecorations, validDecorations: totalDecorations - issues.length, missingDecorationAssets: issues.filter((entry) => entry.category === 'missing-asset').length, invalidDecorations: issues.filter((entry) => entry.category !== 'missing-asset').length, decorationIssues: issues };
}

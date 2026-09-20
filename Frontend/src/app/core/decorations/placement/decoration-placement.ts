import { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { DecorationFacing, DecorationKind, PaintingVariant, PlacedDecoration, paintingVariant, chooseRandomPaintingVariant } from '../decoration.types';
import { ProjectDocument } from '../../domain/project.types';

export interface DecorationAabb { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number }; }
export type DecorationPlacementReason = 'unsupported-face' | 'out-of-bounds' | 'missing-support' | 'blocked-by-block' | 'overlap-decoration';
export interface DecorationPlacementPlan { readonly status: 'valid' | 'invalid' | 'unknown'; readonly reason?: DecorationPlacementReason; readonly decoration?: PlacedDecoration; }

export function directionVector(facing: DecorationFacing): VoxelCoordinate {
  switch (facing) {
    case 'down': return { x: 0, y: -1, z: 0 };
    case 'up': return { x: 0, y: 1, z: 0 };
    case 'north': return { x: 0, y: 0, z: -1 };
    case 'south': return { x: 0, y: 0, z: 1 };
    case 'west': return { x: -1, y: 0, z: 0 };
    case 'east': return { x: 1, y: 0, z: 0 };
  }
}

export function facingFromNormal(normal: { readonly x: number; readonly y: number; readonly z: number }): DecorationFacing | undefined {
  if (normal.y > .5) return 'up'; if (normal.y < -.5) return 'down'; if (normal.z < -.5) return 'north'; if (normal.z > .5) return 'south'; if (normal.x < -.5) return 'west'; if (normal.x > .5) return 'east'; return undefined;
}

export function decorationAnchorFromSupport(support: VoxelCoordinate, facing: DecorationFacing): VoxelCoordinate {
  const direction = directionVector(facing);
  return { x: support.x + direction.x, y: support.y + direction.y, z: support.z + direction.z };
}

export function decorationInBounds(anchor: VoxelCoordinate, size: ProjectSize): boolean {
  return Number.isInteger(anchor.x) && Number.isInteger(anchor.y) && Number.isInteger(anchor.z) && anchor.x >= 0 && anchor.y >= 0 && anchor.z >= 0 && anchor.x < size.x && anchor.y < size.y && anchor.z < size.z;
}

export function decorationAabb(decoration: Pick<PlacedDecoration, 'kind' | 'anchor' | 'facing' | 'variantId'>): DecorationAabb {
  const { anchor, facing } = decoration;
  if (decoration.kind === 'painting') {
    const variant = paintingVariant(decoration.variantId) ?? ({ width: 1, height: 1 } satisfies Pick<PaintingVariant, 'width' | 'height'>);
    const width = variant.width; const height = variant.height;
    const center = paintingEntityPosition(anchor, facing, variant);
    const minX = center.x - (facing === 'east' || facing === 'west' ? .03125 : width / 2);
    const maxX = center.x + (facing === 'east' || facing === 'west' ? .03125 : width / 2);
    const minZ = center.z - (facing === 'north' || facing === 'south' ? .03125 : width / 2);
    const maxZ = center.z + (facing === 'north' || facing === 'south' ? .03125 : width / 2);
    return { min: { x: minX, y: center.y - height / 2, z: minZ }, max: { x: maxX, y: center.y + height / 2, z: maxZ } };
  }
  const direction = directionVector(facing);
  const center = { x: anchor.x + .5 - direction.x * .46875, y: anchor.y + .5 - direction.y * .46875, z: anchor.z + .5 - direction.z * .46875 };
  const halfAlong = .03125; const halfOther = .375;
  return {
    min: { x: center.x - (direction.x ? halfAlong : halfOther), y: center.y - (direction.y ? halfAlong : halfOther), z: center.z - (direction.z ? halfAlong : halfOther) },
    max: { x: center.x + (direction.x ? halfAlong : halfOther), y: center.y + (direction.y ? halfAlong : halfOther), z: center.z + (direction.z ? halfAlong : halfOther) },
  };
}

export function paintingEntityPosition(anchor: VoxelCoordinate, facing: DecorationFacing, variant: Pick<PaintingVariant, 'width' | 'height'>): { readonly x: number; readonly y: number; readonly z: number } {
  const direction = directionVector(facing);
  const perpendicular = { x: -direction.z, y: 0, z: direction.x };
  return { x: anchor.x + .5 - direction.x * .46875 + perpendicular.x * (variant.width % 2 === 0 ? .5 : 0), y: anchor.y + .5 - direction.y * .46875 + (variant.height % 2 === 0 ? .5 : 0), z: anchor.z + .5 - direction.z * .46875 + perpendicular.z * (variant.width % 2 === 0 ? .5 : 0) };
}

export function paintingSupportFootprint(anchor: VoxelCoordinate, facing: DecorationFacing, variant: Pick<PaintingVariant, 'width' | 'height'>): readonly VoxelCoordinate[] {
  if (!['north', 'south', 'east', 'west'].includes(facing)) return [];
  const direction = directionVector(facing); const perpendicular = { x: -direction.z, z: direction.x };
  const widthStart = -(variant.width - 1) / 2; const heightStart = -(variant.height - 1) / 2;
  return Array.from({ length: variant.width * variant.height }, (_, index) => {
    const xIndex = index % variant.width; const yIndex = Math.floor(index / variant.width);
    return { x: anchor.x + direction.x * -1 + Math.round(perpendicular.x * (widthStart + xIndex)), y: anchor.y + Math.round(heightStart + yIndex), z: anchor.z + direction.z * -1 + Math.round(perpendicular.z * (widthStart + xIndex)) };
  });
}

export function planDecorationPlacement(project: ProjectDocument, active: { readonly kind: DecorationKind; readonly variantId?: string; readonly item?: import('../decoration.types').DecorationItemStack; readonly fixed?: boolean }, support: VoxelCoordinate, facing: DecorationFacing, random = Math.random): DecorationPlacementPlan {
  const anchor = decorationAnchorFromSupport(support, facing);
  if (active.kind === 'painting' && !['north', 'south', 'east', 'west'].includes(facing)) return { status: 'invalid', reason: 'unsupported-face' };
  const variant = active.kind === 'painting' ? paintingVariant(active.variantId) ?? chooseRandomPaintingVariant(facing === 'north' || facing === 'south' ? project.size.x : project.size.z, project.size.y, random) : undefined;
  if (active.kind === 'painting' && !variant) return { status: 'invalid', reason: 'out-of-bounds' };
  const entityTypeId = active.kind === 'painting' ? 'minecraft:painting' : active.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow_item_frame';
  const decoration: PlacedDecoration = { instanceId: 'preview', kind: active.kind, entityTypeId, anchor, facing, ...(variant ? { variantId: variant.id } : {}), ...(active.item ? { item: active.item } : {}), ...(active.kind !== 'painting' ? { rotation: 0, invisible: false, fixed: active.fixed ?? false, itemDropChance: 1 } : {}) };
  if (!decorationInBounds(anchor, project.size)) return { status: 'invalid', reason: 'out-of-bounds', decoration };
  const supportExists = project.blocks.some((block) => sameCoordinate(block.position, support));
  if (!supportsDecoration(active.kind, facing, supportExists, active.fixed)) return { status: 'invalid', reason: 'missing-support', decoration };
  if (variant && paintingSupportFootprint(anchor, facing, variant).some((position) => !project.blocks.some((block) => sameCoordinate(block.position, position)))) return { status: 'invalid', reason: 'missing-support', decoration };
  const aabb = decorationAabb(decoration);
  if (project.blocks.some((block) => aabb.min.x < block.position.x + 1 && aabb.max.x > block.position.x && aabb.min.y < block.position.y + 1 && aabb.max.y > block.position.y && aabb.min.z < block.position.z + 1 && aabb.max.z > block.position.z && !sameCoordinate(block.position, support))) return { status: 'invalid', reason: 'blocked-by-block', decoration };
  if ((project.decorations ?? []).some((entry) => decorationOverlaps(aabb, decorationAabb(entry)))) return { status: 'invalid', reason: 'overlap-decoration', decoration };
  return { status: 'valid', decoration };
}

export function supportsDecoration(kind: DecorationKind, facing: DecorationFacing, supportExists: boolean, fixed = false): boolean {
  if (fixed && (kind === 'item-frame' || kind === 'glow-item-frame')) return true;
  if (kind === 'painting') return supportExists && ['north', 'south', 'east', 'west'].includes(facing);
  return supportExists;
}

export function decorationOverlaps(a: DecorationAabb, b: DecorationAabb): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z;
}

export function pruneInvalidDecorations(project: ProjectDocument): ProjectDocument {
  const decorations = project.decorations ?? [];
  const kept = decorations.filter((decoration, index) => {
    if (decoration.fixed && (decoration.kind === 'item-frame' || decoration.kind === 'glow-item-frame')) return true;
    if (!decorationInBounds(decoration.anchor, project.size)) return false;
    const direction = directionVector(decoration.facing);
    const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z };
    const supportExists = project.blocks.some((block) => sameCoordinate(block.position, support));
    if (!supportsDecoration(decoration.kind, decoration.facing, supportExists, decoration.fixed)) return false;
    const variant = decoration.kind === 'painting' ? paintingVariant(decoration.variantId) : undefined;
    if (variant && paintingSupportFootprint(decoration.anchor, decoration.facing, variant).some((position) => !project.blocks.some((block) => sameCoordinate(block.position, position)))) return false;
    const aabb = decorationAabb(decoration);
    if (project.blocks.some((block) => !sameCoordinate(block.position, support) && aabb.min.x < block.position.x + 1 && aabb.max.x > block.position.x && aabb.min.y < block.position.y + 1 && aabb.max.y > block.position.y && aabb.min.z < block.position.z + 1 && aabb.max.z > block.position.z)) return false;
    return !decorations.some((other, otherIndex) => index !== otherIndex && decorationOverlaps(aabb, decorationAabb(other)));
  });
  return kept.length === decorations.length ? project : { ...project, decorations: kept };
}

function sameCoordinate(a: VoxelCoordinate, b: VoxelCoordinate): boolean { return a.x === b.x && a.y === b.y && a.z === b.z; }

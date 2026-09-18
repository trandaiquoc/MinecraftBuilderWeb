import { isWithinBounds } from '../domain/coordinates';
import { PlacedBlock, ProjectSize, VoxelCoordinate } from '../domain/project.types';

export type PlacementStatus = 'valid' | 'warning' | 'invalid' | 'unknown';

export interface FaceNormal { readonly x: number; readonly y: number; readonly z: number; }
export type HorizontalDirection = 'north' | 'east' | 'south' | 'west';
export interface PlacementContext {
  readonly faceNormal?: FaceNormal;
  readonly hitPoint?: { readonly x: number; readonly y: number; readonly z: number };
  readonly facing?: HorizontalDirection;
  /** Camera yaw in degrees, matching the player's horizontal placement direction. */
  readonly yaw?: number;
  readonly stateOverride?: Readonly<Record<string, string>>;
}
export interface AttachmentPlacementResult { readonly target: VoxelCoordinate; readonly stateOverride: Readonly<Record<string, string>>; readonly snapType: 'chain-extension' | 'chain-lantern' | 'hanging-sign-chain' | 'hanging-sign-stack'; }
export interface ProjectGridBounds { readonly min: VoxelCoordinate; readonly maxEdge: VoxelCoordinate; readonly maxVoxel: VoxelCoordinate; }

export function projectGridBounds(size: ProjectSize): ProjectGridBounds {
  return {
    min: { x: 0, y: 0, z: 0 },
    maxEdge: { x: size.x, y: size.y, z: size.z },
    maxVoxel: { x: size.x - 1, y: size.y - 1, z: size.z - 1 },
  };
}

export function targetFromBlockFace(block: VoxelCoordinate, normal: FaceNormal): VoxelCoordinate {
  return { x: block.x + Math.sign(normal.x), y: block.y + Math.sign(normal.y), z: block.z + Math.sign(normal.z) };
}

export function targetFromGridHit(point: { readonly x: number; readonly z: number }): VoxelCoordinate {
  return { x: Math.floor(point.x), y: 0, z: Math.floor(point.z) };
}

export function targetFromEditingPlaneHit(point: { readonly x: number; readonly z: number }, currentY: number, size: ProjectSize): VoxelCoordinate | undefined {
  const target = { x: Math.floor(point.x), y: Math.trunc(currentY), z: Math.floor(point.z) };
  return isWithinBounds(target, size) ? target : undefined;
}

export function normalizeVoxelCoordinate(position: VoxelCoordinate): VoxelCoordinate {
  return { x: Math.trunc(position.x), y: Math.trunc(position.y), z: Math.trunc(position.z) };
}

export function lanternChainAttachmentTarget(activeBlockId: string | undefined, hitPosition: VoxelCoordinate, blocks: readonly PlacedBlock[]): VoxelCoordinate | undefined {
  return resolveAttachmentPlacement(activeBlockId, hitPosition, undefined, blocks)?.target;
}

/** Reusable attachment policy; bounds/occupancy are deliberately validated by the normal placement flow. */
export function resolveAttachmentPlacement(activeBlockId: string | undefined, hitPosition: VoxelCoordinate, hitPoint: { readonly y: number } | undefined, blocks: readonly PlacedBlock[]): AttachmentPlacementResult | undefined {
  const hit = blocks.find((block) => block.position.x === hitPosition.x && block.position.y === hitPosition.y && block.position.z === hitPosition.z);
  const isHangingSign = activeBlockId?.startsWith('minecraft:') && activeBlockId.endsWith('_hanging_sign') && !activeBlockId.includes('_wall_hanging_sign');
  if (isHangingSign && hit?.id === 'minecraft:chain' && hit.state['axis'] === 'y') return { target: { x: hitPosition.x, y: hitPosition.y - 1, z: hitPosition.z }, stateOverride: {}, snapType: 'hanging-sign-chain' };
  if (isHangingSign && hit?.id.startsWith('minecraft:') && hit.id.endsWith('_hanging_sign') && !hit.id.includes('_wall_hanging_sign')) return { target: { x: hitPosition.x, y: hitPosition.y - 1, z: hitPosition.z }, stateOverride: {}, snapType: 'hanging-sign-stack' };
  if (hit?.id !== 'minecraft:chain' || hit.state['axis'] !== 'y') return undefined;
  if (activeBlockId === 'minecraft:chain') {
    const direction = hitPoint && hitPoint.y < hitPosition.y + .5 ? -1 : 1;
    return { target: { x: hitPosition.x, y: hitPosition.y + direction, z: hitPosition.z }, stateOverride: { axis: 'y' }, snapType: 'chain-extension' };
  }
  if (activeBlockId === 'minecraft:lantern' || activeBlockId === 'minecraft:soul_lantern') return { target: { x: hitPosition.x, y: hitPosition.y - 1, z: hitPosition.z }, stateOverride: { hanging: 'true' }, snapType: 'chain-lantern' };
  return undefined;
}

export function placementStatus(target: VoxelCoordinate | undefined, size: ProjectSize, support: 'full' | 'partial' | 'fallback' | 'unknown' = 'full'): PlacementStatus {
  if (!target || !isWithinBounds(target, size)) return 'invalid';
  if (support === 'unknown') return 'unknown';
  if (support === 'partial' || support === 'fallback') return 'warning';
  return 'valid';
}

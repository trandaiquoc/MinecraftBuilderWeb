import type { VoxelCoordinate } from '../../domain/project.types';
import type {
  FluidRenderResolver,
  FluidWorldLookup,
  ResolvedFluidRenderState,
} from './fluid-state';

export type FluidFaceDirection = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

const offsets: Readonly<Record<FluidFaceDirection, VoxelCoordinate>> = {
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
};

function neighborPosition(
  position: VoxelCoordinate,
  direction: FluidFaceDirection,
): VoxelCoordinate {
  const offset = offsets[direction];
  return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z };
}

/**
 * Mirrors the conservative part of LiquidBlockRenderer face visibility:
 * connected fluid is hidden, confirmed full opaque cubes hide their shared
 * face, and all partial/unknown geometry remains visible.
 */
export function shouldCullFluidFace(
  position: VoxelCoordinate,
  direction: FluidFaceDirection,
  state: ResolvedFluidRenderState,
  world: FluidWorldLookup,
  resolver: FluidRenderResolver,
): boolean {
  const neighbor = world.getBlock(neighborPosition(position, direction));
  const neighborFluid = resolver.resolve(neighbor, world);
  if (neighborFluid?.connectivityKey === state.connectivityKey) return true;
  return neighbor !== undefined && world.getOcclusionClass?.(neighbor) === 'opaque-full-cube';
}

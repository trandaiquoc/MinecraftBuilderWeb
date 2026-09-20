import { PlacedBlock, ProjectSize, VoxelCoordinate } from '../../domain/project.types';

export type CameraPreset = 'perspective' | 'top' | 'front' | 'back' | 'left' | 'right';

export interface CameraVector { readonly x: number; readonly y: number; readonly z: number; }
export interface CameraState { readonly position: CameraVector; readonly target: CameraVector; readonly up: CameraVector; }
export interface CameraBounds { readonly min: CameraVector; readonly max: CameraVector; }

export function projectCameraBounds(size: ProjectSize): CameraBounds {
  return { min: { x: 0, y: 0, z: 0 }, max: { x: size.x, y: size.y, z: size.z } };
}

export function structureCameraBounds(blocks: readonly PlacedBlock[]): CameraBounds | undefined {
  if (!blocks.length) return undefined;
  return blocks.reduce<CameraBounds>((bounds, block) => ({
    min: { x: Math.min(bounds.min.x, block.position.x), y: Math.min(bounds.min.y, block.position.y), z: Math.min(bounds.min.z, block.position.z) },
    max: { x: Math.max(bounds.max.x, block.position.x + 1), y: Math.max(bounds.max.y, block.position.y + 1), z: Math.max(bounds.max.z, block.position.z + 1) },
  }), { min: { ...blocks[0].position }, max: { x: blocks[0].position.x + 1, y: blocks[0].position.y + 1, z: blocks[0].position.z + 1 } });
}

export function cameraBoundsCenter(bounds: CameraBounds): CameraVector {
  return { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
}

export function selectedVoxelCenter(position: VoxelCoordinate): CameraVector {
  return { x: position.x + .5, y: position.y + .5, z: position.z + .5 };
}

export function voxelCameraBounds(positions: readonly VoxelCoordinate[]): CameraBounds | undefined {
  if (!positions.length) return undefined;
  return positions.reduce<CameraBounds>((bounds, position) => ({
    min: { x: Math.min(bounds.min.x, position.x), y: Math.min(bounds.min.y, position.y), z: Math.min(bounds.min.z, position.z) },
    max: { x: Math.max(bounds.max.x, position.x + 1), y: Math.max(bounds.max.y, position.y + 1), z: Math.max(bounds.max.z, position.z + 1) },
  }), { min: { ...positions[0] }, max: { x: positions[0].x + 1, y: positions[0].y + 1, z: positions[0].z + 1 } });
}

export function cameraDistanceForBounds(bounds: CameraBounds, verticalFovDegrees: number, aspect: number): number {
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const depth = bounds.max.z - bounds.min.z;
  const verticalFov = verticalFovDegrees * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, .1));
  const verticalDistance = Math.max(height, depth) / (2 * Math.tan(verticalFov / 2));
  const horizontalDistance = Math.max(width, depth) / (2 * Math.tan(horizontalFov / 2));
  return Math.max(4, verticalDistance, horizontalDistance) * 1.35;
}

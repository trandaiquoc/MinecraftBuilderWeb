import { ProjectSize, VoxelCoordinate } from './project.types';

export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function isPositiveInteger(value: number): boolean {
  return isInteger(value) && value > 0;
}

export function isWithinBounds(position: VoxelCoordinate, size: ProjectSize): boolean {
  return (
    isInteger(position.x) &&
    isInteger(position.y) &&
    isInteger(position.z) &&
    position.x >= 0 &&
    position.x < size.x &&
    position.y >= 0 &&
    position.y < size.y &&
    position.z >= 0 &&
    position.z < size.z
  );
}

export function coordinateKey(position: VoxelCoordinate): string {
  return `${position.x},${position.y},${position.z}`;
}

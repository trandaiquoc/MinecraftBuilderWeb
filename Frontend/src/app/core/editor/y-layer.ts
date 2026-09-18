import { PlacedBlock, ProjectSize, VoxelCoordinate } from '../domain/project.types';

export type YLayerVisibility = 'current-only' | 'current-previous' | 'current-next' | 'previous-current-next' | 'all-below' | 'whole-structure';

export function occupiedLayers(blocks: readonly PlacedBlock[]): readonly number[] {
  return [...new Set(blocks.map((block) => block.position.y))].sort((a, b) => a - b);
}

export function clampLayer(y: number, size: ProjectSize): number { return Math.min(Math.max(Math.trunc(y), 0), Math.max(size.y - 1, 0)); }

export function adjacentOccupiedLayer(currentY: number, blocks: readonly PlacedBlock[], direction: -1 | 1): number {
  const layers = occupiedLayers(blocks).filter((y) => direction < 0 ? y < currentY : y > currentY);
  return direction < 0 ? layers.at(-1) ?? currentY : layers[0] ?? currentY;
}

export function jumpOccupiedLayer(blocks: readonly PlacedBlock[], currentY: number, target: 'first' | 'last'): number {
  const layers = occupiedLayers(blocks);
  return target === 'first' ? layers[0] ?? currentY : layers.at(-1) ?? currentY;
}

export function visibleLayerSet(currentY: number, blocks: readonly PlacedBlock[], mode: YLayerVisibility): ReadonlySet<number> {
  switch (mode) {
    case 'current-only': return new Set([currentY]);
    case 'current-previous': return new Set([currentY, currentY - 1]);
    case 'current-next': return new Set([currentY, currentY + 1]);
    case 'previous-current-next': return new Set([currentY - 1, currentY, currentY + 1]);
    case 'all-below': return new Set(blocks.map((block) => block.position.y).filter((y) => y <= currentY));
    case 'whole-structure': return new Set(blocks.map((block) => block.position.y));
  }
}

export function blocksForLayers(blocks: readonly PlacedBlock[], currentY: number, mode: YLayerVisibility): readonly PlacedBlock[] {
  const visible = visibleLayerSet(currentY, blocks, mode);
  return blocks.filter((block) => visible.has(block.position.y));
}

export function layerCoordinate(x: number, y: number, z: number, size: ProjectSize): VoxelCoordinate | undefined {
  const coordinate = { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  return coordinate.x >= 0 && coordinate.y >= 0 && coordinate.z >= 0 && coordinate.x < size.x && coordinate.y < size.y && coordinate.z < size.z ? coordinate : undefined;
}

import { PlacedBlock, ProjectSize, VoxelCoordinate } from '../../domain/project.types';

export interface LayerBlockIndex {
  readonly blocksAtY: (y: number) => readonly PlacedBlock[];
  readonly occupiedLayers: () => readonly number[];
  readonly allBlocks: () => readonly PlacedBlock[];
}

export interface YLayerProjectionDelta {
  readonly changedLayers: readonly number[];
  readonly changed: boolean;
}

export function planYLayerProjectionDelta(previousY: number | undefined, previousMode: YLayerVisibility | undefined, nextY: number | undefined, nextMode: YLayerVisibility | undefined): YLayerProjectionDelta {
  if (previousY === nextY && previousMode === nextMode) return { changedLayers: [], changed: false };
  if (previousY === undefined || nextY === undefined || previousMode === undefined || nextMode === undefined || previousMode !== nextMode) return { changedLayers: [], changed: true };
  const affected = (y: number, mode: YLayerVisibility): readonly number[] => {
    switch (mode) {
      case 'current-only': return [y];
      case 'current-previous': return [y - 1, y];
      case 'current-next': return [y, y + 1];
      case 'previous-current-next': return [y - 1, y, y + 1];
      case 'all-below':
      case 'whole-structure': return [y];
    }
  };
  return { changedLayers: [...new Set([...affected(previousY, previousMode), ...affected(nextY, nextMode)])], changed: true };
}

export type YLayerVisibility = 'current-only' | 'current-previous' | 'current-next' | 'previous-current-next' | 'all-below' | 'whole-structure';

export function occupiedLayers(blocks: readonly PlacedBlock[], index?: LayerBlockIndex): readonly number[] {
  if (index) return index.occupiedLayers();
  return [...new Set(blocks.map((block) => block.position.y))].sort((a, b) => a - b);
}

export function clampLayer(y: number, size: ProjectSize): number { return Math.min(Math.max(Math.trunc(y), 0), Math.max(size.y - 1, 0)); }

export function adjacentOccupiedLayer(currentY: number, blocks: readonly PlacedBlock[], direction: -1 | 1, index?: LayerBlockIndex): number {
  const layers = occupiedLayers(blocks, index).filter((y) => direction < 0 ? y < currentY : y > currentY);
  return direction < 0 ? layers.at(-1) ?? currentY : layers[0] ?? currentY;
}

export function jumpOccupiedLayer(blocks: readonly PlacedBlock[], currentY: number, target: 'first' | 'last', index?: LayerBlockIndex): number {
  const layers = occupiedLayers(blocks, index);
  return target === 'first' ? layers[0] ?? currentY : layers.at(-1) ?? currentY;
}

export function visibleLayerSet(currentY: number, blocks: readonly PlacedBlock[], mode: YLayerVisibility, index?: LayerBlockIndex): ReadonlySet<number> {
  switch (mode) {
    case 'current-only': return new Set([currentY]);
    case 'current-previous': return new Set([currentY, currentY - 1]);
    case 'current-next': return new Set([currentY, currentY + 1]);
    case 'previous-current-next': return new Set([currentY - 1, currentY, currentY + 1]);
    case 'all-below': return new Set(occupiedLayers(blocks, index).filter((y) => y <= currentY));
    case 'whole-structure': return new Set(occupiedLayers(blocks, index));
  }
}

export function blocksForLayers(blocks: readonly PlacedBlock[], currentY: number, mode: YLayerVisibility, index?: LayerBlockIndex): readonly PlacedBlock[] {
  if (mode === 'whole-structure') return index?.allBlocks() ?? blocks;
  if (mode === 'all-below' && !index) return blocks.filter((block) => block.position.y <= currentY);
  if (index) {
    const layers = visibleLayerSet(currentY, blocks, mode, index);
    return [...layers].flatMap((layer) => index.blocksAtY(layer));
  }
  const visible = visibleLayerSet(currentY, blocks, mode);
  return blocks.filter((block) => visible.has(block.position.y));
}

export function layerCoordinate(x: number, y: number, z: number, size: ProjectSize): VoxelCoordinate | undefined {
  const coordinate = { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  return coordinate.x >= 0 && coordinate.y >= 0 && coordinate.z >= 0 && coordinate.x < size.x && coordinate.y < size.y && coordinate.z < size.z ? coordinate : undefined;
}

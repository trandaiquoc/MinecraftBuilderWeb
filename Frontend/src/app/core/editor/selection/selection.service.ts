import { Injectable, signal } from '@angular/core';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import {
  expandLogicalObjectClosure,
  resolveLogicalObjectPartsFromLookup,
} from '../../block-behavior/logical-objects/logical-object';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import {
  IndexedVoxelSelectionQuery,
  VoxelBox,
  exposedSurfaceSelectionSeedsFromLookup,
  voxelInBox,
} from './selection';
import type { FaceNormal } from '../placement/placement';
import {
  defaultProjectBlockRuntimeIndex,
  ProjectBlockRuntimeIndex,
} from '../runtime/project-block-runtime-index';

export type SelectionKind = 'none' | 'single' | 'explicit' | 'box' | 'all';
export interface SelectionRenderState {
  readonly kind: SelectionKind;
  readonly count: number;
  readonly positions: readonly VoxelCoordinate[];
  readonly bounds?: VoxelBox;
}

@Injectable({ providedIn: 'root' })
export class SelectionService {
  constructor(
    private readonly runtimeIndex: ProjectBlockRuntimeIndex = defaultProjectBlockRuntimeIndex,
  ) {}
  readonly single = signal<VoxelCoordinate | undefined>(undefined);
  readonly box = signal<VoxelBox | undefined>(undefined);
  readonly logicalPositions = signal<readonly VoxelCoordinate[]>([]);
  readonly kind = signal<SelectionKind>('none');
  private readonly allBounds = signal<VoxelBox | undefined>(undefined);
  private allBoundsBlocks?: readonly PlacedBlock[];
  private boxResolution?: 'positions' | 'compact';
  private compactSelectionKeys?: ReadonlySet<string>;
  select(position: VoxelCoordinate): void {
    this.single.set({ ...position });
    this.box.set(undefined);
    this.logicalPositions.set([{ ...position }]);
    this.kind.set('single');
    this.allBounds.set(undefined);
    this.allBoundsBlocks = undefined;
    this.resetBoxResolution();
  }
  selectLogical(
    position: VoxelCoordinate,
    project: ProjectDocument,
    definition: (id: string) => BlockDefinition | undefined,
  ): void {
    this.runtimeIndex.ensure(project);
    this.single.set({ ...position });
    this.box.set(undefined);
    this.logicalPositions.set(
      resolveLogicalObjectPartsFromLookup(this.runtimeIndex, position, definition).map((block) => ({
        ...block.position,
      })),
    );
    this.kind.set('explicit');
    this.allBounds.set(undefined);
    this.allBoundsBlocks = undefined;
    this.resetBoxResolution();
  }
  selectBox(box: VoxelBox): void {
    this.single.set(undefined);
    this.box.set({ min: { ...box.min }, max: { ...box.max } });
    this.logicalPositions.set([]);
    this.kind.set('box');
    this.allBounds.set(undefined);
    this.allBoundsBlocks = undefined;
    this.boxResolution = 'positions';
    this.compactSelectionKeys = undefined;
  }
  selectBoxLogical(
    box: VoxelBox,
    project: ProjectDocument,
    definition: (id: string) => BlockDefinition | undefined,
    isVisible: (block: PlacedBlock) => boolean = () => true,
  ): void {
    this.runtimeIndex.ensure(project);
    const seeds = this.runtimeIndex.blocksInBox(box).filter(isVisible);
    const closure = expandLogicalObjectClosure(this.runtimeIndex, seeds, definition);
    this.setBoxSelection(box, closure);
  }
  selectMarqueeLogical(
    query: IndexedVoxelSelectionQuery | undefined,
    project: ProjectDocument,
    definition: (id: string) => BlockDefinition | undefined,
    isVisible: (block: PlacedBlock) => boolean = () => true,
  ): void {
    if (!query) {
      this.clear();
      return;
    }
    this.runtimeIndex.ensure(project);
    const seeds: PlacedBlock[] = [];
    this.runtimeIndex.visitBlocksInBox(query.candidateBounds, (block) => {
      if (query.intersectsVoxel(block.position) && isVisible(block)) seeds.push(block);
    });
    const closure = expandLogicalObjectClosure(this.runtimeIndex, seeds, definition);
    if (!closure.length) {
      this.clear();
      return;
    }
    this.setBoxSelection(undefined, closure);
  }
  selectSurfaceBoxLogical(
    box: VoxelBox,
    normal: FaceNormal,
    project: ProjectDocument,
    definition: (id: string) => BlockDefinition | undefined,
    isVisible: (block: PlacedBlock) => boolean = () => true,
  ): void {
    this.runtimeIndex.ensure(project);
    const seeds = exposedSurfaceSelectionSeedsFromLookup(
      this.runtimeIndex.blocksInBox(box),
      (position) => this.runtimeIndex.get(position),
      box,
      normal,
      isVisible,
    );
    const closure = expandLogicalObjectClosure(this.runtimeIndex, seeds, definition);
    this.setBoxSelection(box, closure);
  }
  selectAll(
    project: ProjectDocument,
    definition: (id: string) => BlockDefinition | undefined,
  ): void {
    this.single.set(undefined);
    this.box.set(undefined);
    // All project blocks are already selected; resolving every logical pair here only
    // creates duplicate coordinate objects and makes Ctrl+A scale poorly.
    // Keep the familiar explicit signal for tiny projects; large projects use
    // the compact all predicate and never clone every coordinate.
    if (project.blocks.length <= DETAILED_SELECTION_LIMIT) {
      this.logicalPositions.set(project.blocks.map((block) => ({ ...block.position })));
      this.kind.set('explicit');
    } else {
      this.logicalPositions.set([]);
      this.kind.set('all');
    }
    this.allBounds.set(boundsOf(project.blocks));
    this.allBoundsBlocks = project.blocks;
    this.resetBoxResolution();
  }
  clear(): void {
    this.single.set(undefined);
    this.box.set(undefined);
    this.logicalPositions.set([]);
    this.kind.set('none');
    this.allBounds.set(undefined);
    this.allBoundsBlocks = undefined;
    this.resetBoxResolution();
  }
  clearIf(position: VoxelCoordinate): void {
    const selected = this.single();
    if (
      this.kind() === 'all' ||
      (selected?.x === position.x && selected.y === position.y && selected.z === position.z) ||
      this.compactSelectionKeys?.has(coordinateKey(position)) === true ||
      this.logicalPositions().some(
        (entry) => entry.x === position.x && entry.y === position.y && entry.z === position.z,
      )
    )
      this.clear();
  }
  hasAny(project?: ProjectDocument): boolean {
    const kind = this.kind();
    if (kind === 'all') return (project?.blocks.length ?? 0) > 0;
    if (project) return this.count(project) > 0;
    return this.count() > 0;
  }
  selectedBlocks(project: ProjectDocument): readonly PlacedBlock[] {
    const kind = this.kind();
    if (kind === 'all') return project.blocks;
    if (kind === 'box') {
      if (this.boxResolution === 'compact') {
        this.runtimeIndex.ensure(project);
        return this.blocksForKeys(this.compactSelectionKeys);
      }
      if (!this.logicalPositions().length) return [];
      this.runtimeIndex.ensure(project);
      return this.blocksForPositions(this.logicalPositions());
    }
    if (this.logicalPositions().length) {
      this.runtimeIndex.ensure(project);
      return this.blocksForPositions(this.logicalPositions());
    }
    const selected = this.single();
    if (!selected) return [];
    this.runtimeIndex.ensure(project);
    const block = this.runtimeIndex.get(selected);
    return block ? [block] : [];
  }
  expandLogicalSelection(
    project: ProjectDocument,
    selected: readonly PlacedBlock[],
    definition: (id: string) => BlockDefinition | undefined,
  ): readonly PlacedBlock[] {
    this.runtimeIndex.ensure(project);
    return expandLogicalObjectClosure(this.runtimeIndex, selected, definition);
  }
  count(project?: ProjectDocument): number {
    if (!project) {
      if (this.kind() === 'all') return this.allBoundsBlocks?.length ?? 0;
      if (this.kind() === 'box' && this.boxResolution === 'compact')
        return this.compactSelectionKeys?.size ?? 0;
      return this.logicalPositions().length || (this.single() ? 1 : 0);
    }
    if (this.kind() === 'all') return project.blocks.length;
    if (this.kind() === 'box' && this.boxResolution === 'compact') {
      this.runtimeIndex.ensure(project);
      return this.countKeys(this.compactSelectionKeys);
    }
    if (this.logicalPositions().length) {
      this.runtimeIndex.ensure(project);
      return this.countPositions(this.logicalPositions());
    }
    const selected = this.single();
    if (!selected) return 0;
    this.runtimeIndex.ensure(project);
    return selected && this.runtimeIndex.has(selected) ? 1 : 0;
  }
  bounds(project?: ProjectDocument): VoxelBox | undefined {
    const kind = this.kind();
    if (kind === 'all') {
      if (!project) return this.allBounds();
      if (this.allBoundsBlocks !== project.blocks) {
        this.allBounds.set(boundsOf(project.blocks));
        this.allBoundsBlocks = project.blocks;
      }
      return this.allBounds();
    }
    if (project && this.needsRuntimeIndex()) this.runtimeIndex.ensure(project);
    return this.selectionBounds();
  }
  renderState(project?: ProjectDocument): SelectionRenderState {
    const kind = this.kind();
    const positions = kind === 'all' ? [] : this.logicalPositions();
    if (!project) return { kind, count: this.count(), positions, bounds: this.bounds() };
    if (kind === 'all')
      return {
        kind,
        count: this.count(project),
        positions,
        bounds: this.bounds(project),
      };
    return {
      kind,
      count: this.count(project),
      positions,
      bounds: this.bounds(project),
    };
  }

  private resetBoxResolution(): void {
    this.boxResolution = undefined;
    this.compactSelectionKeys = undefined;
  }

  private needsRuntimeIndex(): boolean {
    return (
      (this.kind() === 'box' && this.boxResolution === 'compact') ||
      this.logicalPositions().length > 0 ||
      !!this.single()
    );
  }

  private setBoxSelection(box: VoxelBox | undefined, blocks: readonly PlacedBlock[]): void {
    const compact = blocks.length > DETAILED_SELECTION_LIMIT;
    this.single.set(undefined);
    this.box.set(box ? { min: { ...box.min }, max: { ...box.max } } : undefined);
    const positions: VoxelCoordinate[] = [];
    const keys = compact ? new Set<string>() : undefined;
    for (const block of blocks) {
      if (!compact || (!!box && !voxelInBox(block.position, box)))
        positions.push({ ...block.position });
      keys?.add(coordinateKey(block.position));
    }
    this.logicalPositions.set(positions);
    this.kind.set('box');
    this.allBounds.set(undefined);
    this.allBoundsBlocks = undefined;
    this.boxResolution = compact ? 'compact' : 'positions';
    this.compactSelectionKeys = keys;
  }

  private blocksForPositions(positions: readonly VoxelCoordinate[]): readonly PlacedBlock[] {
    return positions
      .map((position) => this.runtimeIndex.get(position))
      .filter((block): block is PlacedBlock => !!block);
  }

  private blocksForKeys(keys: ReadonlySet<string> | undefined): readonly PlacedBlock[] {
    if (!keys?.size) return [];
    const blocks: PlacedBlock[] = [];
    for (const key of keys) {
      const block = this.runtimeIndex.get(coordinateFromKey(key));
      if (block) blocks.push(block);
    }
    return blocks;
  }

  private countKeys(keys: ReadonlySet<string> | undefined): number {
    if (!keys?.size) return 0;
    let count = 0;
    for (const key of keys) if (this.runtimeIndex.has(coordinateFromKey(key))) count += 1;
    return count;
  }

  private countPositions(positions: readonly VoxelCoordinate[]): number {
    let count = 0;
    for (const position of positions) if (this.runtimeIndex.has(position)) count += 1;
    return count;
  }

  private selectionBounds(): VoxelBox | undefined {
    if (this.kind() === 'box' && this.boxResolution === 'compact') {
      return this.boundsForKeys(this.compactSelectionKeys);
    }
    const positions = this.logicalPositions();
    if (positions.length) return boundsFromPositions(this.positionsForCoordinates(positions));
    const selected = this.single();
    return selected && this.runtimeIndex.has(selected)
      ? { min: selected, max: selected }
      : undefined;
  }

  private boundsForKeys(keys: ReadonlySet<string> | undefined): VoxelBox | undefined {
    return keys?.size ? boundsFromPositions(this.positionsForKeys(keys)) : undefined;
  }

  private *positionsForKeys(keys: ReadonlySet<string>): Iterable<VoxelCoordinate> {
    for (const key of keys) {
      const block = this.runtimeIndex.get(coordinateFromKey(key));
      if (block) yield block.position;
    }
  }

  private *positionsForCoordinates(
    positions: readonly VoxelCoordinate[],
  ): Iterable<VoxelCoordinate> {
    for (const position of positions) {
      const block = this.runtimeIndex.get(position);
      if (block) yield block.position;
    }
  }
}

function boundsOf(blocks: readonly { readonly position: VoxelCoordinate }[]): VoxelBox | undefined {
  if (!blocks.length) return undefined;
  let minX = blocks[0].position.x;
  let minY = blocks[0].position.y;
  let minZ = blocks[0].position.z;
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;
  for (let index = 1; index < blocks.length; index += 1) {
    const position = blocks[index].position;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function boundsFromPositions(positions: Iterable<VoxelCoordinate>): VoxelBox | undefined {
  let hasPosition = false;
  let minX = 0;
  let minY = 0;
  let minZ = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const position of positions) {
    if (!hasPosition) {
      minX = maxX = position.x;
      minY = maxY = position.y;
      minZ = maxZ = position.z;
      hasPosition = true;
      continue;
    }
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return hasPosition
    ? { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
    : undefined;
}

function coordinateKey(position: VoxelCoordinate): string {
  return `${position.x},${position.y},${position.z}`;
}

function coordinateFromKey(key: string): VoxelCoordinate {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}
const DETAILED_SELECTION_LIMIT = 256;

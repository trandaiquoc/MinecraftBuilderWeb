import { Injectable, signal } from '@angular/core';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { expandLogicalObjectClosure, resolveLogicalObjectParts } from '../../block-behavior/logical-objects/logical-object';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { VoxelBox, exposedSurfaceSelectionSeeds, voxelInBox } from './selection';
import type { FaceNormal } from '../placement/placement';

export type SelectionKind = 'none' | 'single' | 'explicit' | 'box' | 'all';
export interface SelectionRenderState {
  readonly kind: SelectionKind;
  readonly count: number;
  readonly positions: readonly VoxelCoordinate[];
  readonly bounds?: VoxelBox;
}

@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly single = signal<VoxelCoordinate | undefined>(undefined);
  readonly box = signal<VoxelBox | undefined>(undefined);
  readonly logicalPositions = signal<readonly VoxelCoordinate[]>([]);
  readonly kind = signal<SelectionKind>('none');
  private readonly allBounds = signal<VoxelBox | undefined>(undefined);
  select(position: VoxelCoordinate): void { this.single.set({ ...position }); this.box.set(undefined); this.logicalPositions.set([{ ...position }]); this.kind.set('single'); this.allBounds.set(undefined); }
  selectLogical(position: VoxelCoordinate, project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void { this.single.set({ ...position }); this.box.set(undefined); this.logicalPositions.set(resolveLogicalObjectParts(project.blocks, position, definition).map((block) => ({ ...block.position }))); this.kind.set('explicit'); this.allBounds.set(undefined); }
  selectBox(box: VoxelBox): void { this.single.set(undefined); this.box.set({ min: { ...box.min }, max: { ...box.max } }); this.logicalPositions.set([]); this.kind.set('box'); this.allBounds.set(undefined); }
  selectBoxLogical(box: VoxelBox, project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void { const seeds = project.blocks.filter((block) => voxelInBox(block.position, box)); this.single.set(undefined); this.box.set({ min: { ...box.min }, max: { ...box.max } }); this.logicalPositions.set(expandLogicalObjectClosure(project.blocks, seeds, definition).map((block) => ({ ...block.position }))); this.kind.set('box'); this.allBounds.set(undefined); }
  selectSurfaceBoxLogical(box: VoxelBox, normal: FaceNormal, project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined, isVisible: (block: PlacedBlock) => boolean = () => true): void {
    const seeds = exposedSurfaceSelectionSeeds(project.blocks, box, normal, isVisible);
    this.single.set(undefined);
    this.box.set({ min: { ...box.min }, max: { ...box.max } });
    this.logicalPositions.set(expandLogicalObjectClosure(project.blocks, seeds, definition).map((block) => ({ ...block.position })));
    this.kind.set('box');
    this.allBounds.set(undefined);
  }
  selectAll(project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void {
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
  }
  clear(): void { this.single.set(undefined); this.box.set(undefined); this.logicalPositions.set([]); this.kind.set('none'); this.allBounds.set(undefined); }
  clearIf(position: VoxelCoordinate): void {
    const selected = this.single();
    if (this.kind() === 'all' || selected?.x === position.x && selected.y === position.y && selected.z === position.z || this.logicalPositions().some((entry) => entry.x === position.x && entry.y === position.y && entry.z === position.z)) this.clear();
  }
  hasAny(project?: ProjectDocument): boolean {
    const kind = this.kind();
    if (kind === 'all') return (project?.blocks.length ?? 0) > 0;
    return kind !== 'none' && (this.logicalPositions().length > 0 || !!this.single() || !!this.box());
  }
  selectedBlocks(project: ProjectDocument): readonly PlacedBlock[] {
    const kind = this.kind();
    if (kind === 'all') return project.blocks;
    if (kind === 'box') {
      const box = this.box();
      if (!box) return [];
      if (this.logicalPositions().length) {
        const keys = new Set(this.logicalPositions().map((position) => coordinateKey(position)));
        return project.blocks.filter((block) => keys.has(coordinateKey(block.position)));
      }
      return project.blocks.filter((block) => voxelInBox(block.position, box));
    }
    if (this.logicalPositions().length) {
      const keys = new Set(this.logicalPositions().map((position) => coordinateKey(position)));
      return project.blocks.filter((block) => keys.has(coordinateKey(block.position)));
    }
    const selected = this.single();
    return selected ? project.blocks.filter((block) => coordinateKey(block.position) === coordinateKey(selected)) : [];
  }
  count(project?: ProjectDocument): number {
    if (!project) return this.logicalPositions().length;
    return this.selectedBlocks(project).length;
  }
  bounds(project?: ProjectDocument): VoxelBox | undefined {
    const kind = this.kind();
    if (kind === 'all') return this.allBounds() ?? (project ? boundsOf(project.blocks) : undefined);
    const box = this.box();
    if (box && !this.logicalPositions().length) return box;
    const blocks = project ? this.selectedBlocks(project) : this.logicalPositions().map((position) => ({ position } as PlacedBlock));
    return boundsOf(blocks);
  }
  renderState(project?: ProjectDocument): SelectionRenderState {
    const kind = this.kind();
    const positions = kind === 'all' ? [] : this.logicalPositions();
    return { kind, count: this.count(project), positions, bounds: this.bounds(project) };
  }
}

function boundsOf(blocks: readonly { readonly position: VoxelCoordinate }[]): VoxelBox | undefined {
  if (!blocks.length) return undefined;
  let minX = blocks[0].position.x; let minY = blocks[0].position.y; let minZ = blocks[0].position.z;
  let maxX = minX; let maxY = minY; let maxZ = minZ;
  for (let index = 1; index < blocks.length; index += 1) { const position = blocks[index].position; minX = Math.min(minX, position.x); minY = Math.min(minY, position.y); minZ = Math.min(minZ, position.z); maxX = Math.max(maxX, position.x); maxY = Math.max(maxY, position.y); maxZ = Math.max(maxZ, position.z); }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function coordinateKey(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
const DETAILED_SELECTION_LIMIT = 256;

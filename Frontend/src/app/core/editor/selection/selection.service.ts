import { Injectable, signal } from '@angular/core';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { expandLogicalObjectClosure, resolveLogicalObjectParts } from '../../block-behavior/logical-objects/logical-object';
import { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { VoxelBox } from './selection';
import { voxelInBox } from './selection';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly single = signal<VoxelCoordinate | undefined>(undefined);
  readonly box = signal<VoxelBox | undefined>(undefined);
  readonly logicalPositions = signal<readonly VoxelCoordinate[]>([]);
  select(position: VoxelCoordinate): void { this.single.set({ ...position }); this.box.set(undefined); this.logicalPositions.set([{ ...position }]); }
  selectLogical(position: VoxelCoordinate, project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void { this.single.set({ ...position }); this.box.set(undefined); this.logicalPositions.set(resolveLogicalObjectParts(project.blocks, position, definition).map((block) => ({ ...block.position }))); }
  selectBox(box: VoxelBox): void { this.single.set(undefined); this.box.set({ min: { ...box.min }, max: { ...box.max } }); this.logicalPositions.set([]); }
  selectBoxLogical(box: VoxelBox, project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void { const seeds = project.blocks.filter((block) => voxelInBox(block.position, box)); this.single.set(undefined); this.box.set({ min: { ...box.min }, max: { ...box.max } }); this.logicalPositions.set(expandLogicalObjectClosure(project.blocks, seeds, definition).map((block) => ({ ...block.position }))); }
  selectAll(project: ProjectDocument, definition: (id: string) => BlockDefinition | undefined): void {
    this.single.set(undefined);
    this.box.set(undefined);
    this.logicalPositions.set(expandLogicalObjectClosure(project.blocks, project.blocks, definition).map((block) => ({ ...block.position })));
  }
  clear(): void { this.single.set(undefined); this.box.set(undefined); this.logicalPositions.set([]); }
  clearIf(position: VoxelCoordinate): void {
    const selected = this.single();
    if (selected?.x === position.x && selected.y === position.y && selected.z === position.z || this.logicalPositions().some((entry) => entry.x === position.x && entry.y === position.y && entry.z === position.z)) this.clear();
  }
}

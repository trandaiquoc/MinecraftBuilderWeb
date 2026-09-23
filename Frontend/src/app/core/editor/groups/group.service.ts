import { Injectable, computed, inject, signal } from '@angular/core';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, ProjectGroup, VoxelCoordinate } from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { VoxelBox, voxelInBox } from '../selection/selection';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { addGroup, groupIdsOf, hasGroup, isBlockLocked, removeGroup } from './group-membership';
import { nextGroupId, normalizeGroupName } from './group-naming';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { expandLogicalObjectClosure, normalizeLogicalObjectMemberships } from '../../block-behavior/logical-objects/logical-object';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';
import { decorationHasGroup, isDecorationLocked, removeDecorationGroup } from './decoration-membership';
import { decorationAabb, decorationInBounds, decorationOverlaps, directionVector, paintingSupportFootprint, supportsDecoration } from '../../decorations/placement/decoration-placement';
import { paintingVariant, type PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationService } from '../../decorations/decoration.service';

export interface GroupMovePreview { readonly groupId: string; readonly offset: VoxelCoordinate; readonly positions: readonly VoxelCoordinate[]; readonly decorationIds: readonly string[]; readonly valid: boolean; readonly reason?: 'bounds' | 'collision' | 'locked' | 'support'; }

@Injectable({ providedIn: 'root' })
export class GroupService {
  constructor(
    private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService),
    private readonly selection: SelectionService = inject(SelectionService),
    private readonly history: HistoryService = inject(HistoryService),
    private readonly library: BlockLibraryService = inject(BlockLibraryService),
    private readonly decorations?: DecorationService,
  ) {}
  readonly activeGroupId = signal<string | undefined>(undefined);
  readonly isolatedGroupId = signal<string | undefined>(undefined);
  readonly moveOffset = signal<VoxelCoordinate>({ x: 0, y: 0, z: 0 });
  readonly moveStep = signal(1);
  readonly activeGroup = computed(() => this.workspace.project()?.groups.find((group) => group.id === this.activeGroupId()));
  readonly activeGroupPositions = computed(() => this.groupPositions(this.activeGroupId()));
  readonly isolatedGroupPositions = computed(() => this.groupPositions(this.isolatedGroupId()));
  readonly activeGroupBlockCount = computed(() => this.activeGroupPositions().length);
  readonly movePreview = computed(() => { const project = this.workspace.project(); const id = this.activeGroupId(); return project && id ? validateGroupMove(project, id, this.moveOffset(), (blockId) => this.library.get(blockId)) : undefined; });

  create(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    let createdId: string | undefined;
    const changed = this.history.execute('Create group', (project) => {
      if (this.hasName(project, trimmed)) return undefined;
      createdId = nextGroupId(project.groups);
      const group: ProjectGroup = { id: createdId, name: trimmed, visible: true, locked: false };
      return this.withGroups(project, [...project.groups, group]);
    });
    if (changed) this.activeGroupId.set(createdId);
    return changed;
  }

  select(id: string | undefined): void {
    const previous = this.activeGroupId();
    if (id === this.activeGroupId()) {
      this.activeGroupId.set(undefined);
    } else {
      this.activeGroupId.set(id);
    }
    if (previous !== this.activeGroupId()) this.isolatedGroupId.set(undefined);
    this.resetMove();
  }
  renameActive(name: string): boolean { const id = this.activeGroupId(); return id ? this.rename(id, name) : false; }
  rename(id: string, name: string): boolean {
    const trimmed = name.trim(); if (!trimmed) return false;
    return this.history.execute('Rename group', (project) => project.groups.some((group) => group.id === id) && !this.hasName(project, trimmed, id) ? this.withGroups(project, project.groups.map((group) => group.id === id ? { ...group, name: trimmed } : group)) : undefined);
  }
  setActiveVisible(visible: boolean): boolean { const id = this.activeGroupId(); return id ? this.setVisible(id, visible) : false; }
  setVisible(id: string, visible: boolean): boolean { return this.history.execute('Set group visibility', (project) => { const normalized = this.normalize(project); return normalized.groups.some((group) => group.id === id) ? this.withGroups(normalized, normalized.groups.map((group) => group.id === id ? { ...group, visible } : group)) : undefined; }); }
  setActiveLocked(locked: boolean): boolean { const id = this.activeGroupId(); return id ? this.setLocked(id, locked) : false; }
  setLocked(id: string, locked: boolean): boolean { return this.history.execute('Set group lock', (project) => { const normalized = this.normalize(project); return normalized.groups.some((group) => group.id === id) ? this.withGroups(normalized, normalized.groups.map((group) => group.id === id ? { ...group, locked } : group)) : undefined; }); }
  deleteActive(): boolean { const id = this.activeGroupId(); return id ? this.delete(id) : false; }
  delete(id: string): boolean {
    const changed = this.history.execute('Delete group', (project) => { const normalized = this.normalize(project); return normalized.groups.some((group) => group.id === id) ? this.withGroups({ ...normalized, blocks: normalized.blocks.map((block) => removeGroup(block, id)), decorations: normalized.decorations?.map((decoration) => removeDecorationGroup(decoration, id)) }, normalized.groups.filter((group) => group.id !== id)) : undefined; });
    if (changed && this.activeGroupId() === id) this.select(undefined);
    if (changed && this.isolatedGroupId() === id) this.isolatedGroupId.set(undefined);
    return changed;
  }
  deleteActiveBlocks(): boolean {
    const project = this.workspace.project(); const id = this.activeGroupId(); const group = this.activeGroup();
    if (!project || !id || !group || group.locked) return false;
    const normalized = this.normalize(project); const positions = this.movingBlocks(normalized, id).map((block) => block.position); const decorations = (normalized.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, id));
    if (decorations.some((decoration) => isDecorationLocked(decoration, normalized.groups))) return false;
    const changed = this.history.execute('Delete group blocks', (current) => {
      const result = new BlockRuleEngine((blockId) => this.library.get(blockId)).deleteMany(current, positions);
      if (!result.project) return undefined;
      return { ...result.project, decorations: (result.project.decorations ?? []).filter((decoration) => !decorations.some((removed) => removed.instanceId === decoration.instanceId)), metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } };
    });
    if (changed) this.selection.clear();
    return changed;
  }
  addSelectionToActive(): boolean { const id = this.activeGroupId(); return id ? this.assignSelection(id) : false; }
  assignSelection(id: string): boolean { return this.mutateSelected('Add selection to group', id, (block) => addGroup(block, id)); }
  removeSelectionFromActive(): boolean { const id = this.activeGroupId(); return id ? this.removeFromGroup(id) : false; }
  removeFromGroup(id: string): boolean { return this.mutateSelected('Remove selection from group', id, (block) => removeGroup(block, id)); }
  isolateActive(): void { const id = this.activeGroupId(); this.isolatedGroupId.set(this.isolatedGroupId() === id ? undefined : id); }
  isolate(id: string | undefined): void { this.isolatedGroupId.set(id); }
  setMoveOffset(axis: keyof VoxelCoordinate, raw: number): void { if (Number.isInteger(raw)) this.moveOffset.update((offset) => ({ ...offset, [axis]: raw })); }
  setMoveStep(raw: number): void { if (Number.isInteger(raw) && raw > 0) this.moveStep.set(raw); }
  nudgeMove(axis: keyof VoxelCoordinate, direction: 1 | -1): void { this.moveOffset.update((offset) => ({ ...offset, [axis]: offset[axis] + direction * this.moveStep() })); }
  resetMove(): void { this.moveOffset.set({ x: 0, y: 0, z: 0 }); }
  resetForProjectChange(): void { this.activeGroupId.set(undefined); this.isolatedGroupId.set(undefined); this.resetMove(); }
  saveMove(): boolean {
    const id = this.activeGroupId(); const preview = this.movePreview();
    if (!id || !preview?.valid) return false;
    const selected = this.selection.single();
    const projectBeforeMove = this.workspace.project();
    const movingBefore = projectBeforeMove ? this.movingBlocks(this.normalize(projectBeforeMove), id) : [];
    const selectedMoves = !!selected && movingBefore.some((block) => coordinateKey(block.position) === coordinateKey(selected));
    const changed = this.history.execute('Move group', (project) => { const normalized = this.normalize(project); const movingKeys = new Set(this.movingBlocks(normalized, id).map((block) => coordinateKey(block.position))); const movingDecorationIds = new Set((normalized.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, id)).map((decoration) => decoration.instanceId)); return { ...normalized, blocks: normalized.blocks.map((block) => movingKeys.has(coordinateKey(block.position)) ? { ...block, position: translated(block.position, preview.offset) } : block), decorations: normalized.decorations?.map((decoration) => movingDecorationIds.has(decoration.instanceId) ? { ...decoration, anchor: translated(decoration.anchor, preview.offset) } : decoration), metadata: { ...normalized.metadata, updatedAt: new Date().toISOString() } }; });
    if (changed) { if (selected && selectedMoves) this.selection.select(translated(selected, preview.offset)); this.resetMove(); }
    return changed;
  }

  selectedBlocks(project: ProjectDocument): readonly PlacedBlock[] {
    const logicalKeys = new Set(this.selection.logicalPositions().map(coordinateKey));
    if (logicalKeys.size) return expandLogicalObjectClosure(project.blocks, project.blocks.filter((block) => logicalKeys.has(coordinateKey(block.position))), (id) => this.library.get(id));
    const single = this.selection.single(); const box = this.selection.box();
    if (single) return project.blocks.filter((block) => coordinateKey(block.position) === coordinateKey(single));
    if (box) return project.blocks.filter((block) => voxelInBox(block.position, box));
    return [];
  }

  private mutateSelected(label: string, groupId: string, map: (block: PlacedBlock) => PlacedBlock): boolean {
    return this.history.execute(label, (project) => {
      const normalized = this.normalize(project); const selected = this.selectedBlocks(normalized); const target = normalized.groups.find((group) => group.id === groupId);
      const selectedDecorationId = this.decorations?.selectedId(); const selectedDecoration = selectedDecorationId ? normalized.decorations?.find((decoration) => decoration.instanceId === selectedDecorationId) : undefined;
      if ((!selected.length && !selectedDecoration) || !target || target.locked || selected.some((block) => isBlockLocked(block, normalized.groups)) || !!selectedDecoration && isDecorationLocked(selectedDecoration, normalized.groups)) return undefined;
      const keys = new Set(selected.map((block) => coordinateKey(block.position)));
      return { ...normalized, blocks: normalized.blocks.map((block) => keys.has(coordinateKey(block.position)) ? map(block) : block), decorations: normalized.decorations?.map((decoration) => decoration.instanceId === selectedDecorationId ? (label.startsWith('Add') ? { ...decoration, groupIds: [...(decoration.groupIds ?? []), ...(decoration.groupIds?.includes(groupId) ? [] : [groupId])] } : removeDecorationGroup(decoration, groupId)) : decoration), metadata: { ...normalized.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  private hasName(project: ProjectDocument, name: string, exceptId?: string): boolean { const normalized = normalizeGroupName(name); return project.groups.some((group) => group.id !== exceptId && normalizeGroupName(group.name) === normalized); }
  private withGroups(project: ProjectDocument, groups: readonly ProjectGroup[]): ProjectDocument { return { ...project, groups, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } }; }
  private normalize(project: ProjectDocument): ProjectDocument { return normalizeLogicalObjectMemberships(project, (id) => this.library.get(id)); }
  private movingBlocks(project: ProjectDocument, groupId: string): readonly PlacedBlock[] { const seeds = project.blocks.filter((block) => hasGroup(block, groupId)); return expandLogicalObjectClosure(project.blocks, seeds, (id) => this.library.get(id)); }
  private groupPositions(groupId: string | undefined): readonly VoxelCoordinate[] { const project = this.workspace.project(); if (!project || !groupId) return []; return this.movingBlocks(this.normalize(project), groupId).map((block) => block.position); }
}

export function validateGroupMove(project: ProjectDocument, groupId: string, offset: VoxelCoordinate, definition: (id: string) => import('../../blocks/catalog/block-definition.types').BlockDefinition | undefined = () => undefined): GroupMovePreview {
  const seeds = project.blocks.filter((block) => hasGroup(block, groupId));
  const moving = expandLogicalObjectClosure(project.blocks, seeds, definition);
  const movingDecorations = (project.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, groupId));
  const group = project.groups.find((entry) => entry.id === groupId);
  const positions = moving.map((block) => block.position);
  const decorationIds = movingDecorations.map((decoration) => decoration.instanceId);
  if (!moving.length && !movingDecorations.length || !group || group.locked || moving.some((block) => isBlockLocked(block, project.groups)) || movingDecorations.some((decoration) => isDecorationLocked(decoration, project.groups))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'locked' };
  if (!Number.isInteger(offset.x) || !Number.isInteger(offset.y) || !Number.isInteger(offset.z) || moving.some((block) => !inBounds(translated(block.position, offset), project)) || movingDecorations.some((decoration) => !decorationInBounds(translated(decoration.anchor, offset), project.size))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'bounds' };
  const movingKeys = new Set(moving.map((block) => coordinateKey(block.position)));
  const occupied = new Set(project.blocks.filter((block) => !movingKeys.has(coordinateKey(block.position))).map((block) => coordinateKey(block.position)));
  if (moving.some((block) => occupied.has(coordinateKey(translated(block.position, offset))))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  const movedDecorations = movingDecorations.map((decoration) => ({ ...decoration, anchor: translated(decoration.anchor, offset) }));
  if (movedDecorations.some((decoration) => !decorationSupportValid(project, decoration, movingKeys, offset))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'support' };
  for (let index = 0; index < movedDecorations.length; index += 1) for (let other = index + 1; other < movedDecorations.length; other += 1) if (decorationOverlaps(decorationAabb(movedDecorations[index]), decorationAabb(movedDecorations[other]))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  const movingDecorationSet = new Set(decorationIds);
  if (movedDecorations.some((decoration) => (project.decorations ?? []).some((other) => !movingDecorationSet.has(other.instanceId) && decorationOverlaps(decorationAabb(decoration), decorationAabb(other))))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  return { groupId, offset, positions, decorationIds, valid: true };
}

function decorationSupportValid(project: ProjectDocument, decoration: PlacedDecoration, movingBlockKeys: ReadonlySet<string>, offset: VoxelCoordinate): boolean {
  if (decoration.fixed && (decoration.kind === 'item-frame' || decoration.kind === 'glow-item-frame')) return true;
  const direction = directionVector(decoration.facing); const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z }; const supportKey = coordinateKey(support);
  const exists = project.blocks.some((block) => movingBlockKeys.has(coordinateKey(block.position)) ? coordinateKey(translated(block.position, offset)) === supportKey : coordinateKey(block.position) === supportKey);
  if (!supportsDecoration(decoration.kind, decoration.facing, exists, decoration.fixed)) return false;
  const variant = decoration.kind === 'painting' ? paintingVariant(decoration.variantId) : undefined;
  return !variant || paintingSupportFootprint(decoration.anchor, decoration.facing, variant).every((position) => project.blocks.some((block) => movingBlockKeys.has(coordinateKey(block.position)) ? coordinateKey(translated(block.position, offset)) === coordinateKey(position) : coordinateKey(block.position) === coordinateKey(position)));
}

function translated(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }
function inBounds(position: VoxelCoordinate, project: ProjectDocument): boolean { return position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < project.size.x && position.y < project.size.y && position.z < project.size.z; }

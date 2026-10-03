import { Injectable, computed, inject, signal } from '@angular/core';
import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, ProjectGroup, VoxelCoordinate } from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { VoxelBox, voxelInBox } from '../selection/selection';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { addGroup, groupIdsOf, hasGroup, isBlockLocked, removeGroup } from './group-membership';
import { nextGroupId, normalizeGroupName } from './group-naming';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { expandLogicalObjectClosure, resolveLogicalObjectPartsFromLookup } from '../../block-behavior/logical-objects/logical-object';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';
import { decorationHasGroup, isDecorationLocked, removeDecorationGroup } from './decoration-membership';
import { decorationAabb, decorationInBounds, decorationOverlaps, directionVector, paintingSupportFootprint, supportsDecoration } from '../../decorations/placement/decoration-placement';
import { paintingVariant, type PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationService } from '../../decorations/decoration.service';
import type { RuntimeProjectBlockStore } from '../../domain/project-block-spatial-index';
import type { RuntimeDeltaTransaction } from '../history/history.service';

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
  readonly movePreview = computed(() => { const project = this.workspace.project(); const id = this.activeGroupId(); return project && id ? validateGroupMove(project, id, this.moveOffset(), (blockId) => this.library.get(blockId), this.workspace.ensureRuntime(project)) : undefined; });

  create(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    let createdId: string | undefined;
    const changed = this.history.executeDelta('Create group', (project) => {
      if (this.hasName(project, trimmed)) return undefined;
      createdId = nextGroupId(project.groups);
      const group: ProjectGroup = { id: createdId, name: trimmed, visible: true, locked: false };
      return { delta: {}, project: { groups: [...project.groups, group], metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } };
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
    return this.history.executeDelta('Rename group', (project) => project.groups.some((group) => group.id === id) && !this.hasName(project, trimmed, id) ? { delta: {}, project: { groups: project.groups.map((group) => group.id === id ? { ...group, name: trimmed } : group), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } } : undefined);
  }
  setActiveVisible(visible: boolean): boolean { const id = this.activeGroupId(); return id ? this.setVisible(id, visible) : false; }
  setVisible(id: string, visible: boolean): boolean { return this.history.executeDelta('Set group visibility', (project) => project.groups.some((group) => group.id === id) ? { delta: {}, project: { groups: project.groups.map((group) => group.id === id ? { ...group, visible } : group), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } } : undefined); }
  setActiveLocked(locked: boolean): boolean { const id = this.activeGroupId(); return id ? this.setLocked(id, locked) : false; }
  setLocked(id: string, locked: boolean): boolean { return this.history.executeDelta('Set group lock', (project) => project.groups.some((group) => group.id === id) ? { delta: {}, project: { groups: project.groups.map((group) => group.id === id ? { ...group, locked } : group), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } } : undefined); }
  deleteActive(): boolean { const id = this.activeGroupId(); return id ? this.delete(id) : false; }
  delete(id: string): boolean {
    const changed = this.history.executeDelta('Delete group', (project, runtime): RuntimeDeltaTransaction | undefined => {
      if (!project.groups.some((group) => group.id === id)) return undefined;
      const updated = runtime.blocksForGroup(id).map((block) => ({ before: block, after: removeGroup(block, id) }));
      const decorations = project.decorations?.map((decoration) => removeDecorationGroup(decoration, id));
      return { delta: { updated }, project: { groups: project.groups.filter((group) => group.id !== id), decorations, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } };
    });
    if (changed && this.activeGroupId() === id) this.select(undefined);
    if (changed && this.isolatedGroupId() === id) this.isolatedGroupId.set(undefined);
    return changed;
  }
  deleteActiveBlocks(): boolean {
    const project = this.workspace.project(); const id = this.activeGroupId(); const group = this.activeGroup();
    if (!project || !id || !group || group.locked) return false;
    const moving = this.movingBlocks(project, id); const positions = moving.map((block) => block.position); const decorations = (project.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, id));
    if (moving.some((block) => isBlockLocked(block, project.groups)) || decorations.some((decoration) => isDecorationLocked(decoration, project.groups))) return false;
    const changed = this.history.executeDelta('Delete group blocks', (current, runtime): RuntimeDeltaTransaction | undefined => {
      const result = new BlockRuleEngine((blockId) => this.library.get(blockId)).deleteMany(current, positions, runtime);
      if ((result.validation.status === 'invalid' && result.validation.reason !== 'missing-support') || !result.removedBlocks?.length) return undefined;
      const removedIds = new Set(decorations.map((decoration) => decoration.instanceId));
      const updated = (result.changedBlocks ?? []).flatMap((block) => { const before = runtime.get(block.position); return before ? [{ before, after: block }] : []; });
      return { delta: { removed: result.removedBlocks, updated }, project: { decorations: (current.decorations ?? []).filter((decoration) => !removedIds.has(decoration.instanceId)), metadata: { ...current.metadata, updatedAt: new Date().toISOString() } } };
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
    const movingBefore = projectBeforeMove ? this.movingBlocks(projectBeforeMove, id) : [];
    const selectedMoves = !!selected && movingBefore.some((block) => coordinateKey(block.position) === coordinateKey(selected));
    const changed = this.history.executeDelta('Move group', (project, runtime): RuntimeDeltaTransaction | undefined => {
      const moving = this.movingBlocks(project, id);
      const moves = moving.map((block) => ({ before: block.position, after: translated(block.position, preview.offset) }));
      const movingDecorationIds = new Set((project.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, id)).map((decoration) => decoration.instanceId));
      const decorations = project.decorations?.map((decoration) => movingDecorationIds.has(decoration.instanceId) ? { ...decoration, anchor: translated(decoration.anchor, preview.offset) } : decoration);
      return { delta: { moved: moves }, project: { decorations, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } };
    });
    if (changed) { if (selected && selectedMoves) this.selection.select(translated(selected, preview.offset)); this.resetMove(); }
    return changed;
  }

  selectedBlocks(project: ProjectDocument): readonly PlacedBlock[] {
    const selected = this.selection.selectedBlocks(project, this.workspace.ensureRuntime(project));
    if (!selected.length) return [];
    return this.selection.kind() === 'all' ? selected : expandLogicalObjectClosure(project.blocks, selected, (id) => this.library.get(id), this.workspace.ensureRuntime(project));
  }

  private mutateSelected(label: string, groupId: string, map: (block: PlacedBlock) => PlacedBlock): boolean {
    return this.history.executeDelta(label, (project, runtime): RuntimeDeltaTransaction | undefined => {
      const selected = this.selectedBlocks(project); const target = project.groups.find((group) => group.id === groupId);
      const selectedDecorationId = this.decorations?.selectedId(); const selectedDecoration = selectedDecorationId ? project.decorations?.find((decoration) => decoration.instanceId === selectedDecorationId) : undefined;
      if ((!selected.length && !selectedDecoration) || !target || target.locked || selected.some((block) => isBlockLocked(block, project.groups)) || !!selectedDecoration && isDecorationLocked(selectedDecoration, project.groups)) return undefined;
      const updated = selected.map((block) => {
        const parts = resolveLogicalObjectPartsFromLookup(block.position, (id) => this.library.get(id), runtime);
        const membership = new Set(parts.flatMap((part) => groupIdsOf(part)));
        const mapped = map(block);
        for (const group of groupIdsOf(mapped)) membership.add(group);
        if (label.startsWith('Remove')) membership.delete(groupId); else membership.add(groupId);
        return { before: block, after: { ...mapped, groupIds: [...membership] } };
      });
      const decorations = project.decorations?.map((decoration) => decoration.instanceId === selectedDecorationId ? (label.startsWith('Add') ? { ...decoration, groupIds: [...(decoration.groupIds ?? []), ...(decoration.groupIds?.includes(groupId) ? [] : [groupId])] } : removeDecorationGroup(decoration, groupId)) : decoration);
      return { delta: { updated }, project: { decorations, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } } };
    });
  }
  private hasName(project: ProjectDocument, name: string, exceptId?: string): boolean { const normalized = normalizeGroupName(name); return project.groups.some((group) => group.id !== exceptId && normalizeGroupName(group.name) === normalized); }
  private movingBlocks(project: ProjectDocument, groupId: string): readonly PlacedBlock[] { const runtime = this.workspace.ensureRuntime(project); const seeds = runtime.blocksForGroup(groupId); return expandLogicalObjectClosure(project.blocks, seeds, (id) => this.library.get(id), runtime); }
  private groupPositions(groupId: string | undefined): readonly VoxelCoordinate[] { const project = this.workspace.project(); if (!project || !groupId) return []; return this.movingBlocks(project, groupId).map((block) => block.position); }
}

export function validateGroupMove(project: ProjectDocument, groupId: string, offset: VoxelCoordinate, definition: (id: string) => import('../../blocks/catalog/block-definition.types').BlockDefinition | undefined = () => undefined, lookup?: RuntimeProjectBlockStore): GroupMovePreview {
  const seeds = lookup ? lookup.blocksForGroup(groupId) : project.blocks.filter((block) => hasGroup(block, groupId));
  const moving = expandLogicalObjectClosure(project.blocks, seeds, definition, lookup);
  const movingDecorations = (project.decorations ?? []).filter((decoration) => decorationHasGroup(decoration, groupId));
  const group = project.groups.find((entry) => entry.id === groupId);
  const positions = moving.map((block) => block.position);
  const decorationIds = movingDecorations.map((decoration) => decoration.instanceId);
  if (!moving.length && !movingDecorations.length || !group || group.locked || moving.some((block) => isBlockLocked(block, project.groups)) || movingDecorations.some((decoration) => isDecorationLocked(decoration, project.groups))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'locked' };
  if (!Number.isInteger(offset.x) || !Number.isInteger(offset.y) || !Number.isInteger(offset.z) || moving.some((block) => !isWithinBounds(translated(block.position, offset), project.size)) || movingDecorations.some((decoration) => !decorationInBounds(translated(decoration.anchor, offset), project.size))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'bounds' };
  const movingKeys = new Set(moving.map((block) => coordinateKey(block.position)));
  if (moving.some((block) => { const target = translated(block.position, offset); const occupant = lookup ? lookup.get(target) : project.blocks.find((entry) => coordinateKey(entry.position) === coordinateKey(target)); return !!occupant && !movingKeys.has(coordinateKey(occupant.position)); })) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  const movedDecorations = movingDecorations.map((decoration) => ({ ...decoration, anchor: translated(decoration.anchor, offset) }));
  const movingTargetKeys = new Set(moving.map((block) => coordinateKey(translated(block.position, offset))));
  if (movedDecorations.some((decoration) => !decorationSupportValid(project, decoration, movingKeys, movingTargetKeys, offset, lookup))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'support' };
  for (let index = 0; index < movedDecorations.length; index += 1) for (let other = index + 1; other < movedDecorations.length; other += 1) if (decorationOverlaps(decorationAabb(movedDecorations[index]), decorationAabb(movedDecorations[other]))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  const movingDecorationSet = new Set(decorationIds);
  if (movedDecorations.some((decoration) => (project.decorations ?? []).some((other) => !movingDecorationSet.has(other.instanceId) && decorationOverlaps(decorationAabb(decoration), decorationAabb(other))))) return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  return { groupId, offset, positions, decorationIds, valid: true };
}

function decorationSupportValid(project: ProjectDocument, decoration: PlacedDecoration, movingBlockKeys: ReadonlySet<string>, movingTargetKeys: ReadonlySet<string>, offset: VoxelCoordinate, lookup?: RuntimeProjectBlockStore): boolean {
  if (decoration.fixed && (decoration.kind === 'item-frame' || decoration.kind === 'glow-item-frame')) return true;
  const direction = directionVector(decoration.facing); const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z }; const supportKey = coordinateKey(support);
  const exists = lookup ? (movingTargetKeys.has(supportKey) || (!!lookup.get(support) && !movingBlockKeys.has(supportKey))) : project.blocks.some((block) => movingBlockKeys.has(coordinateKey(block.position)) ? coordinateKey(translated(block.position, offset)) === supportKey : coordinateKey(block.position) === supportKey);
  if (!supportsDecoration(decoration.kind, decoration.facing, exists, decoration.fixed)) return false;
  const variant = decoration.kind === 'painting' ? paintingVariant(decoration.variantId) : undefined;
  return !variant || paintingSupportFootprint(decoration.anchor, decoration.facing, variant).every((position) => lookup ? movingTargetKeys.has(coordinateKey(position)) || (!!lookup.get(position) && !movingBlockKeys.has(coordinateKey(position))) : project.blocks.some((block) => movingBlockKeys.has(coordinateKey(block.position)) ? coordinateKey(translated(block.position, offset)) === coordinateKey(position) : coordinateKey(block.position) === coordinateKey(position)));
}

function translated(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }

import { Injectable, computed, inject, signal } from '@angular/core';
import { coordinateKey } from '../../domain/coordinates';
import {
  PlacedBlock,
  ProjectDocument,
  ProjectGroup,
  VoxelCoordinate,
} from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { addGroup, isBlockLocked, removeGroup } from './group-membership';
import { nextGroupId, normalizeGroupName } from './group-naming';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import {
  expandLogicalObjectClosure,
  normalizeLogicalObjectMemberships,
} from '../../block-behavior/logical-objects/logical-object';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';
import {
  decorationHasGroup,
  isDecorationLocked,
  removeDecorationGroup,
} from './decoration-membership';
import { DecorationService } from '../../decorations/decoration.service';
import { metadataMutationHint } from '../mutations/project-mutation-hint';
import { groupMetadataMutationHint, groupMutationHintForPositions } from './group-mutation-hint';
import { groupMovingBlocks, validateGroupMove } from './group-move-planner';
import type { GroupMovePreview } from './group-move-planner';
import { GroupMoveTransaction } from './group-move-transaction';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly moveTransaction: GroupMoveTransaction;
  private positionCache?: {
    readonly projectId: string;
    readonly blocks: ProjectDocument['blocks'];
    readonly groups: ProjectDocument['groups'];
    readonly positionsByGroup: Map<string, readonly VoxelCoordinate[]>;
  };
  constructor(
    private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService),
    private readonly selection: SelectionService = inject(SelectionService),
    private readonly history: HistoryService = inject(HistoryService),
    private readonly library: BlockLibraryService = inject(BlockLibraryService),
    private readonly decorations?: DecorationService,
  ) {
    this.moveTransaction = new GroupMoveTransaction(workspace, selection, history, (id) =>
      library.get(id),
    );
  }
  readonly activeGroupId = signal<string | undefined>(undefined);
  readonly isolatedGroupId = signal<string | undefined>(undefined);
  readonly moveOffset = signal<VoxelCoordinate>({ x: 0, y: 0, z: 0 });
  readonly moveStep = signal(1);
  readonly activeGroup = computed(() =>
    this.workspace.project()?.groups.find((group) => group.id === this.activeGroupId()),
  );
  readonly activeGroupPositions = computed(() => this.groupPositions(this.activeGroupId()));
  readonly isolatedGroupPositions = computed(() => this.groupPositions(this.isolatedGroupId()));
  readonly activeGroupBlockCount = computed(() => this.activeGroupPositions().length);
  readonly movePreview = computed(() => {
    const project = this.workspace.project();
    const id = this.activeGroupId();
    return project && id
      ? validateGroupMove(project, id, this.moveOffset(), (blockId) => this.library.get(blockId))
      : undefined;
  });

  create(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    let createdId: string | undefined;
    const changed = this.history.executeWithMutation(
      'Create group',
      (project) => {
        if (this.hasName(project, trimmed)) return undefined;
        createdId = nextGroupId(project.groups);
        const group: ProjectGroup = { id: createdId, name: trimmed, visible: true, locked: false };
        return this.withGroups(project, [...project.groups, group]);
      },
      () => metadataMutationHint([], [], 'group-create'),
    );
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
  renameActive(name: string): boolean {
    const id = this.activeGroupId();
    return id ? this.rename(id, name) : false;
  }
  rename(id: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    return this.history.executeWithMutation(
      'Rename group',
      (project) =>
        project.groups.some((group) => group.id === id) && !this.hasName(project, trimmed, id)
          ? this.withGroups(
              project,
              project.groups.map((group) =>
                group.id === id ? { ...group, name: trimmed } : group,
              ),
            )
          : undefined,
      (before, after) => groupMetadataMutationHint(before, after, id, 'group-rename'),
    );
  }
  setActiveVisible(visible: boolean): boolean {
    const id = this.activeGroupId();
    return id ? this.setVisible(id, visible) : false;
  }
  setVisible(id: string, visible: boolean): boolean {
    return this.history.executeWithMutation(
      'Set group visibility',
      (project) =>
        project.groups.some((group) => group.id === id)
          ? this.withGroups(
              project,
              project.groups.map((group) => (group.id === id ? { ...group, visible } : group)),
            )
          : undefined,
      (before, after) =>
        groupMetadataMutationHint(before, after, id, 'group-visibility', 'visibility'),
    );
  }
  setActiveLocked(locked: boolean): boolean {
    const id = this.activeGroupId();
    return id ? this.setLocked(id, locked) : false;
  }
  setLocked(id: string, locked: boolean): boolean {
    return this.history.executeWithMutation(
      'Set group lock',
      (project) =>
        project.groups.some((group) => group.id === id)
          ? this.withGroups(
              project,
              project.groups.map((group) => (group.id === id ? { ...group, locked } : group)),
            )
          : undefined,
      (before, after) => groupMetadataMutationHint(before, after, id, 'group-lock'),
    );
  }
  deleteActive(): boolean {
    const id = this.activeGroupId();
    return id ? this.delete(id) : false;
  }
  delete(id: string): boolean {
    const changed = this.history.executeWithMutation(
      'Delete group',
      (project) =>
        project.groups.some((group) => group.id === id)
          ? this.withGroups(
              {
                ...project,
                blocks: project.blocks.map((block) => removeGroup(block, id)),
                decorations: project.decorations?.map((decoration) =>
                  removeDecorationGroup(decoration, id),
                ),
              },
              project.groups.filter((group) => group.id !== id),
            )
          : undefined,
      (before, after) => groupMetadataMutationHint(before, after, id, 'group-delete'),
    );
    if (changed && this.activeGroupId() === id) this.select(undefined);
    if (changed && this.isolatedGroupId() === id) this.isolatedGroupId.set(undefined);
    return changed;
  }
  deleteActiveBlocks(): boolean {
    const project = this.workspace.project();
    const id = this.activeGroupId();
    const group = this.activeGroup();
    if (!project || !id || !group || group.locked) return false;
    const normalized = this.normalize(project);
    const positions = this.movingBlocks(normalized, id).map((block) => block.position);
    const decorations = (normalized.decorations ?? []).filter((decoration) =>
      decorationHasGroup(decoration, id),
    );
    if (decorations.some((decoration) => isDecorationLocked(decoration, normalized.groups)))
      return false;
    const changed = this.history.execute('Delete group blocks', (current) => {
      const result = new BlockRuleEngine((blockId) => this.library.get(blockId)).deleteMany(
        current,
        positions,
      );
      if (!result.project) return undefined;
      return {
        ...result.project,
        decorations: (result.project.decorations ?? []).filter(
          (decoration) =>
            !decorations.some((removed) => removed.instanceId === decoration.instanceId),
        ),
        metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() },
      };
    });
    if (changed) this.selection.clear();
    return changed;
  }
  addSelectionToActive(): boolean {
    const id = this.activeGroupId();
    return id ? this.assignSelection(id) : false;
  }
  assignSelection(id: string): boolean {
    return this.mutateSelected('Add selection to group', id, (block) => addGroup(block, id));
  }
  removeSelectionFromActive(): boolean {
    const id = this.activeGroupId();
    return id ? this.removeFromGroup(id) : false;
  }
  removeFromGroup(id: string): boolean {
    return this.mutateSelected('Remove selection from group', id, (block) =>
      removeGroup(block, id),
    );
  }
  isolateActive(): void {
    const id = this.activeGroupId();
    this.isolatedGroupId.set(this.isolatedGroupId() === id ? undefined : id);
  }
  isolate(id: string | undefined): void {
    this.isolatedGroupId.set(id);
  }
  setMoveOffset(axis: keyof VoxelCoordinate, raw: number): void {
    if (Number.isInteger(raw)) this.moveOffset.update((offset) => ({ ...offset, [axis]: raw }));
  }
  setMoveStep(raw: number): void {
    if (Number.isInteger(raw) && raw > 0) this.moveStep.set(raw);
  }
  nudgeMove(axis: keyof VoxelCoordinate, direction: 1 | -1): void {
    this.moveOffset.update((offset) => ({
      ...offset,
      [axis]: offset[axis] + direction * this.moveStep(),
    }));
  }
  resetMove(): void {
    this.moveOffset.set({ x: 0, y: 0, z: 0 });
  }
  resetForProjectChange(): void {
    this.activeGroupId.set(undefined);
    this.isolatedGroupId.set(undefined);
    this.resetMove();
  }
  saveMove(): boolean {
    const id = this.activeGroupId();
    const preview = this.movePreview();
    if (!id || !preview?.valid) return false;
    const changed = this.moveTransaction.execute(id, preview);
    if (changed) this.resetMove();
    return changed;
  }

  selectedBlocks(project: ProjectDocument): readonly PlacedBlock[] {
    const selected = this.selection.selectedBlocks(project);
    if (!selected.length) return [];
    return this.selection.kind() === 'all'
      ? selected
      : expandLogicalObjectClosure(project.blocks, selected, (id) => this.library.get(id));
  }

  private mutateSelected(
    label: string,
    groupId: string,
    map: (block: PlacedBlock) => PlacedBlock,
  ): boolean {
    let touchedPositions: readonly VoxelCoordinate[] = [];
    let touchedDecorationIds: readonly string[] = [];
    return this.history.executeWithMutation(
      label,
      (project) => {
        const normalized = this.normalize(project);
        const selected = this.selectedBlocks(normalized);
        const target = normalized.groups.find((group) => group.id === groupId);
        const selectedDecorationId = this.decorations?.selectedId();
        const selectedDecoration = selectedDecorationId
          ? normalized.decorations?.find(
              (decoration) => decoration.instanceId === selectedDecorationId,
            )
          : undefined;
        if (
          (!selected.length && !selectedDecoration) ||
          !target ||
          target.locked ||
          selected.some((block) => isBlockLocked(block, normalized.groups)) ||
          (!!selectedDecoration && isDecorationLocked(selectedDecoration, normalized.groups))
        )
          return undefined;
        const keys = new Set(selected.map((block) => coordinateKey(block.position)));
        touchedPositions = selected.map((block) => block.position);
        touchedDecorationIds = selectedDecoration ? [selectedDecoration.instanceId] : [];
        return {
          ...normalized,
          blocks: normalized.blocks.map((block) =>
            keys.has(coordinateKey(block.position)) ? map(block) : block,
          ),
          decorations: normalized.decorations?.map((decoration) =>
            decoration.instanceId === selectedDecorationId
              ? label.startsWith('Add')
                ? {
                    ...decoration,
                    groupIds: [
                      ...(decoration.groupIds ?? []),
                      ...(decoration.groupIds?.includes(groupId) ? [] : [groupId]),
                    ],
                  }
                : removeDecorationGroup(decoration, groupId)
              : decoration,
          ),
          metadata: { ...normalized.metadata, updatedAt: new Date().toISOString() },
        };
      },
      (before, after) =>
        groupMutationHintForPositions(
          before,
          after,
          touchedPositions,
          touchedDecorationIds,
          label.toLowerCase(),
        ),
    );
  }
  private hasName(project: ProjectDocument, name: string, exceptId?: string): boolean {
    const normalized = normalizeGroupName(name);
    return project.groups.some(
      (group) => group.id !== exceptId && normalizeGroupName(group.name) === normalized,
    );
  }
  private withGroups(project: ProjectDocument, groups: readonly ProjectGroup[]): ProjectDocument {
    return {
      ...project,
      groups,
      metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
    };
  }
  private normalize(project: ProjectDocument): ProjectDocument {
    return normalizeLogicalObjectMemberships(project, (id) => this.library.get(id));
  }
  private movingBlocks(project: ProjectDocument, groupId: string): readonly PlacedBlock[] {
    return groupMovingBlocks(project, groupId, (id) => this.library.get(id));
  }
  private groupPositions(groupId: string | undefined): readonly VoxelCoordinate[] {
    const project = this.workspace.project();
    if (!project) {
      this.positionCache = undefined;
      return [];
    }
    const existing = this.positionCache;
    if (existing && (existing.projectId !== project.id || existing.blocks !== project.blocks || existing.groups !== project.groups)) {
      this.positionCache = undefined;
    }
    if (!groupId) return [];
    let cache = this.positionCache;
    if (!cache || cache.projectId !== project.id || cache.blocks !== project.blocks || cache.groups !== project.groups) {
      cache = { projectId: project.id, blocks: project.blocks, groups: project.groups, positionsByGroup: new Map() };
      this.positionCache = cache;
    }
    const cached = cache.positionsByGroup.get(groupId);
    if (cached) return cached;
    const positions = this.movingBlocks(this.normalize(project), groupId).map((block) => block.position);
    cache.positionsByGroup.set(groupId, positions);
    return positions;
  }
}

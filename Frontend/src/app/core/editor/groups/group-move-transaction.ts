import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import {
  expandLogicalObjectClosure,
  normalizeLogicalObjectMemberships,
} from '../../block-behavior/logical-objects/logical-object';
import type { HistoryService } from '../history/history.service';
import type { SelectionService } from '../selection/selection.service';
import type { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { decorationHasGroup } from './decoration-membership';
import { groupMovingBlocks, translateGroupPosition } from './group-move-planner';
import type { GroupMovePreview } from './group-move-planner';

/** Owns the prepared group mutation, history transaction and selection follow-through. */
export class GroupMoveTransaction {
  constructor(
    private readonly workspace: WorkspaceStateService,
    private readonly selection: SelectionService,
    private readonly history: HistoryService,
    private readonly getDefinition: (id: string) => BlockDefinition | undefined,
  ) {}

  execute(groupId: string, preview: GroupMovePreview): boolean {
    if (!preview.valid) return false;
    const selected = this.selection.single();
    const projectBeforeMove = this.workspace.project();
    const movingBefore = projectBeforeMove
      ? groupMovingBlocks(this.normalize(projectBeforeMove), groupId, this.getDefinition)
      : [];
    const selectedMoves =
      !!selected &&
      movingBefore.some((block) => coordinateKey(block.position) === coordinateKey(selected));
    const changed = this.history.execute('Move group', (project) =>
      this.prepareMutation(project, groupId, preview),
    );
    if (changed && selected && selectedMoves)
      this.selection.select(translateGroupPosition(selected, preview.offset));
    return changed;
  }

  private prepareMutation(
    project: ProjectDocument,
    groupId: string,
    preview: GroupMovePreview,
  ): ProjectDocument {
    const normalized = this.normalize(project);
    const movingKeys = new Set(
      groupMovingBlocks(normalized, groupId, this.getDefinition).map((block) =>
        coordinateKey(block.position),
      ),
    );
    const movingDecorationIds = new Set(
      (normalized.decorations ?? [])
        .filter((decoration) => decorationHasGroup(decoration, groupId))
        .map((decoration) => decoration.instanceId),
    );
    const after: ProjectDocument = {
      ...normalized,
      blocks: normalized.blocks.map((block) =>
        movingKeys.has(coordinateKey(block.position))
          ? { ...block, position: translateGroupPosition(block.position, preview.offset) }
          : block,
      ),
      decorations: normalized.decorations?.map((decoration) =>
        movingDecorationIds.has(decoration.instanceId)
          ? { ...decoration, anchor: translateGroupPosition(decoration.anchor, preview.offset) }
          : decoration,
      ),
      metadata: { ...normalized.metadata, updatedAt: new Date().toISOString() },
    };
    return after;
  }

  private normalize(project: ProjectDocument): ProjectDocument {
    return normalizeLogicalObjectMemberships(project, this.getDefinition);
  }
}

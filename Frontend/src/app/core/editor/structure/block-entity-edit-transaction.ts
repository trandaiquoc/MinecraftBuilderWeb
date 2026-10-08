import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { ProjectMutationHint, blockMutationHint } from '../mutations/project-mutation-hint';
import { projectMutationChanges } from '../mutations/project-mutation-diff';
import { ProjectBlockRuntimeIndex, defaultProjectBlockRuntimeIndex } from '../runtime/project-block-runtime-index';
import { ProjectBlockArrayMutator } from '../runtime/project-block-array-mutator';

export type BlockEntityEdit = (project: ProjectDocument, block: PlacedBlock) => PlacedBlock | undefined;

/** Owns the shared history and mutation-hint boundary for block-entity editors. */
export class BlockEntityEditTransaction {
  constructor(
    private readonly history: HistoryService,
    private readonly runtimeIndex: ProjectBlockRuntimeIndex = defaultProjectBlockRuntimeIndex,
  ) {}

  execute(label: string, position: VoxelCoordinate, edit: BlockEntityEdit): boolean {
    let mutationHint: ProjectMutationHint | undefined;
    return this.history.executeWithMutation(label, (project) => {
      this.runtimeIndex.ensure(project);
      const before = this.runtimeIndex.get(position);
      if (!before) return undefined;
      const after = edit(project, before);
      if (!after) return undefined;
      const next = {
        ...project,
        blocks: ProjectBlockArrayMutator.replaceAtPosition(project, position, after, this.runtimeIndex),
        metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
      };
      mutationHint = blockMutationHint(projectMutationChanges(project, next, [position]), label.toLowerCase());
      return next;
    }, () => mutationHint);
  }
}

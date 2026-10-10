import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { materializeBlockState } from '../../blocks/catalog/block-state-compatibility';
import type { ProjectDocument, ResolvedPlacedBlock } from '../../domain/project.types';
import type { ProjectMutationChange } from '../mutations/project-mutation-hint';
import { throwIfAborted } from '../../assets/mod/mod-import-cancellation';

export const MISSING_BLOCK_RECONCILIATION_BATCH_SIZE = 128;

export interface MissingBlockReconciliationResult {
  readonly project: ProjectDocument;
  readonly resolvedCount: number;
  readonly stillMissingCount: number;
  readonly incompatibleCount: number;
  readonly changes: readonly ProjectMutationChange[];
}

export function reconcileMissingBlocks(
  project: ProjectDocument,
  getDefinition: (id: string) => BlockDefinition | undefined,
): MissingBlockReconciliationResult {
  const replacements = new Map<number, ResolvedPlacedBlock>();
  let stillMissingCount = 0;
  let incompatibleCount = 0;
  for (let index = 0; index < project.blocks.length; index += 1) {
    const block = project.blocks[index];
    if (block.kind !== 'missing') continue;
    const definition = getDefinition(block.id);
    if (!definition) {
      stillMissingCount += 1;
      continue;
    }
    const materialized = materializeBlockState(definition, block.state);
    if (!materialized.valid) {
      stillMissingCount += 1;
      incompatibleCount += 1;
      continue;
    }
    replacements.set(index, {
      ...block,
      kind: 'resolved',
      namespace: definition.namespace,
      state: materialized.state,
    });
  }
  return finishReconciliation(
    project,
    replacements,
    replacements.size,
    stillMissingCount,
    incompatibleCount,
  );
}

export async function reconcileMissingBlocksCooperatively(
  project: ProjectDocument,
  getDefinition: (id: string) => BlockDefinition | undefined,
  batchSize = MISSING_BLOCK_RECONCILIATION_BATCH_SIZE,
  yieldToBrowser: () => Promise<void> = defaultYield,
  signal?: AbortSignal,
): Promise<MissingBlockReconciliationResult> {
  throwIfAborted(signal);
  const missingIndexes: number[] = [];
  for (let index = 0; index < project.blocks.length; index += 1)
    if (project.blocks[index].kind === 'missing') missingIndexes.push(index);
  const replacements = new Map<number, ResolvedPlacedBlock>();
  let stillMissingCount = 0;
  let incompatibleCount = 0;
  const chunkSize = Math.max(1, Math.floor(batchSize));
  for (let start = 0; start < missingIndexes.length; start += chunkSize) {
    throwIfAborted(signal);
    const end = Math.min(start + chunkSize, missingIndexes.length);
    for (let offset = start; offset < end; offset += 1) {
      const index = missingIndexes[offset];
      const block = project.blocks[index];
      if (block.kind !== 'missing') continue;
      const definition = getDefinition(block.id);
      if (!definition) {
        stillMissingCount += 1;
        continue;
      }
      const materialized = materializeBlockState(definition, block.state);
      if (!materialized.valid) {
        stillMissingCount += 1;
        incompatibleCount += 1;
        continue;
      }
      replacements.set(index, {
        ...block,
        kind: 'resolved',
        namespace: definition.namespace,
        state: materialized.state,
      });
    }
    if (end < missingIndexes.length) {
      await yieldToBrowser();
      throwIfAborted(signal);
    }
  }
  return finishReconciliation(
    project,
    replacements,
    replacements.size,
    stillMissingCount,
    incompatibleCount,
  );
}

function finishReconciliation(
  project: ProjectDocument,
  replacements: ReadonlyMap<number, ResolvedPlacedBlock>,
  resolvedCount: number,
  stillMissingCount: number,
  incompatibleCount: number,
): MissingBlockReconciliationResult {
  const changes = [...replacements.entries()].map(([index, after]) => ({
    position: after.position,
    before: project.blocks[index],
    after,
  }));
  if (replacements.size === 0)
    return { project, resolvedCount, stillMissingCount, incompatibleCount, changes };
  const blocks = project.blocks.map((block, index) => replacements.get(index) ?? block);
  return {
    project: { ...project, blocks },
    resolvedCount,
    stillMissingCount,
    incompatibleCount,
    changes,
  };
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

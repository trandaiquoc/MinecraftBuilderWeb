import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { materializeBlockState } from '../../blocks/catalog/block-state-compatibility';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';
import { isWithinBounds } from '../../domain/coordinates';
import type {
  PlacedBlock,
  ProjectDocument,
  ProjectSize,
  VoxelCoordinate,
} from '../../domain/project.types';
import { ProjectBlockSpatialIndex } from '../../domain/project-block-spatial-index';
import type { StructureJson, StructureJsonBlock } from './structure-json';
import { issue } from './block-entry-validation';
import type {
  MutableStructureJsonIssues,
  StructureJsonValidationCancellation,
} from './structure-json-validation.types';
import { CooperativeWorkBudget } from '../../assets/cooperative-yield';
import { cooperativeValidationCheckpoint } from './structure-json-validation-scheduling';

export function appendSupportAndWarnings(
  issues: MutableStructureJsonIssues,
  document: StructureJson,
  size: ProjectSize,
  getDefinition: (id: string) => BlockDefinition | undefined,
  project?: ProjectDocument,
): void {
  const importedBlocks = document.blocks.map((block) =>
    toPlacedBlockForValidation(block, getDefinition(block.id)),
  );
  const source = new ProjectBlockSpatialIndex(importedBlocks);
  const supportProject = project
    ? { ...project, size, blocks: importedBlocks }
    : ({ size, blocks: importedBlocks, groups: [], decorations: [] } as unknown as ProjectDocument);
  const engine = new BlockRuleEngine(getDefinition);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendSupportIssue(
      issues,
      document.blocks[index],
      index,
      size,
      getDefinition,
      importedBlocks[index],
      supportProject,
      source,
      engine,
    );
  }
  appendOriginWarnings(issues, document);
  appendTreeWarnings(issues, document, source);
}

export async function appendSupportAndWarningsAsync(
  issues: MutableStructureJsonIssues,
  document: StructureJson,
  size: ProjectSize,
  getDefinition: (id: string) => BlockDefinition | undefined,
  project: ProjectDocument | undefined,
  cancellation: StructureJsonValidationCancellation | undefined,
  budget: CooperativeWorkBudget,
): Promise<boolean> {
  const importedBlocks: PlacedBlock[] = [];
  for (let index = 0; index < document.blocks.length; index += 1) {
    importedBlocks.push(
      toPlacedBlockForValidation(document.blocks[index], getDefinition(document.blocks[index].id)),
    );
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  const source = new ProjectBlockSpatialIndex([]);
  for (let index = 0; index < importedBlocks.length; index += 1) {
    source.add(importedBlocks[index]);
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  const supportProject = project
    ? { ...project, size, blocks: importedBlocks }
    : ({ size, blocks: importedBlocks, groups: [], decorations: [] } as unknown as ProjectDocument);
  const engine = new BlockRuleEngine(getDefinition);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendSupportIssue(
      issues,
      document.blocks[index],
      index,
      size,
      getDefinition,
      importedBlocks[index],
      supportProject,
      source,
      engine,
    );
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  if ((await appendOriginWarningsAsync(issues, document, cancellation, budget)) === false)
    return false;
  return appendTreeWarningsAsync(issues, document, source, cancellation, budget);
}

function appendSupportIssue(
  issues: MutableStructureJsonIssues,
  block: StructureJsonBlock,
  index: number,
  size: ProjectSize,
  getDefinition: (id: string) => BlockDefinition | undefined,
  placed: PlacedBlock,
  supportProject: ProjectDocument,
  source: ProjectBlockSpatialIndex,
  engine: BlockRuleEngine,
): void {
  const position = { x: block.x, y: block.y, z: block.z };
  const definition = getDefinition(block.id);
  if (
    !definition ||
    !isWithinBounds(position, size) ||
    !definition.behavior ||
    definition.behaviorSupport === 'unknown'
  )
    return;
  if (!materializeBlockState(definition, block.state).valid) return;
  const result = engine.validateSupportOnly(supportProject, placed, definition, source);
  if (result.status === 'invalid' && result.reason === 'missing-support')
    issues.support.push(issue('support', index, block, { code: 'missing-support' }));
}

async function appendOriginWarningsAsync(
  issues: MutableStructureJsonIssues,
  document: StructureJson,
  cancellation: StructureJsonValidationCancellation | undefined,
  budget: CooperativeWorkBudget,
): Promise<boolean> {
  const positions: VoxelCoordinate[] = [];
  const total = document.blocks.length + document.decorations.length;
  for (let index = 0; index < document.blocks.length; index += 1) {
    const block = document.blocks[index];
    positions.push({ x: block.x, y: block.y, z: block.z });
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  for (let index = 0; index < document.decorations.length; index += 1) {
    positions.push(document.decorations[index].anchor);
    const checkpoint = cooperativeValidationCheckpoint(
      budget,
      document.blocks.length + index + 1,
      cancellation,
    );
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  appendOriginWarningValues(issues, minimumCoordinate(positions), total);
  return true;
}

async function appendTreeWarningsAsync(
  issues: MutableStructureJsonIssues,
  document: StructureJson,
  source: ProjectBlockSpatialIndex,
  cancellation: StructureJsonValidationCancellation | undefined,
  budget: CooperativeWorkBudget,
): Promise<boolean> {
  const saplings = new Set([
    'oak',
    'spruce',
    'birch',
    'jungle',
    'acacia',
    'dark_oak',
    'mangrove',
    'cherry',
  ]);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendTreeWarning(issues, document.blocks[index], index, source, saplings);
    const checkpoint = cooperativeValidationCheckpoint(budget, index + 1, cancellation);
    if (checkpoint === true || (checkpoint instanceof Promise && (await checkpoint))) return false;
  }
  return true;
}

function appendOriginWarnings(issues: MutableStructureJsonIssues, document: StructureJson): void {
  const positions = [
    ...document.blocks.map(({ x, y, z }) => ({ x, y, z })),
    ...document.decorations.map(({ anchor }) => anchor),
  ];
  appendOriginWarningValues(issues, minimumCoordinate(positions), positions.length);
}

function minimumCoordinate(positions: readonly VoxelCoordinate[]): VoxelCoordinate | undefined {
  if (!positions.length) return undefined;
  return positions.reduce(
    (current, position) => ({
      x: Math.min(current.x, position.x),
      y: Math.min(current.y, position.y),
      z: Math.min(current.z, position.z),
    }),
    positions[0],
  );
}

function appendOriginWarningValues(
  issues: MutableStructureJsonIssues,
  min: VoxelCoordinate | undefined,
  total: number,
): void {
  if (!min || total === 0) return;
  for (const axis of ['x', 'y', 'z'] as const)
    if (min[axis] > 0)
      issues.warning.push({
        category: 'warning',
        index: -1,
        id: '__structure__',
        position: min,
        reason: { code: 'origin-offset', axis, value: min[axis] },
      });
  if (min.y > 0)
    issues.warning.push({
      category: 'warning',
      index: -1,
      id: '__structure__',
      position: min,
      reason: { code: 'possible-floating' },
    });
}

function appendTreeWarnings(
  issues: MutableStructureJsonIssues,
  document: StructureJson,
  source: ProjectBlockSpatialIndex,
): void {
  const saplings = new Set([
    'oak',
    'spruce',
    'birch',
    'jungle',
    'acacia',
    'dark_oak',
    'mangrove',
    'cherry',
  ]);
  for (let index = 0; index < document.blocks.length; index += 1)
    appendTreeWarning(issues, document.blocks[index], index, source, saplings);
}

function appendTreeWarning(
  issues: MutableStructureJsonIssues,
  block: StructureJsonBlock,
  index: number,
  source: ProjectBlockSpatialIndex,
  saplings: ReadonlySet<string>,
): void {
  const name = block.id.startsWith('minecraft:') ? block.id.slice('minecraft:'.length) : '';
  if (
    !name.endsWith('_sapling') ||
    !saplings.has(name.slice(0, -'_sapling'.length)) ||
    block.y <= 0
  )
    return;
  if (!source.has({ x: block.x, y: block.y - 1, z: block.z }))
    issues.warning.push(issue('warning', index, block, { code: 'tree-grounding' }));
}

function toPlacedBlockForValidation(
  block: StructureJsonBlock,
  definition: BlockDefinition | undefined,
): PlacedBlock {
  return definition
    ? {
        kind: 'resolved',
        id: block.id,
        namespace: definition.namespace,
        position: { x: block.x, y: block.y, z: block.z },
        state: { ...definition.defaultState, ...(block.state ?? {}) },
      }
    : {
        kind: 'missing',
        id: block.id,
        namespace: namespaceOf(block.id),
        position: { x: block.x, y: block.y, z: block.z },
        state: { ...(block.state ?? {}) },
      };
}

function namespaceOf(id: string): string {
  const separator = id.indexOf(':');
  return separator > 0 ? id.slice(0, separator) : 'unknown';
}

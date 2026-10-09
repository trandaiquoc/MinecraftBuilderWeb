import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';

export type RuleStatus = 'valid' | 'warning' | 'invalid' | 'unknown';
export type RuleReason = 'ok' | 'unknown-behavior' | 'out-of-bounds' | 'occupied' | 'missing-support' | 'locked-affected-block' | 'unstable-neighbor-update';
export interface RuleValidation { readonly status: RuleStatus; readonly reason: RuleReason; readonly affectedPositions: readonly VoxelCoordinate[]; readonly diagnostics?: readonly string[]; }
export interface RuleMutationResult { readonly validation: RuleValidation; readonly project?: ProjectDocument; readonly plannedBlocks?: readonly PlacedBlock[]; readonly changedBlocks?: readonly PlacedBlock[]; }
export type BlockDefinitionLookup = (id: string) => BlockDefinition | undefined;
export type BlockSource = readonly PlacedBlock[] | ReadonlyBlockLookup;

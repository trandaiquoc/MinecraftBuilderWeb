import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { PrecompiledTerrainFace } from './chunk-surface-mesher';
import type { TerrainCommitMetrics } from './terrain-commit-diagnostics';

export interface TerrainApplyResult {
  readonly changedKeys: readonly string[];
  readonly rebuiltChunks: readonly string[];
  readonly representedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly hydrationCandidateKeys?: readonly string[];
  readonly commitMetrics?: TerrainCommitMetrics;
  readonly pending?: boolean;
  readonly disposition?: TerrainApplyDisposition;
}

export type TerrainApplyDisposition =
  | 'accepted'
  | 'partial-unrepresented'
  | 'all-unrepresented'
  | 'commit-policy-rejected'
  | 'worker-failure'
  | 'chunk-removed';

export interface TerrainSurfaceRecord {
  readonly key: string;
  readonly block: PlacedBlock;
  readonly templates: readonly SurfaceFaceTemplate[];
  readonly compiledTemplates?: readonly PrecompiledTerrainFace[];
  readonly role?: 'normal' | 'reference';
}

export interface TerrainBlockChange {
  readonly position: VoxelCoordinate;
  readonly key: string;
  readonly before?: TerrainSurfaceRecord;
  readonly after?: TerrainSurfaceRecord;
  readonly afterOpaque: boolean;
}

export type TerrainRepresentationCommitStatus = 'committed' | 'pending' | 'failed';

export interface TerrainRepresentationCommitCallbacks {
  readonly onCommitted: () => void;
  readonly onFailed: (status: 'failed' | 'cancelled') => void;
}

export interface TerrainSettlement {
  readonly status: 'settled' | 'failed' | 'cancelled';
  readonly failedKeys: readonly string[];
}

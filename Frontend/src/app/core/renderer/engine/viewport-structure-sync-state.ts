import type { ProjectDocument } from '../../domain/project.types';
import type { VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';

export interface ViewportStructureSyncSnapshot {
  readonly syncKey: string;
  readonly project?: ProjectDocument;
  readonly blockCount?: number;
  readonly blocksReference?: ProjectDocument['blocks'];
}

interface VisibleProjectionEntry {
  readonly block: { readonly position: VoxelCoordinate };
}

/** Owns the last project structure committed to the viewport's canonical rendering. */
export class ViewportStructureSyncState {
  private current: ViewportStructureSyncSnapshot = { syncKey: '' };
  private readonly previousVisiblePositions = new Map<string, VoxelCoordinate>();

  snapshot(): ViewportStructureSyncSnapshot {
    return this.current;
  }

  /**
   * Positions from the last committed visible projection. Reconciliation and
   * culling share this identity-preserving map so the engine does not own a
   * second copy of structure-diff state.
   */
  previousVisiblePosition(key: string): VoxelCoordinate | undefined {
    return this.previousVisiblePositions.get(key);
  }
  previousVisiblePositionsSnapshot(): ReadonlyMap<string, VoxelCoordinate> {
    return this.previousVisiblePositions;
  }
  rememberVisiblePosition(position: VoxelCoordinate): void {
    this.previousVisiblePositions.set(coordinateKey(position), { ...position });
  }
  forgetVisiblePosition(key: string): void {
    this.previousVisiblePositions.delete(key);
  }
  replaceVisiblePositions(positions: readonly VoxelCoordinate[]): void {
    this.previousVisiblePositions.clear();
    for (const position of positions) this.rememberVisiblePosition(position);
  }

  replaceVisibleProjection(entries: Iterable<VisibleProjectionEntry>): void {
    this.previousVisiblePositions.clear();
    for (const entry of entries) this.rememberVisiblePosition(entry.block.position);
  }

  keyFor(project: ProjectDocument | undefined, filterKey: string): string {
    return project
      ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${filterKey}`
      : 'empty';
  }

  commit(project: ProjectDocument | undefined, syncKey: string): void {
    this.current = {
      syncKey,
      project,
      blockCount: project?.blocks.length,
      blocksReference: project?.blocks,
    };
  }

  invalidateKey(): void {
    if (this.current.syncKey) this.current = { ...this.current, syncKey: '' };
  }

  clear(): void {
    this.current = { syncKey: '' };
    this.previousVisiblePositions.clear();
  }

  hasInPlaceBlockMutation(project: ProjectDocument | undefined): boolean {
    return (
      project !== undefined &&
      project === this.current.project &&
      (project.blocks !== this.current.blocksReference ||
        project.blocks.length !== this.current.blockCount)
    );
  }

  requiresSuspendedRefresh(
    project: ProjectDocument | undefined,
    filtersChanged: boolean,
    decorationKeyChanged: boolean,
  ): boolean {
    const committed = this.current.project;
    return (
      !project ||
      !committed ||
      project.id !== committed.id ||
      project?.blocks !== this.current.blocksReference ||
      project.blocks.length !== this.current.blockCount ||
      project.groups !== committed.groups ||
      project.decorations !== committed.decorations ||
      project.metadata !== committed.metadata ||
      project.structureMode !== committed.structureMode ||
      project?.size.x !== committed?.size.x ||
      project?.size.y !== committed?.size.y ||
      project?.size.z !== committed?.size.z ||
      filtersChanged ||
      decorationKeyChanged
    );
  }
}

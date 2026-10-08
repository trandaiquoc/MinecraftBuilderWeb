import type { ProjectDocument } from '../../domain/project.types';

export interface ViewportStructureSyncSnapshot {
  readonly syncKey: string;
  readonly project?: ProjectDocument;
  readonly blockCount?: number;
  readonly blocksReference?: ProjectDocument['blocks'];
}

/** Owns the last project structure committed to the viewport's canonical rendering. */
export class ViewportStructureSyncState {
  private current: ViewportStructureSyncSnapshot = { syncKey: '' };

  snapshot(): ViewportStructureSyncSnapshot { return this.current; }

  keyFor(project: ProjectDocument | undefined, filterKey: string): string {
    return project ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${filterKey}` : 'empty';
  }

  commit(project: ProjectDocument | undefined, syncKey: string): void {
    this.current = { syncKey, project, blockCount: project?.blocks.length, blocksReference: project?.blocks };
  }

  invalidateKey(): void {
    if (this.current.syncKey) this.current = { ...this.current, syncKey: '' };
  }

  clear(): void { this.current = { syncKey: '' }; }

  hasInPlaceBlockMutation(project: ProjectDocument | undefined): boolean {
    return project !== undefined && project === this.current.project
      && (project.blocks !== this.current.blocksReference || project.blocks.length !== this.current.blockCount);
  }

  requiresSuspendedRefresh(project: ProjectDocument | undefined, filtersChanged: boolean, decorationKeyChanged: boolean): boolean {
    const committed = this.current.project;
    return project !== committed
      || project?.blocks !== this.current.blocksReference
      || project?.size.x !== committed?.size.x
      || project?.size.y !== committed?.size.y
      || project?.size.z !== committed?.size.z
      || filtersChanged
      || decorationKeyChanged;
  }
}

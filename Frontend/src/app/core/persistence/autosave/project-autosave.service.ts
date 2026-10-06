import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { IndexedDbProjectStore } from '../project-store/indexeddb-project-store';
import { ProjectPersistenceService, ProjectSaveStatus } from '../project-persistence.service';

export type EditorSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

@Injectable({ providedIn: 'root' })
export class ProjectAutosaveService implements OnDestroy {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly persistence = new ProjectPersistenceService(new IndexedDbProjectStore(), 300, (status, error) => this.receiveStatus(status, error), (error) => this.receiveCleanupError(error));
  private readonly document = inject(DOCUMENT);
  private observed?: ProjectDocument;
  readonly status = signal<EditorSaveStatus>('saved');
  readonly error = signal<string | undefined>(undefined);
  readonly dirty = signal(false);
  readonly currentRevision = signal(0);
  readonly savedRevision = signal(0);
  readonly unsafeDirty = signal(false);
  readonly cleanupWarning = signal<string | undefined>(undefined);
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => { if (!this.unsafeDirty()) return; event.preventDefault(); event.returnValue = ''; };
  private beforeUnloadAttached = false;
  private readonly synchronization = effect(() => {
    const project = this.workspace.project();
    const previous = this.observed;
    this.observed = project;
    if (!project) { this.persistence.resetTracking(); this.syncRevisionState(); return; }
    if (!previous || previous.id !== project.id) { this.persistence.resetTracking(); this.status.set('saved'); this.error.set(undefined); this.cleanupWarning.set(undefined); this.syncRevisionState(); return; }
    if (previous === project) return;
    this.dirty.set(true); this.status.set('pending'); this.error.set(undefined);
    this.persistence.markChanged(project);
    this.syncRevisionState();
  });

  flush(): Promise<void> { return this.persistence.flushAutosave().finally(() => this.syncRevisionState()); }
  deleteProject(id: string): Promise<void> { return this.persistence.delete(id).finally(() => this.syncRevisionState()); }

  get isUnsafeDirty(): boolean { return this.persistence.unsafeDirty; }

  private receiveStatus(status: ProjectSaveStatus, error?: unknown): void {
    this.status.set(status);
    if (status === 'saved') { this.dirty.set(false); this.error.set(undefined); this.cleanupWarning.set(undefined); }
    else if (status === 'error') { this.dirty.set(true); this.error.set(error instanceof Error ? error.message : 'Unable to save project'); }
    this.syncRevisionState();
  }

  private receiveCleanupError(error: unknown): void {
    this.cleanupWarning.set(error instanceof Error ? error.message : 'Recovery cleanup failed');
    this.syncRevisionState();
  }

  private syncRevisionState(): void {
    const current = this.persistence.currentRevision;
    const saved = this.persistence.savedRevision;
    const unsafe = this.persistence.unsafeDirty;
    this.currentRevision.set(current); this.savedRevision.set(saved); this.unsafeDirty.set(unsafe); this.dirty.set(unsafe);
    if (unsafe && !this.beforeUnloadAttached) { this.document.defaultView?.addEventListener('beforeunload', this.beforeUnload); this.beforeUnloadAttached = true; }
    if (!unsafe && this.beforeUnloadAttached) { this.document.defaultView?.removeEventListener('beforeunload', this.beforeUnload); this.beforeUnloadAttached = false; }
  }

  ngOnDestroy(): void {
    if (this.beforeUnloadAttached) this.document.defaultView?.removeEventListener('beforeunload', this.beforeUnload);
    this.beforeUnloadAttached = false;
    this.persistence.dispose();
  }
}

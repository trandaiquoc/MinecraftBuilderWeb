import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { PROJECT_STORE } from '../project-store/project-store.token';
import { ProjectAutosaveSession, type ProjectSaveStatus } from './project-autosave-session';
import { ProjectMutationHintService } from '../../editor/mutations/project-mutation-hint.service';

export function isEditorSettingsOnlyChange(
  previous: ProjectDocument,
  next: ProjectDocument,
): boolean {
  return (
    previous.id === next.id &&
    previous.schemaVersion === next.schemaVersion &&
    previous.metadata === next.metadata &&
    previous.size === next.size &&
    previous.structureMode === next.structureMode &&
    previous.blocks === next.blocks &&
    previous.groups === next.groups &&
    previous.decorations === next.decorations &&
    previous.editorSettings !== next.editorSettings
  );
}

export type EditorSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export function applyBeforeUnloadGuard(event: BeforeUnloadEvent, unsafeDirty: boolean): void {
  if (!unsafeDirty) return;
  event.preventDefault();
  event.returnValue = '';
}

@Injectable({ providedIn: 'root' })
export class ProjectAutosaveService implements OnDestroy {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly mutationHints = inject(ProjectMutationHintService);
  private readonly persistence = new ProjectAutosaveSession(
    inject(PROJECT_STORE),
    300,
    (status, error) => this.receiveStatus(status, error),
    (error) => this.receiveCleanupError(error),
  );
  private readonly document = inject(DOCUMENT);
  private observed?: ProjectDocument;
  private readonly statusState = signal<EditorSaveStatus>('saved');
  private readonly errorState = signal<string | undefined>(undefined);
  private readonly dirtyState = signal(false);
  private readonly currentRevisionState = signal(0);
  private readonly savedRevisionState = signal(0);
  private readonly unsafeDirtyState = signal(false);
  private readonly cleanupWarningState = signal<string | undefined>(undefined);
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly dirty = this.dirtyState.asReadonly();
  readonly currentRevision = this.currentRevisionState.asReadonly();
  readonly savedRevision = this.savedRevisionState.asReadonly();
  readonly unsafeDirty = this.unsafeDirtyState.asReadonly();
  readonly cleanupWarning = this.cleanupWarningState.asReadonly();
  private readonly beforeUnload = (event: BeforeUnloadEvent): void =>
    applyBeforeUnloadGuard(event, this.unsafeDirty());
  private beforeUnloadAttached = false;
  private readonly synchronization = effect(() => {
    const project = this.workspace.project();
    const previous = this.observed;
    this.observed = project;
    if (!project) {
      this.persistence.resetTracking();
      this.syncRevisionState();
      return;
    }
    if (!previous || previous.id !== project.id) {
      this.persistence.resetTracking();
      this.statusState.set('saved');
      this.errorState.set(undefined);
      this.cleanupWarningState.set(undefined);
      this.syncRevisionState();
      return;
    }
    if (previous === project) return;
    this.dirtyState.set(true);
    this.statusState.set('pending');
    this.errorState.set(undefined);
    if (
      isEditorSettingsOnlyChange(previous, project) &&
      !this.mutationHints.matchesTransition(previous, project)
    )
      this.persistence.markEditorSettingsChanged(project);
    else this.persistence.markChanged(project);
    this.syncRevisionState();
  });

  flush(): Promise<void> {
    return this.persistence.flushAutosave().finally(() => this.syncRevisionState());
  }
  deleteProject(id: string): Promise<void> {
    return this.persistence.delete(id).finally(() => this.syncRevisionState());
  }

  get isUnsafeDirty(): boolean {
    return this.persistence.unsafeDirty;
  }

  private receiveStatus(status: ProjectSaveStatus, error?: unknown): void {
    this.statusState.set(status);
    if (status === 'saved') {
      this.dirtyState.set(false);
      this.errorState.set(undefined);
      this.cleanupWarningState.set(undefined);
    } else if (status === 'error') {
      this.dirtyState.set(true);
      this.errorState.set(error instanceof Error ? error.message : 'Unable to save project');
    }
    this.syncRevisionState();
  }

  private receiveCleanupError(error?: unknown): void {
    if (error === undefined) {
      this.cleanupWarningState.set(undefined);
      this.syncRevisionState();
      return;
    }
    this.cleanupWarningState.set(
      error instanceof Error ? error.message : 'Recovery cleanup failed',
    );
    this.syncRevisionState();
  }

  private syncRevisionState(): void {
    const current = this.persistence.currentRevision;
    const saved = this.persistence.savedRevision;
    const unsafe = this.persistence.unsafeDirty;
    this.currentRevisionState.set(current);
    this.savedRevisionState.set(saved);
    this.unsafeDirtyState.set(unsafe);
    this.dirtyState.set(unsafe);
    if (unsafe && !this.beforeUnloadAttached) {
      this.document.defaultView?.addEventListener('beforeunload', this.beforeUnload);
      this.beforeUnloadAttached = true;
    }
    if (!unsafe && this.beforeUnloadAttached) {
      this.document.defaultView?.removeEventListener('beforeunload', this.beforeUnload);
      this.beforeUnloadAttached = false;
    }
  }

  ngOnDestroy(): void {
    if (this.beforeUnloadAttached)
      this.document.defaultView?.removeEventListener('beforeunload', this.beforeUnload);
    this.beforeUnloadAttached = false;
    this.persistence.dispose();
  }
}

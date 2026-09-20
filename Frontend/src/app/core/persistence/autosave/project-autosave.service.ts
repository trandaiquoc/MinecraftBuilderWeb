import { Injectable, effect, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { IndexedDbProjectStore } from '../project-store/indexeddb-project-store';
import { ProjectPersistenceService, ProjectSaveStatus } from '../project-persistence.service';

export type EditorSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

@Injectable({ providedIn: 'root' })
export class ProjectAutosaveService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly persistence = new ProjectPersistenceService(new IndexedDbProjectStore(), 300, (status, error) => this.receiveStatus(status, error));
  private observed?: ProjectDocument;
  readonly status = signal<EditorSaveStatus>('saved');
  readonly error = signal<string | undefined>(undefined);
  readonly dirty = signal(false);
  private readonly synchronization = effect(() => {
    const project = this.workspace.project();
    const previous = this.observed;
    this.observed = project;
    if (!project) return;
    if (!previous || previous.id !== project.id) { this.status.set('saved'); this.error.set(undefined); this.dirty.set(false); return; }
    if (previous === project) return;
    this.dirty.set(true); this.status.set('pending'); this.error.set(undefined);
    this.persistence.markChanged(project);
  });

  flush(): Promise<void> { return this.persistence.flushAutosave(); }

  private receiveStatus(status: ProjectSaveStatus, error?: unknown): void {
    this.status.set(status);
    if (status === 'saved') { this.dirty.set(false); this.error.set(undefined); }
    else if (status === 'error') { this.dirty.set(true); this.error.set(error instanceof Error ? error.message : 'Unable to save project'); }
  }
}

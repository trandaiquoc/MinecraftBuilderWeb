import { Injectable, inject } from '@angular/core';
import { EditorSessionService } from '../editor/state/editor-session.service';
import { ProjectAutosaveService } from './autosave/project-autosave.service';
import { PROJECT_STORE } from './project-store/project-store.token';
import { WorkspaceStateService } from '../workspace/workspace-state.service';

/** Owns deletion persistence and the matching active/remembered workspace cleanup. */
@Injectable({ providedIn: 'root' })
export class ProjectDeletionService {
  private readonly store = inject(PROJECT_STORE);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly session = inject(EditorSessionService);
  private readonly autosave = inject(ProjectAutosaveService);

  async deleteProject(projectId: string): Promise<void> {
    const activeAtStart = this.workspace.project()?.id === projectId;
    if (activeAtStart) await this.autosave.deleteProject(projectId);
    else await this.store.delete(projectId);

    if (this.workspace.project()?.id === projectId) {
      this.session.clearActiveProject();
      this.workspace.deactivate();
    } else {
      this.workspace.clearRememberedProject(projectId);
    }
  }
}

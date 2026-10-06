import { Injectable, inject, signal } from '@angular/core';
import { DecorationService } from '../../decorations/decoration.service';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { GroupService } from '../groups/group.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import type { ProjectDocument } from '../../domain/project.types';

/** Coordinates transient editor state when the active project changes. */
@Injectable({ providedIn: 'root' })
export class EditorSessionService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly groups = inject(GroupService);
  private readonly decorations = inject(DecorationService);
  private readonly currentYPreview = signal<{ readonly projectId: string; readonly y: number } | undefined>(undefined);

  currentY(project: ProjectDocument | undefined): number {
    if (!project) return 0;
    const preview = this.currentYPreview();
    return preview?.projectId === project.id ? preview.y : project.editorSettings.currentY;
  }

  previewCurrentY(projectId: string, y: number): void { this.currentYPreview.set({ projectId, y }); }

  clearCurrentYPreview(projectId?: string): void {
    const preview = this.currentYPreview();
    if (!projectId || preview?.projectId === projectId) this.currentYPreview.set(undefined);
  }

  resetForProjectChange(nextProjectId: string, force = false): void {
    if (!force && this.workspace.project()?.id === nextProjectId) return;
    this.clearCurrentYPreview();
    this.history.clear();
    this.selection.clear();
    this.groups.resetForProjectChange();
    this.decorations.resetSelectionForProjectChange();
  }

  clearActiveProject(): void {
    this.clearCurrentYPreview();
    this.history.clear();
    this.selection.clear();
    this.groups.resetForProjectChange();
    this.decorations.resetSelectionForProjectChange();
  }
}

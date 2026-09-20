import { Injectable, inject } from '@angular/core';
import { DecorationService } from '../../decorations/decoration.service';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { GroupService } from '../groups/group.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';

/** Coordinates transient editor state when the active project changes. */
@Injectable({ providedIn: 'root' })
export class EditorSessionService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly groups = inject(GroupService);
  private readonly decorations = inject(DecorationService);

  resetForProjectChange(nextProjectId: string, force = false): void {
    if (!force && this.workspace.project()?.id === nextProjectId) return;
    this.history.clear();
    this.selection.clear();
    this.groups.resetForProjectChange();
    this.decorations.resetSelectionForProjectChange();
  }
}

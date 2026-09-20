import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';

interface HistoryEntry { readonly label: string; readonly before: ProjectDocument; readonly after: ProjectDocument; }

@Injectable({ providedIn: 'root' })
export class HistoryService {
  constructor(private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService)) {}
  private readonly undoStack = signal<readonly HistoryEntry[]>([]);
  private readonly redoStack = signal<readonly HistoryEntry[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly lastLabel = computed(() => this.undoStack().at(-1)?.label);

  execute(label: string, change: (project: ProjectDocument) => ProjectDocument | undefined): boolean {
    const before = this.workspace.project();
    if (!before) return false;
    const after = change(before);
    if (!after || after === before) return false;
    this.workspace.project.set(after);
    this.undoStack.update((entries) => [...entries, { label, before, after }]);
    this.redoStack.set([]);
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack().at(-1);
    if (!entry) return false;
    this.workspace.project.set(entry.before);
    this.undoStack.update((entries) => entries.slice(0, -1));
    this.redoStack.update((entries) => [...entries, entry]);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack().at(-1);
    if (!entry) return false;
    this.workspace.project.set(entry.after);
    this.redoStack.update((entries) => entries.slice(0, -1));
    this.undoStack.update((entries) => [...entries, entry]);
    return true;
  }

  clear(): void { this.undoStack.set([]); this.redoStack.set([]); }
}

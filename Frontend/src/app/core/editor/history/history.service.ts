import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { projectCoordinatesAreNonNegative } from '../../domain/coordinates';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { ProjectMutationHintService } from '../mutations/project-mutation-hint.service';
import { invertProjectMutationHint, ProjectMutationHint } from '../mutations/project-mutation-hint';

interface HistoryEntry { readonly label: string; readonly before: ProjectDocument; readonly after: ProjectDocument; readonly mutationHint?: ProjectMutationHint; }

@Injectable({ providedIn: 'root' })
export class HistoryService {
  constructor(private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService), private readonly mutationHints?: ProjectMutationHintService) {}
  private readonly undoStack = signal<readonly HistoryEntry[]>([]);
  private readonly redoStack = signal<readonly HistoryEntry[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly lastLabel = computed(() => this.undoStack().at(-1)?.label);

  execute(label: string, change: (project: ProjectDocument) => ProjectDocument | undefined): boolean {
    return this.executeWithMutation(label, change);
  }

  executeWithMutation(label: string, change: (project: ProjectDocument) => ProjectDocument | undefined, hintFactory?: (before: ProjectDocument, after: ProjectDocument) => ProjectMutationHint | undefined): boolean {
    const before = this.workspace.project();
    if (!before) return false;
    const after = change(before);
    if (!after || after === before || !projectCoordinatesAreNonNegative(after)) return false;
    const mutationHint = hintFactory?.(before, after);
    if (mutationHint) this.mutationHints?.publish(before, after, mutationHint);
    else this.mutationHints?.clear();
    this.workspace.project.set(after);
    this.undoStack.update((entries) => [...entries, { label, before, after, mutationHint }]);
    this.redoStack.set([]);
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack().at(-1);
    if (!entry) return false;
    if (entry.mutationHint) this.mutationHints?.publish(entry.after, entry.before, invertProjectMutationHint(entry.mutationHint));
    else this.mutationHints?.clear();
    this.workspace.project.set(entry.before);
    this.undoStack.update((entries) => entries.slice(0, -1));
    this.redoStack.update((entries) => [...entries, entry]);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack().at(-1);
    if (!entry) return false;
    if (entry.mutationHint) this.mutationHints?.publish(entry.before, entry.after, entry.mutationHint);
    else this.mutationHints?.clear();
    this.workspace.project.set(entry.after);
    this.redoStack.update((entries) => entries.slice(0, -1));
    this.undoStack.update((entries) => [...entries, entry]);
    return true;
  }

  clear(): void { this.undoStack.set([]); this.redoStack.set([]); }
}

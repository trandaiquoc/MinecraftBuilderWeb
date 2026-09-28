import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { recordB5Command, recordB5Mutation } from '../input/b5-runtime-diagnostics.service';

interface HistoryEntry { readonly label: string; readonly before: ProjectDocument; readonly after: ProjectDocument; readonly source: string; }
export interface HistoryProvenance { readonly source?: string; readonly operation?: string; }

@Injectable({ providedIn: 'root' })
export class HistoryService {
  constructor(private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService)) {}
  private readonly undoStack = signal<readonly HistoryEntry[]>([]);
  private readonly redoStack = signal<readonly HistoryEntry[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly lastLabel = computed(() => this.undoStack().at(-1)?.label);

  execute(label: string, change: (project: ProjectDocument) => ProjectDocument | undefined, provenance: HistoryProvenance = {}): boolean {
    const before = this.workspace.project();
    if (!before) return false;
    const after = change(before);
    if (!after || after === before) return false;
    const stack = new Error().stack;
    this.workspace.project.set(after);
    const source = provenance.source ?? 'history.execute';
    recordB5Mutation(source, label, before, after, { operation: provenance.operation ?? 'execute', stack });
    recordB5Command({ type: 'history-command', source, operation: provenance.operation ?? 'execute', label, timestamp: new Date().toISOString(), beforeProjectId: before.id, afterProjectId: after.id, beforeBlockCount: before.blocks.length, afterBlockCount: after.blocks.length });
    this.undoStack.update((entries) => [...entries, { label, before, after, source }]);
    this.redoStack.set([]);
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack().at(-1);
    if (!entry) return false;
    const stack = new Error().stack;
    this.workspace.project.set(entry.before);
    recordB5Mutation('history.undo', entry.label, entry.after, entry.before, { operation: 'undo', stack });
    recordB5Command({ type: 'history-command', source: entry.source, operation: 'undo', label: entry.label, timestamp: new Date().toISOString(), projectId: entry.before.id, beforeBlockCount: entry.after.blocks.length, afterBlockCount: entry.before.blocks.length });
    this.undoStack.update((entries) => entries.slice(0, -1));
    this.redoStack.update((entries) => [...entries, entry]);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack().at(-1);
    if (!entry) return false;
    const stack = new Error().stack;
    this.workspace.project.set(entry.after);
    recordB5Mutation('history.redo', entry.label, entry.before, entry.after, { operation: 'redo', stack });
    recordB5Command({ type: 'history-command', source: entry.source, operation: 'redo', label: entry.label, timestamp: new Date().toISOString(), projectId: entry.after.id, beforeBlockCount: entry.before.blocks.length, afterBlockCount: entry.after.blocks.length });
    this.redoStack.update((entries) => entries.slice(0, -1));
    this.undoStack.update((entries) => [...entries, entry]);
    return true;
  }

  clear(): void { this.undoStack.set([]); this.redoStack.set([]); }
}

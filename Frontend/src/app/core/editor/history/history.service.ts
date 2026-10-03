import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectDocument } from '../../domain/project.types';
import { isWithinBounds, projectCoordinatesAreNonNegative } from '../../domain/coordinates';
import type { RuntimeProjectBlockStore } from '../../domain/project-block-spatial-index';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';

interface SnapshotHistoryEntry { readonly kind: 'snapshot'; readonly label: string; readonly before: ProjectDocument; readonly after: ProjectDocument; }
interface DeltaHistoryEntry { readonly kind: 'delta'; readonly label: string; readonly before: ProjectDocument; readonly after: ProjectDocument; readonly inverse: RuntimeBlockDelta; readonly forward: RuntimeBlockDelta; }
type HistoryEntry = SnapshotHistoryEntry | DeltaHistoryEntry;

export interface RuntimeBlockUpdate { readonly before: PlacedBlock; readonly after: PlacedBlock; }
export interface RuntimeBlockMove { readonly before: VoxelCoordinate; readonly after: VoxelCoordinate; }
export interface RuntimeBlockDelta {
  readonly added?: readonly PlacedBlock[];
  readonly removed?: readonly PlacedBlock[];
  readonly updated?: readonly RuntimeBlockUpdate[];
  readonly moved?: readonly RuntimeBlockMove[];
}
export interface RuntimeDeltaTransaction {
  readonly delta: RuntimeBlockDelta;
  /** Metadata/groups/decorations patch. `blocks` is intentionally excluded. */
  readonly project?: Partial<Omit<ProjectDocument, 'blocks'>>;
}

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
    this.workspace.ensureRuntime(before);
    const after = change(before);
    if (!after || after === before || !projectCoordinatesAreNonNegative(after)) return false;
    this.workspace.project.set(after);
    this.workspace.syncRuntime(after);
    this.undoStack.update((entries) => [...entries, { kind: 'snapshot', label, before, after }]);
    this.redoStack.set([]);
    return true;
  }

  /**
   * Fast local transaction path. It records only changed records and validates
   * only resulting coordinates; full document validation remains on execute().
   */
  executeDelta(label: string, change: (project: ProjectDocument, runtime: RuntimeProjectBlockStore) => RuntimeDeltaTransaction | undefined): boolean {
    const before = this.workspace.project();
    if (!before) return false;
    const runtime = this.workspace.ensureRuntime(before);
    const transaction = change(before, runtime);
    if (!transaction || !isValidDelta(transaction.delta, before)) return false;
    if (!applyDelta(runtime, transaction.delta)) return false;
    this.workspace.publishRuntimeDelta(transaction.project);
    const after = this.workspace.project(); if (!after) return false;
    this.undoStack.update((entries) => [...entries, { kind: 'delta', label, before: withoutBlocks(before), after: withoutBlocks(after), inverse: invertDelta(transaction.delta), forward: transaction.delta }]);
    this.redoStack.set([]);
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack().at(-1);
    if (!entry) return false;
    if (entry.kind === 'delta') {
      const current = this.workspace.project(); if (!current) return false;
      const runtime = this.workspace.ensureRuntime(current); if (!applyDelta(runtime, entry.inverse)) return false;
      this.workspace.publishRuntimeDelta(entry.before);
    } else {
      this.workspace.project.set(entry.before); this.workspace.syncRuntime(entry.before);
    }
    this.undoStack.update((entries) => entries.slice(0, -1));
    this.redoStack.update((entries) => [...entries, entry]);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack().at(-1);
    if (!entry) return false;
    if (entry.kind === 'delta') {
      const current = this.workspace.project(); if (!current) return false;
      const runtime = this.workspace.ensureRuntime(current); if (!applyDelta(runtime, entry.forward)) return false;
      this.workspace.publishRuntimeDelta(entry.after);
    } else {
      this.workspace.project.set(entry.after); this.workspace.syncRuntime(entry.after);
    }
    this.redoStack.update((entries) => entries.slice(0, -1));
    this.undoStack.update((entries) => [...entries, entry]);
    return true;
  }

  clear(): void { this.undoStack.set([]); this.redoStack.set([]); }
}

function withoutBlocks(project: ProjectDocument): ProjectDocument { return { ...project, blocks: [] }; }

function isValidDelta(delta: RuntimeBlockDelta, project: ProjectDocument): boolean {
  for (const block of [...(delta.added ?? []), ...(delta.updated ?? []).map((entry) => entry.after)]) if (!isWithinBounds(block.position, project.size)) return false;
  for (const move of delta.moved ?? []) if (!isWithinBounds(move.after, project.size)) return false;
  return true;
}

function applyDelta(runtime: RuntimeProjectBlockStore, delta: RuntimeBlockDelta): boolean {
  const removed = delta.removed ?? [];
  for (const block of removed) if (!runtime.get(block.position)) return false;
  for (const update of delta.updated ?? []) if (!runtime.get(update.before.position)) return false;
  if ((delta.moved?.length ?? 0) && !runtime.moveBatch(delta.moved!)) return false;
  for (const block of removed) runtime.remove(block.position);
  for (const update of delta.updated ?? []) if (!runtime.update(update.before.position, update.after)) return false;
  for (const block of delta.added ?? []) if (!runtime.add(block)) return false;
  return true;
}

function invertDelta(delta: RuntimeBlockDelta): RuntimeBlockDelta {
  return { added: delta.removed, removed: delta.added, updated: (delta.updated ?? []).map((entry) => ({ before: entry.after, after: entry.before })), moved: (delta.moved ?? []).map((move) => ({ before: move.after, after: move.before })) };
}

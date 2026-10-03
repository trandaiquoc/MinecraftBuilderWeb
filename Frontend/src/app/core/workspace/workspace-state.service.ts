import { Injectable, signal } from '@angular/core';
import { ProjectDocument } from '../domain/project.types';
import { migrateProject } from '../domain/migrations';
import { ProjectStore } from '../persistence/project-store/project-store.port';
import { RuntimeProjectBlockStore } from '../domain/project-block-spatial-index';

export const ACTIVE_PROJECT_KEY = 'minecraft-builder.active-project';

export type WorkspaceRestoreStatus = 'idle' | 'restoring' | 'ready' | 'empty' | 'error';

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  readonly project = signal<ProjectDocument | undefined>(undefined);
  readonly runtimeRevision = signal(0);
  /** Live editor index. Persisted ProjectDocument remains the cold snapshot boundary. */
  readonly runtime = new RuntimeProjectBlockStore();
  private runtimeSource?: ProjectDocument;
  readonly restoreStatus = signal<WorkspaceRestoreStatus>('idle');
  readonly restoreError = signal<string | undefined>(undefined);
  private restorePromise?: Promise<ProjectDocument | undefined>;

  activate(project: ProjectDocument, storage: Pick<Storage, 'setItem'> | undefined = browserStorage()): void {
    const migrated = migrateProject(project);
    this.project.set(migrated);
    this.runtime.hydrate(migrated.id, migrated.blocks);
    this.runtimeSource = migrated;
    this.runtimeRevision.update((revision) => revision + 1);
    this.restoreStatus.set('ready');
    this.restoreError.set(undefined);
    try { storage?.setItem(ACTIVE_PROJECT_KEY, project.id); } catch { /* The project remains usable when browser storage is unavailable. */ }
  }

  deactivate(storage: Pick<Storage, 'removeItem'> | undefined = browserStorage()): void {
    this.project.set(undefined);
    this.runtime.clear();
    this.runtimeSource = undefined;
    this.runtimeRevision.update((revision) => revision + 1);
    this.restoreStatus.set('empty');
    this.restoreError.set(undefined);
    try { storage?.removeItem(ACTIVE_PROJECT_KEY); } catch { /* In-memory workspace is still cleared. */ }
  }

  /** Ensures the runtime index follows a project assigned by open/restore or a test. */
  ensureRuntime(project: ProjectDocument | undefined = this.project()): RuntimeProjectBlockStore {
    if (project && (this.runtime.projectId !== project.id || this.runtimeSource !== project)) { this.runtime.hydrate(project.id, project.blocks); this.runtimeSource = project; }
    return this.runtime;
  }

  /** Synchronizes the runtime index after a cold snapshot transaction. */
  syncRuntime(project: ProjectDocument | undefined = this.project()): void {
    if (project) { this.runtime.hydrate(project.id, project.blocks); this.runtimeSource = project; this.runtimeRevision.update((revision) => revision + 1); }
    else { this.runtime.clear(); this.runtimeSource = undefined; }
  }

  /** Materialization is intentionally explicit and reserved for persistence/export/cold boundaries. */
  materializeRuntime(project: ProjectDocument | undefined = this.project()): ProjectDocument | undefined {
    if (!project) return undefined;
    this.ensureRuntime(project);
    return { ...project, blocks: this.runtime.snapshot() };
  }

  /** Publishes a snapshot produced by the live store without hydrating it again. */
  publishRuntimeSnapshot(project: ProjectDocument): void {
    this.project.set(project);
    this.runtimeSource = project;
    this.runtimeRevision.update((revision) => revision + 1);
  }

  /** Publishes metadata/reactivity for a live delta without materializing large block arrays. */
  publishRuntimeDelta(patch: Partial<Omit<ProjectDocument, 'blocks'>> = {}): void {
    const current = this.project();
    if (!current) return;
    const blocks = current.blocks.length <= RUNTIME_COMPATIBILITY_SNAPSHOT_LIMIT ? this.runtime.snapshot() : current.blocks;
    const next = { ...current, ...patch, blocks };
    this.project.set(next);
    this.runtimeSource = next;
    this.runtimeRevision.update((revision) => revision + 1);
  }

  isRememberedProject(id: string, storage: Pick<Storage, 'getItem'> | undefined = browserStorage()): boolean {
    try { return storage?.getItem(ACTIVE_PROJECT_KEY) === id; } catch { return false; }
  }

  clearRememberedProject(id: string, storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = browserStorage()): void {
    try { if (storage?.getItem(ACTIVE_PROJECT_KEY) === id) storage.removeItem(ACTIVE_PROJECT_KEY); } catch { /* The project list remains usable when browser storage is unavailable. */ }
  }

  restore(store: ProjectStore, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage()): Promise<ProjectDocument | undefined> {
    if (this.project()) return Promise.resolve(this.project());
    if (this.restorePromise) return this.restorePromise;
    const attempt = this.restoreFromStore(store, storage);
    let wrapped!: Promise<ProjectDocument | undefined>;
    wrapped = attempt.finally(() => { if (this.restorePromise === wrapped) this.restorePromise = undefined; });
    this.restorePromise = wrapped;
    return wrapped;
  }

  private async restoreFromStore(store: ProjectStore, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): Promise<ProjectDocument | undefined> {
    this.restoreStatus.set('restoring');
    this.restoreError.set(undefined);
    try {
      let activeId: string | null = null;
      try { activeId = storage?.getItem(ACTIVE_PROJECT_KEY) ?? null; } catch { /* Fall back to the newest IndexedDB project. */ }
      let restored = activeId ? await store.open(activeId) : undefined;
      if (!restored) {
        const newest = (await store.list())[0];
        restored = newest ? await store.open(newest.id) : undefined;
      }
      if (restored) this.activate(migrateProject(restored), storage);
      else this.restoreStatus.set('empty');
      return restored;
    } catch (error) {
      this.restoreStatus.set('error');
      this.restoreError.set(error instanceof Error ? error.message : 'Unable to restore the active project');
      return undefined;
    }
  }
}

const RUNTIME_COMPATIBILITY_SNAPSHOT_LIMIT = 4096;

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

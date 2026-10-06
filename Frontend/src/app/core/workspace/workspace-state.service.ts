import { Injectable, isDevMode, signal } from '@angular/core';
import { ProjectDocument } from '../domain/project.types';
import { migrateProject } from '../domain/migrations';
import { ProjectStore } from '../persistence/project-store/project-store.port';
import { ProjectPersistenceMetadata, ProjectRecord } from '../persistence/project-store/project-store.port';
import { validateProject } from '../domain/validation';

export const ACTIVE_PROJECT_KEY = 'minecraft-builder.active-project';

export type WorkspaceRestoreStatus = 'idle' | 'restoring' | 'recovery-pending' | 'recovery-error' | 'ready' | 'empty' | 'error';

export interface RecoveryCandidate {
  readonly project: ProjectDocument;
  readonly projectId: string;
  readonly mainProject?: ProjectDocument;
  readonly metadata: ProjectPersistenceMetadata;
  readonly valid: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  readonly project = signal<ProjectDocument | undefined>(undefined);
  readonly restoreStatus = signal<WorkspaceRestoreStatus>('idle');
  readonly restoreError = signal<string | undefined>(undefined);
  readonly recoveryCandidate = signal<RecoveryCandidate | undefined>(undefined);
  private restorePromise?: Promise<ProjectDocument | undefined>;

  constructor() {
    if (isDevMode() && typeof window !== 'undefined') {
      const target = window as Window & { __mbRecoveryDiagnostics?: RecoveryDiagnostics };
      target.__mbRecoveryDiagnostics = {
        stageFromCurrentProject: async () => {
          const project = this.project();
          if (!project || !this.restoreStore) throw new Error('Open a project before staging recovery');
          await this.restoreStore.saveRecoverySnapshot(project, { persistenceToken: `dev-recovery-${Date.now()}`, persistedAt: new Date().toISOString() });
        },
        clear: async (projectId: string) => {
          if (!this.restoreStore) throw new Error('Workspace store is not ready');
          await this.restoreStore.deleteRecoverySnapshot(projectId);
        },
        inspect: async (projectId: string) => {
          if (!this.restoreStore) throw new Error('Workspace store is not ready');
          return this.restoreStore.openRecoveryRecord ? this.restoreStore.openRecoveryRecord(projectId) : this.restoreStore.openRecoverySnapshot(projectId);
        },
      };
    }
  }

  activate(project: ProjectDocument, storage: Pick<Storage, 'setItem'> | undefined = browserStorage()): void {
    this.project.set(migrateProject(project));
    this.restoreStatus.set('ready');
    this.restoreError.set(undefined);
    this.recoveryCandidate.set(undefined);
    try { storage?.setItem(ACTIVE_PROJECT_KEY, project.id); } catch { /* The project remains usable when browser storage is unavailable. */ }
  }

  deactivate(storage: Pick<Storage, 'removeItem'> | undefined = browserStorage()): void {
    this.project.set(undefined);
    this.restoreStatus.set('empty');
    this.restoreError.set(undefined);
    this.recoveryCandidate.set(undefined);
    try { storage?.removeItem(ACTIVE_PROJECT_KEY); } catch { /* In-memory workspace is still cleared. */ }
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

  async restoreRecovery(): Promise<ProjectDocument | undefined> {
    const pending = this.recoveryCandidate();
    const store = this.restoreStore;
    if (!pending || !store) return undefined;
    try {
      const metadata = pending.metadata.persistenceToken ? pending.metadata : { persistenceToken: createPersistenceToken(), persistedAt: new Date().toISOString() };
      if (pending.mainProject) await store.save(pending.project, metadata);
      else await store.create(pending.project, metadata);
      let cleanupError: unknown;
      try { await store.deleteRecoverySnapshot(pending.projectId); } catch (error) { cleanupError = error; }
      this.activate(pending.project, this.restoreStorage);
      if (cleanupError) this.restoreError.set(cleanupError instanceof Error ? cleanupError.message : 'Recovery cleanup failed');
      return pending.project;
    } catch (error) {
      this.restoreStatus.set('recovery-error');
      this.restoreError.set(error instanceof Error ? error.message : 'Unable to restore recovery data');
      return undefined;
    }
  }

  async discardRecovery(): Promise<boolean> {
    const pending = this.recoveryCandidate();
    const store = this.restoreStore;
    if (!pending || !store) return false;
    try {
      await store.deleteRecoverySnapshot(pending.projectId);
      this.continueWithMain();
      return true;
    } catch (error) {
      this.restoreStatus.set('recovery-error');
      this.restoreError.set(error instanceof Error ? error.message : 'Unable to discard recovery data');
      return false;
    }
  }

  continueWithMain(): void {
    const pending = this.recoveryCandidate();
    if (pending?.mainProject) this.activate(pending.mainProject, this.restoreStorage);
    else { this.recoveryCandidate.set(undefined); this.restoreStatus.set('empty'); }
  }

  private restoreStore?: ProjectStore;
  private restoreStorage?: Pick<Storage, 'getItem' | 'setItem'>;

  private async restoreFromStore(store: ProjectStore, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): Promise<ProjectDocument | undefined> {
    this.restoreStore = store;
    this.restoreStorage = storage;
    this.restoreStatus.set('restoring');
    this.restoreError.set(undefined);
    try {
      let activeId: string | null = null;
      try { activeId = storage?.getItem(ACTIVE_PROJECT_KEY) ?? null; } catch { /* Fall back to the newest IndexedDB project. */ }
      let mainRecord = activeId ? await readRecord(store, activeId) : undefined;
      if (!mainRecord) {
        const newest = (await store.list())[0];
        mainRecord = newest ? await readRecord(store, newest.id) : undefined;
      }
      const mainProject = mainRecord?.project;
      const recoveryId = mainProject?.id ?? activeId;
      const recovery = recoveryId ? await readRecoveryRecord(store, recoveryId) : undefined;
      if (recovery) {
        let recovered: ProjectDocument;
        try { recovered = migrateProject(recovery.project); }
        catch (error) { this.recoveryCandidate.set({ project: recovery.project, projectId: recoveryId!, mainProject, metadata: recovery.metadata, valid: false }); this.restoreStatus.set('recovery-error'); this.restoreError.set(error instanceof Error ? error.message : 'Recovery data is invalid'); return undefined; }
        const validation = validateProject(recovered);
        if (!validation.valid) {
          this.recoveryCandidate.set({ project: recovered, projectId: recoveryId!, mainProject, metadata: recovery.metadata, valid: false });
          this.restoreStatus.set('recovery-error');
          this.restoreError.set(validation.issues.map((issue) => issue.message).join('; '));
          return undefined;
        }
        if (mainRecord?.metadata.persistenceToken && recovery.metadata.persistenceToken && mainRecord.metadata.persistenceToken === recovery.metadata.persistenceToken) {
          try { await store.deleteRecoverySnapshot(recovered.id); } catch { /* Main is already safe; stale residue is non-blocking. */ }
        } else {
          this.recoveryCandidate.set({ project: recovered, projectId: recoveryId!, mainProject, metadata: recovery.metadata, valid: true });
          this.restoreStatus.set('recovery-pending');
          return undefined;
        }
      }
      if (mainProject) this.activate(mainProject, storage); else this.restoreStatus.set('empty');
      return mainProject;
    } catch (error) {
      this.restoreStatus.set('error');
      this.restoreError.set(error instanceof Error ? error.message : 'Unable to restore the active project');
      return undefined;
    }
  }
}

interface RecoveryDiagnostics {
  readonly stageFromCurrentProject: () => Promise<void>;
  readonly clear: (projectId: string) => Promise<void>;
  readonly inspect: (projectId: string) => Promise<unknown>;
}

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

async function readRecord(store: ProjectStore, id: string): Promise<ProjectRecord | undefined> {
  if (store.openRecord) return store.openRecord(id);
  const project = await store.open(id);
  return project ? { project, metadata: {} } : undefined;
}

async function readRecoveryRecord(store: ProjectStore, id: string): Promise<ProjectRecord | undefined> {
  if (store.openRecoveryRecord) return store.openRecoveryRecord(id);
  const project = await store.openRecoverySnapshot(id);
  return project ? { project, metadata: {} } : undefined;
}

function createPersistenceToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `persist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

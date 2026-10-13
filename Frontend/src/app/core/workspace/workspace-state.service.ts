import { Injectable, signal } from '@angular/core';
import { ProjectDocument } from '../domain/project.types';
import { migrateProject } from '../domain/migrations';
import {
  ProjectPersistenceMetadata,
  ProjectRecord,
  ProjectStore,
} from '../persistence/project-store/project-store.port';
import { validateProject } from '../domain/validation';
import { installWorkspaceRecoveryDiagnostics } from './workspace-recovery-diagnostics';

export const ACTIVE_PROJECT_KEY = 'the-block-laundromat.active-project';
export const LEGACY_ACTIVE_PROJECT_KEY = 'minecraft-builder.active-project';

export type WorkspaceRestoreStatus =
  'idle' | 'restoring' | 'recovery-pending' | 'recovery-error' | 'ready' | 'empty' | 'error';

export interface RecoveryCandidate {
  readonly project: ProjectDocument;
  readonly projectId: string;
  readonly mainProject?: ProjectDocument;
  readonly metadata: ProjectPersistenceMetadata;
  readonly valid: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  private readonly projectState = signal<ProjectDocument | undefined>(undefined);
  private readonly restoreStatusState = signal<WorkspaceRestoreStatus>('idle');
  private readonly restoreErrorState = signal<string | undefined>(undefined);
  private readonly recoveryCandidateState = signal<RecoveryCandidate | undefined>(undefined);
  readonly project = this.projectState.asReadonly();
  readonly restoreStatus = this.restoreStatusState.asReadonly();
  readonly restoreError = this.restoreErrorState.asReadonly();
  readonly recoveryCandidate = this.recoveryCandidateState.asReadonly();
  private restorePromise?: Promise<ProjectDocument | undefined>;

  constructor() {
    installWorkspaceRecoveryDiagnostics({
      currentProject: () => this.project(),
      store: () => this.restoreStore,
    });
  }

  activate(
    project: ProjectDocument,
    storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
  ): void {
    this.projectState.set(migrateProject(project));
    this.restoreStatusState.set('ready');
    this.restoreErrorState.set(undefined);
    this.recoveryCandidateState.set(undefined);
    try {
      storage?.setItem(ACTIVE_PROJECT_KEY, project.id);
    } catch {
      /* The project remains usable when browser storage is unavailable. */
    }
  }

  deactivate(storage: Pick<Storage, 'setItem'> | undefined = browserStorage()): void {
    this.projectState.set(undefined);
    this.restoreStatusState.set('empty');
    this.restoreErrorState.set(undefined);
    this.recoveryCandidateState.set(undefined);
    try {
      storage?.setItem(ACTIVE_PROJECT_KEY, '');
    } catch {
      /* In-memory workspace is still cleared. */
    }
  }

  publishProject(project: ProjectDocument): void {
    this.projectState.set(project);
  }

  isRememberedProject(
    id: string,
    storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
  ): boolean {
    try {
      return readRememberedProject(storage) === id;
    } catch {
      return false;
    }
  }

  clearRememberedProject(
    id: string,
    storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
  ): void {
    try {
      if (readRememberedProject(storage) === id) storage?.setItem(ACTIVE_PROJECT_KEY, '');
    } catch {
      /* The project list remains usable when browser storage is unavailable. */
    }
  }

  restore(
    store: ProjectStore,
    storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
  ): Promise<ProjectDocument | undefined> {
    if (this.project()) return Promise.resolve(this.project());
    if (this.restorePromise) return this.restorePromise;
    const attempt = this.restoreFromStore(store, storage);
    let wrapped!: Promise<ProjectDocument | undefined>;
    wrapped = attempt.finally(() => {
      if (this.restorePromise === wrapped) this.restorePromise = undefined;
    });
    this.restorePromise = wrapped;
    return wrapped;
  }

  async restoreRecovery(): Promise<ProjectDocument | undefined> {
    const pending = this.recoveryCandidate();
    const store = this.restoreStore;
    if (!pending || !store) return undefined;
    try {
      const metadata = pending.metadata.persistenceToken
        ? pending.metadata
        : { persistenceToken: createPersistenceToken(), persistedAt: new Date().toISOString() };
      if (pending.mainProject) await store.save(pending.project, metadata);
      else await store.create(pending.project, metadata);
      let cleanupError: unknown;
      try {
        await store.deleteRecoverySnapshot(pending.projectId);
      } catch (error) {
        cleanupError = error;
      }
      this.activate(pending.project, this.restoreStorage);
      if (cleanupError)
        this.restoreErrorState.set(
          cleanupError instanceof Error ? cleanupError.message : 'Recovery cleanup failed',
        );
      return pending.project;
    } catch (error) {
      this.restoreStatusState.set('recovery-error');
      this.restoreErrorState.set(
        error instanceof Error ? error.message : 'Unable to restore recovery data',
      );
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
      this.restoreStatusState.set('recovery-error');
      this.restoreErrorState.set(
        error instanceof Error ? error.message : 'Unable to discard recovery data',
      );
      return false;
    }
  }

  continueWithMain(): void {
    const pending = this.recoveryCandidate();
    if (pending?.mainProject) this.activate(pending.mainProject, this.restoreStorage);
    else {
      this.recoveryCandidateState.set(undefined);
      this.restoreStatusState.set('empty');
    }
  }

  private restoreStore?: ProjectStore;
  private restoreStorage?: Pick<Storage, 'getItem' | 'setItem'>;

  private async restoreFromStore(
    store: ProjectStore,
    storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  ): Promise<ProjectDocument | undefined> {
    this.restoreStore = store;
    this.restoreStorage = storage;
    this.restoreStatusState.set('restoring');
    this.restoreErrorState.set(undefined);
    try {
      let activeId: string | null = null;
      try {
        activeId = readRememberedProject(storage);
      } catch {
        /* Fall back to the newest IndexedDB project. */
      }
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
        try {
          recovered = migrateProject(recovery.project);
        } catch (error) {
          this.recoveryCandidateState.set({
            project: recovery.project,
            projectId: recoveryId!,
            mainProject,
            metadata: recovery.metadata,
            valid: false,
          });
          this.restoreStatusState.set('recovery-error');
          this.restoreErrorState.set(
            error instanceof Error ? error.message : 'Recovery data is invalid',
          );
          return undefined;
        }
        const validation = validateProject(recovered);
        if (!validation.valid) {
          this.recoveryCandidateState.set({
            project: recovered,
            projectId: recoveryId!,
            mainProject,
            metadata: recovery.metadata,
            valid: false,
          });
          this.restoreStatusState.set('recovery-error');
          this.restoreErrorState.set(validation.issues.map((issue) => issue.message).join('; '));
          return undefined;
        }
        if (
          mainRecord?.metadata.persistenceToken &&
          recovery.metadata.persistenceToken &&
          mainRecord.metadata.persistenceToken === recovery.metadata.persistenceToken
        ) {
          try {
            await store.deleteRecoverySnapshot(recovered.id);
          } catch {
            /* Main is already safe; stale residue is non-blocking. */
          }
        } else {
          this.recoveryCandidateState.set({
            project: recovered,
            projectId: recoveryId!,
            mainProject,
            metadata: recovery.metadata,
            valid: true,
          });
          this.restoreStatusState.set('recovery-pending');
          return undefined;
        }
      }
      if (mainProject) this.activate(mainProject, storage);
      else this.restoreStatusState.set('empty');
      return mainProject;
    } catch (error) {
      this.restoreStatusState.set('error');
      this.restoreErrorState.set(
        error instanceof Error ? error.message : 'Unable to restore the active project',
      );
      return undefined;
    }
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function readRememberedProject(
  storage: (Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>>) | undefined,
): string | null {
  try {
    const current = storage?.getItem(ACTIVE_PROJECT_KEY);
    if (current !== null && current !== undefined) return current || null;
    const legacy = storage?.getItem(LEGACY_ACTIVE_PROJECT_KEY) ?? null;
    if (!legacy) return null;
    if (storage?.setItem) {
      storage.setItem(ACTIVE_PROJECT_KEY, legacy);
      storage.getItem(ACTIVE_PROJECT_KEY);
    }
    return legacy;
  } catch {
    try {
      return storage?.getItem(LEGACY_ACTIVE_PROJECT_KEY) || null;
    } catch {
      return null;
    }
  }
}

async function readRecord(store: ProjectStore, id: string): Promise<ProjectRecord | undefined> {
  if (store.openRecord) return store.openRecord(id);
  const project = await store.open(id);
  return project ? { project, metadata: {} } : undefined;
}

async function readRecoveryRecord(
  store: ProjectStore,
  id: string,
): Promise<ProjectRecord | undefined> {
  if (store.openRecoveryRecord) return store.openRecoveryRecord(id);
  const project = await store.openRecoverySnapshot(id);
  return project ? { project, metadata: {} } : undefined;
}

function createPersistenceToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `persist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

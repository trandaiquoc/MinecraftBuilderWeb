import { migrateProject } from '../domain/migrations';
import { ProjectDocument, ProjectMetadata } from '../domain/project.types';
import { validateProject } from '../domain/validation';
import { DirtyState } from './autosave/dirty-state';
import { AutosaveController } from './autosave/autosave-controller';
import { parseProjectPackage, serializeProjectPackage } from './project-package/project-package';
import { ProjectPersistenceMetadata, ProjectRecord, ProjectStore } from './project-store/project-store.port';

export class ProjectPersistenceService {
  readonly dirtyState = new DirtyState();
  cleanupWarning?: unknown;
  private readonly autosave: AutosaveController;

  constructor(private readonly store: ProjectStore, autosaveDelayMs = 1000, onAutosaveStatus?: (status: ProjectSaveStatus, error?: unknown) => void, onAutosaveCleanup?: (error: unknown) => void) {
    this.autosave = new AutosaveController(store, {
      delayMs: autosaveDelayMs,
      onSaving: () => onAutosaveStatus?.('saving'),
      onSaved: (revision) => { if (this.dirtyState.markClean(revision)) onAutosaveStatus?.('saved'); },
      onCleanupError: (error) => onAutosaveCleanup?.(error),
      onError: (error) => onAutosaveStatus?.('error', error),
    });
  }

  async create(project: ProjectDocument): Promise<void> {
    assertValid(project);
    await this.store.create(migrateProject(project), persistenceMetadata());
    this.dirtyState.markClean();
    this.cleanupWarning = undefined;
    this.autosave.reset();
  }

  /** Explicit contract for a package that already completed migration and validation. */
  async createValidatedImportedProject(project: ProjectDocument): Promise<void> {
    await this.store.create(migrateProject(project), persistenceMetadata());
    this.dirtyState.markClean();
    this.cleanupWarning = undefined;
    this.autosave.reset();
  }

  exists(id: string): Promise<boolean> { return this.store.exists(id); }

  open(id: string): Promise<ProjectDocument | undefined> {
    return this.store.open(id);
  }

  openRecord(id: string): Promise<ProjectRecord | undefined> {
    return this.store.openRecord ? this.store.openRecord(id) : this.store.open(id).then((project) => project ? { project, metadata: {} } : undefined);
  }

  async save(project: ProjectDocument): Promise<void> {
    assertValid(project);
    await this.store.save(migrateProject(project), persistenceMetadata());
    try { await this.store.deleteRecoverySnapshot(project.id); }
    catch (error) { this.cleanupWarning = error; }
    this.dirtyState.markClean();
    this.autosave.markPersisted(this.dirtyState.currentRevision);
    this.autosave.cancel();
  }

  async saveAs(project: ProjectDocument, newId: string, name?: string): Promise<ProjectDocument> {
    const now = new Date().toISOString();
    const metadata: ProjectMetadata = { ...project.metadata, name: name?.trim() || project.metadata.name, updatedAt: now };
    const copy: ProjectDocument = { ...project, id: newId, metadata };
    assertValid(copy);
    await this.store.create(copy, persistenceMetadata());
    this.dirtyState.markClean();
    this.autosave.reset();
    return copy;
  }

  async rename(project: ProjectDocument, name: string): Promise<ProjectDocument> {
    const renamed: ProjectDocument = { ...project, metadata: { ...project.metadata, name: name.trim(), updatedAt: new Date().toISOString() } };
    await this.save(renamed);
    return renamed;
  }

  list() {
    return this.store.list();
  }

  async delete(id: string): Promise<void> {
    this.autosave.suspend();
    try {
      await this.flushAutosave();
      await this.store.delete(id);
      this.autosave.reset();
      this.dirtyState.reset();
      this.autosave.resume();
    } catch (error) {
      this.autosave.resume();
      throw error;
    }
  }

  markChanged(project: ProjectDocument): void {
    assertValid(project);
    const revision = this.dirtyState.markDirty();
    // Keep the caller's version on autosave; opening/importing performs migration,
    // while autosave must not unexpectedly rewrite an older in-memory snapshot.
    this.autosave.schedule(project, revision);
  }

  flushAutosave(): Promise<void> { return this.autosave.flush(); }

  get currentRevision(): number { return this.dirtyState.currentRevision; }
  get savedRevision(): number { return this.dirtyState.savedRevision; }
  get unsafeDirty(): boolean { return this.dirtyState.isDirty; }
  resetTracking(): void { this.autosave.reset(); this.dirtyState.reset(); this.cleanupWarning = undefined; }

  exportPackage(project: ProjectDocument): string {
    return serializeProjectPackage(project);
  }

  importPackage(serialized: string): ProjectDocument {
    return parseProjectPackage(serialized);
  }

  openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> {
    return this.store.openRecoverySnapshot(id);
  }

  openRecoveryRecord(id: string): Promise<ProjectRecord | undefined> {
    return this.store.openRecoveryRecord ? this.store.openRecoveryRecord(id) : this.store.openRecoverySnapshot(id).then((project) => project ? { project, metadata: {} } : undefined);
  }

  deleteRecoverySnapshot(id: string): Promise<void> {
    return this.store.deleteRecoverySnapshot(id);
  }

  dispose(): void {
    this.autosave.dispose();
  }
}

function persistenceMetadata(): ProjectPersistenceMetadata {
  const persistenceToken = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `persist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { persistenceToken, persistedAt: new Date().toISOString() };
}

export type ProjectSaveStatus = 'saving' | 'saved' | 'error';

function assertValid(project: ProjectDocument): void {
  const result = validateProject(project);
  if (!result.valid) throw new Error(`Invalid project: ${result.issues.map((issue) => issue.message).join('; ')}`);
}

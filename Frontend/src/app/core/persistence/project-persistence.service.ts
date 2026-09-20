import { migrateProject } from '../domain/migrations';
import { ProjectDocument, ProjectMetadata } from '../domain/project.types';
import { validateProject } from '../domain/validation';
import { DirtyState } from './autosave/dirty-state';
import { AutosaveController } from './autosave/autosave-controller';
import { parseProjectPackage, serializeProjectPackage } from './project-package/project-package';
import { ProjectStore } from './project-store/project-store.port';

export class ProjectPersistenceService {
  readonly dirtyState = new DirtyState();
  private readonly autosave: AutosaveController;

  constructor(private readonly store: ProjectStore, autosaveDelayMs = 1000, onAutosaveStatus?: (status: ProjectSaveStatus, error?: unknown) => void) {
    this.autosave = new AutosaveController(store, {
      delayMs: autosaveDelayMs,
      onSaving: () => onAutosaveStatus?.('saving'),
      onSaved: (revision) => { if (this.dirtyState.markClean(revision)) onAutosaveStatus?.('saved'); },
      onError: (error) => onAutosaveStatus?.('error', error),
    });
  }

  async create(project: ProjectDocument): Promise<void> {
    assertValid(project);
    await this.store.create(migrateProject(project));
    this.dirtyState.markClean();
  }

  open(id: string): Promise<ProjectDocument | undefined> {
    return this.store.open(id);
  }

  async save(project: ProjectDocument): Promise<void> {
    assertValid(project);
    await this.store.save(migrateProject(project));
    this.dirtyState.markClean();
    this.autosave.cancel();
  }

  async saveAs(project: ProjectDocument, newId: string, name?: string): Promise<ProjectDocument> {
    const now = new Date().toISOString();
    const metadata: ProjectMetadata = { ...project.metadata, name: name?.trim() || project.metadata.name, updatedAt: now };
    const copy: ProjectDocument = { ...project, id: newId, metadata };
    assertValid(copy);
    await this.store.create(copy);
    this.dirtyState.markClean();
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

  delete(id: string): Promise<void> {
    return this.store.delete(id);
  }

  markChanged(project: ProjectDocument): void {
    assertValid(project);
    const revision = this.dirtyState.markDirty();
    // Keep the caller's version on autosave; opening/importing performs migration,
    // while autosave must not unexpectedly rewrite an older in-memory snapshot.
    this.autosave.schedule(project, revision);
  }

  flushAutosave(): Promise<void> { return this.autosave.flush(); }

  exportPackage(project: ProjectDocument): string {
    return serializeProjectPackage(project);
  }

  importPackage(serialized: string): ProjectDocument {
    return parseProjectPackage(serialized);
  }

  openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> {
    return this.store.openRecoverySnapshot(id);
  }

  deleteRecoverySnapshot(id: string): Promise<void> {
    return this.store.deleteRecoverySnapshot(id);
  }

  dispose(): void {
    this.autosave.dispose();
  }
}

export type ProjectSaveStatus = 'saving' | 'saved' | 'error';

function assertValid(project: ProjectDocument): void {
  const result = validateProject(project);
  if (!result.valid) throw new Error(`Invalid project: ${result.issues.map((issue) => issue.message).join('; ')}`);
}

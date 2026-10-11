import type { ProjectDocument } from '../../domain/project.types';
import { validateEditorSettings } from '../../domain/validation';
import { AutosaveController } from './autosave-controller';
import { DirtyState } from './dirty-state';
import type { ProjectStore } from '../project-store/project-store.port';
import { ProjectPersistenceService } from '../project-persistence.service';

export type ProjectSaveStatus = 'saving' | 'saved' | 'error';

/** Owns autosave revisions, pending writes, and destructive-write coordination. */
export class ProjectAutosaveSession {
  private readonly dirtyState = new DirtyState();
  private readonly autosave: AutosaveController;
  private readonly persistence: ProjectPersistenceService;

  constructor(
    store: ProjectStore,
    autosaveDelayMs = 1000,
    onAutosaveStatus?: (status: ProjectSaveStatus, error?: unknown) => void,
    private readonly onRecoveryCleanupStatus?: (error?: unknown) => void,
  ) {
    this.persistence = new ProjectPersistenceService(store);
    this.autosave = new AutosaveController(store, {
      delayMs: autosaveDelayMs,
      onSaving: () => onAutosaveStatus?.('saving'),
      onSaved: (revision) => {
        if (this.dirtyState.markClean(revision)) onAutosaveStatus?.('saved');
      },
      onCleanupError: (error) => onRecoveryCleanupStatus?.(error),
      onError: (error) => onAutosaveStatus?.('error', error),
    });
  }

  async save(project: ProjectDocument): Promise<void> {
    const result = await this.persistence.save(project);
    this.onRecoveryCleanupStatus?.(result.recoveryCleanupError);
    this.markPersisted();
  }

  async saveAs(project: ProjectDocument, newId: string, name?: string): Promise<ProjectDocument> {
    const copy = await this.persistence.saveAs(project, newId, name);
    this.dirtyState.markClean();
    this.autosave.reset();
    this.onRecoveryCleanupStatus?.(undefined);
    return copy;
  }

  async rename(project: ProjectDocument, name: string): Promise<ProjectDocument> {
    const renamed: ProjectDocument = {
      ...project,
      metadata: { ...project.metadata, name: name.trim(), updatedAt: new Date().toISOString() },
    };
    await this.save(renamed);
    return renamed;
  }

  private markPersisted(): void {
    this.dirtyState.markClean();
    this.autosave.markPersisted(this.dirtyState.currentRevision);
    this.autosave.cancel();
  }

  async delete(id: string): Promise<void> {
    this.autosave.suspend();
    try {
      await this.flushAutosave();
      await this.persistence.delete(id);
      this.autosave.reset();
      this.dirtyState.reset();
      this.autosave.resume();
    } catch (error) {
      this.autosave.resume();
      throw error;
    }
  }

  markChanged(project: ProjectDocument): void {
    this.persistence.assertProjectValid(project);
    const revision = this.dirtyState.markDirty();
    this.autosave.schedule(project, revision);
  }

  markEditorSettingsChanged(project: ProjectDocument): void {
    const issues = validateEditorSettings(project.editorSettings, project.size);
    if (issues.length)
      throw new Error(
        `Invalid editor settings: ${issues.map((issue) => issue.message).join('; ')}`,
      );
    const revision = this.dirtyState.markDirty();
    this.autosave.scheduleEditorSettings(project, revision);
  }

  flushAutosave(): Promise<void> {
    return this.autosave.flush();
  }

  get currentRevision(): number {
    return this.dirtyState.currentRevision;
  }

  get savedRevision(): number {
    return this.dirtyState.savedRevision;
  }

  get unsafeDirty(): boolean {
    return this.dirtyState.isDirty;
  }

  resetTracking(): void {
    this.autosave.reset();
    this.dirtyState.reset();
    this.onRecoveryCleanupStatus?.(undefined);
  }

  dispose(): void {
    this.autosave.dispose();
  }
}

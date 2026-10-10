import { ProjectDocument } from '../../domain/project.types';
import { ProjectPersistenceMetadata, ProjectStore } from '../project-store/project-store.port';

export interface AutosaveOptions {
  readonly delayMs?: number;
  readonly onSaving?: (revision: number) => void;
  readonly onSaved?: (revision: number) => void;
  readonly onCleanupError?: (error: unknown, revision: number) => void;
  readonly onError?: (error: unknown, revision: number) => void;
}

interface AutosaveSnapshot {
  readonly project: ProjectDocument;
  readonly revision: number;
  readonly editorSettingsOnly: boolean;
}

export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest?: AutosaveSnapshot;
  private savedRevision = 0;
  private attemptedRevision = 0;
  private drainPromise?: Promise<void>;
  private suspended = false;
  private disposed = false;

  constructor(private readonly store: ProjectStore, private readonly options: AutosaveOptions = {}) {}

  schedule(project: ProjectDocument, revision: number): void {
    if (this.disposed) return;
    this.latest = { project, revision, editorSettingsOnly: false };
    this.scheduleDrain();
  }

  scheduleEditorSettings(project: ProjectDocument, revision: number): void {
    if (this.disposed) return;
    const pendingFullSave = this.latest !== undefined
      && this.latest.revision > this.savedRevision
      && !this.latest.editorSettingsOnly;
    this.latest = { project, revision, editorSettingsOnly: !pendingFullSave };
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    this.cancel();
    if (this.suspended || this.drainPromise) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
  }

  cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  /** Prevents new timers while a destructive persistence operation drains and deletes. */
  suspend(): void { this.suspended = true; this.cancel(); }

  /** Resumes autosave after a failed destructive operation without dropping the latest edit. */
  resume(): void {
    if (this.disposed) return;
    this.suspended = false;
    if (this.latest && !this.drainPromise && this.timer === undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
    }
  }

  /** Stops pending work without allowing a stale snapshot to be written later. */
  discard(): void { this.cancel(); this.latest = undefined; this.attemptedRevision = this.savedRevision; }

  reset(): void {
    this.cancel();
    this.latest = undefined;
    this.savedRevision = 0;
    this.attemptedRevision = 0;
  }

  markPersisted(revision: number): void {
    this.cancel();
    this.savedRevision = Math.max(this.savedRevision, revision);
    this.attemptedRevision = Math.max(this.attemptedRevision, revision);
    if (this.latest && this.latest.revision <= revision) this.latest = undefined;
  }

  get persistedRevision(): number { return this.savedRevision; }

  flush(): Promise<void> {
    this.cancel();
    return this.drain();
  }

  private drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.persistLatest().finally(() => {
      this.drainPromise = undefined;
      if (!this.disposed && !this.suspended && this.latest && this.latest.revision > this.attemptedRevision && this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
    });
    return this.drainPromise;
  }

  private async persistLatest(): Promise<void> {
    while (this.latest && this.latest.revision > this.savedRevision) {
      const snapshot = this.latest;
      this.attemptedRevision = snapshot.revision;
      const metadata: ProjectPersistenceMetadata = { persistenceToken: createPersistenceToken(), persistedAt: new Date().toISOString() };
      this.options.onSaving?.(snapshot.revision);
      try {
        if (snapshot.editorSettingsOnly && this.store.saveEditorSettings) {
          await this.store.saveEditorSettings(snapshot.project.id, snapshot.project.editorSettings);
        } else {
          await this.store.saveRecoverySnapshot(snapshot.project, metadata);
          await this.store.save(snapshot.project, metadata);
        }
        this.savedRevision = snapshot.revision;
        this.options.onSaved?.(snapshot.revision);
        try { await this.store.deleteRecoverySnapshot(snapshot.project.id); }
        catch (error) { this.options.onCleanupError?.(error, snapshot.revision); }
      } catch (error) {
        this.options.onError?.(error, snapshot.revision);
        throw error;
      }
    }
  }
}

function createPersistenceToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `persist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

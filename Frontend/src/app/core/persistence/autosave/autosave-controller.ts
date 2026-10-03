import { ProjectDocument } from '../../domain/project.types';
import { ProjectStore } from '../project-store/project-store.port';

export interface AutosaveOptions {
  readonly delayMs?: number;
  readonly onSaving?: (revision: number) => void;
  readonly onSaved?: (revision: number) => void;
  readonly onError?: (error: unknown, revision: number) => void;
  /** Full validation belongs at persistence time, never on every dirty mark. */
  readonly validate?: (project: ProjectDocument) => void;
}

export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest?: { readonly snapshot: () => ProjectDocument | undefined; readonly revision: number };
  private savedRevision = 0;
  private attemptedRevision = 0;
  private drainPromise?: Promise<void>;
  private suspended = false;

  constructor(private readonly store: ProjectStore, private readonly options: AutosaveOptions = {}) {}

  schedule(project: ProjectDocument, revision: number): void {
    this.scheduleSnapshot(() => project, revision);
  }

  scheduleSnapshot(snapshot: () => ProjectDocument | undefined, revision: number): void {
    this.latest = { snapshot, revision };
    this.cancel();
    if (this.suspended || this.drainPromise) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
  }

  cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.cancel();
  }

  /** Prevents new timers while a destructive persistence operation drains and deletes. */
  suspend(): void { this.suspended = true; this.cancel(); }

  /** Resumes autosave after a failed destructive operation without dropping the latest edit. */
  resume(): void {
    this.suspended = false;
    if (this.latest && !this.drainPromise && this.timer === undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
    }
  }

  /** Stops pending work without allowing a stale snapshot to be written later. */
  discard(): void { this.cancel(); this.latest = undefined; this.drainPromise = undefined; }

  flush(): Promise<void> {
    this.cancel();
    return this.drain();
  }

  private drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.persistLatest().finally(() => {
      this.drainPromise = undefined;
      if (!this.suspended && this.latest && this.latest.revision > this.attemptedRevision && this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; void this.drain().catch(() => undefined); }, this.options.delayMs ?? 1000);
    });
    return this.drainPromise;
  }

  private async persistLatest(): Promise<void> {
    while (this.latest && this.latest.revision > this.savedRevision) {
      const pending = this.latest;
      this.attemptedRevision = pending.revision;
      this.options.onSaving?.(pending.revision);
      try {
        const project = pending.snapshot();
        if (!project) throw new Error('Unable to materialize the active project snapshot');
        this.options.validate?.(project);
        await this.store.saveRecoverySnapshot(project);
        await this.store.save(project);
        await this.store.deleteRecoverySnapshot(project.id);
        this.savedRevision = pending.revision;
        this.options.onSaved?.(pending.revision);
      } catch (error) {
        this.options.onError?.(error, pending.revision);
        throw error;
      }
    }
  }
}

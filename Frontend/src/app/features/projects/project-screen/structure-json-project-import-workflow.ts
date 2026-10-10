import { DestroyRef, inject, signal } from '@angular/core';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import {
  parseStructureJsonWithWorker,
  type StructureJsonValidationCancellation,
} from '../../../core/persistence/structure-json/structure-json-import';
import {
  prepareStructureJsonProjectImport,
  type StructureJsonProjectImportError,
  type StructureJsonProjectImportPreview,
} from '../../../core/persistence/structure-json/structure-json-project-import';

export type StructureJsonProjectImportProgress =
  'idle' | 'reading' | 'parsing' | 'checking' | 'saving' | 'error' | 'ready';
export type StructureJsonProjectImportFailure =
  | { readonly kind: 'parse'; readonly code?: string }
  | { readonly kind: 'prepare'; readonly code: StructureJsonProjectImportError }
  | { readonly kind: 'read' | 'save' };

export class StructureJsonProjectImportWorkflow {
  private readonly library = inject(BlockLibraryService);
  private readonly preferences = inject(UiPreferencesService);
  private generation = 0;
  private cancellation?: AbortController;

  readonly open = signal(false);
  readonly progress = signal<StructureJsonProjectImportProgress>('idle');
  readonly filename = signal('');
  readonly preview = signal<StructureJsonProjectImportPreview | undefined>(undefined);
  readonly failure = signal<StructureJsonProjectImportFailure | undefined>(undefined);
  readonly creating = signal(false);

  constructor(private readonly persist: (project: ProjectDocument) => Promise<void>) {
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  async selectFile(file: File, fallbackName: string): Promise<void> {
    if (this.creating()) return;
    this.cancelCurrent();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.cancellation = controller;
    const cancellation: StructureJsonValidationCancellation = {
      signal: controller.signal,
      isCancelled: () => generation !== this.generation,
    };
    this.open.set(true);
    this.filename.set(file.name);
    this.preview.set(undefined);
    this.failure.set(undefined);
    this.progress.set('reading');
    try {
      const serialized = await file.text();
      if (generation !== this.generation) return;
      this.progress.set('parsing');
      const parsed = await parseStructureJsonWithWorker(serialized, cancellation);
      if (generation !== this.generation) return;
      if (!parsed.valid || !parsed.value) {
        this.failure.set({ kind: 'parse', code: parsed.code });
        this.progress.set('error');
        return;
      }
      this.progress.set('checking');
      const result = await prepareStructureJsonProjectImport({
        source: parsed.value,
        filename: file.name,
        fallbackName,
        projectId: createProjectId(),
        autoUseHuge: this.preferences.preferences().autoUseHugeStructureBlocks,
        getDefinition: (id) => this.library.get(id),
        onProgress: () => undefined,
        cancellation,
      });
      if (generation !== this.generation) return;
      this.preview.set(result.preview);
      if (!result.ok) {
        this.failure.set({ kind: 'prepare', code: result.code });
        this.progress.set('error');
        return;
      }
      this.progress.set('ready');
    } catch {
      if (generation === this.generation) {
        this.failure.set({ kind: 'read' });
        this.progress.set('error');
      }
    }
  }

  close(): void {
    if (this.creating()) return;
    this.cancelCurrent();
    this.generation += 1;
    this.open.set(false);
    this.preview.set(undefined);
    this.failure.set(undefined);
    this.progress.set('idle');
  }

  async createProject(): Promise<ProjectDocument | undefined> {
    const project = this.preview()?.project;
    if (!project || this.creating()) return undefined;
    const generation = this.generation;
    this.creating.set(true);
    this.progress.set('saving');
    this.failure.set(undefined);
    try {
      await this.persist(project);
      if (generation !== this.generation) return undefined;
      this.open.set(false);
      return project;
    } catch {
      if (generation === this.generation) {
        this.failure.set({ kind: 'save' });
        this.progress.set('error');
      }
      return undefined;
    } finally {
      this.creating.set(false);
    }
  }

  dispose(): void {
    this.cancelCurrent();
    this.generation += 1;
  }

  private cancelCurrent(): void {
    this.cancellation?.abort();
    this.cancellation = undefined;
  }
}

function createProjectId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`;
}

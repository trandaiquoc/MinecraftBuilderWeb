import { DestroyRef, inject, signal } from '@angular/core';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import {
  parseStructureJsonWithWorker,
  type StructureJsonValidationCancellation,
} from '../../../core/persistence/structure-json/import/structure-json-import';
import {
  prepareStructureJsonProjectImport,
  type StructureJsonProjectImportError,
  type StructureJsonProjectImportPreview,
} from '../../../core/persistence/structure-json/import/structure-json-project-import';

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

  private readonly openState = signal(false);
  private readonly progressState = signal<StructureJsonProjectImportProgress>('idle');
  private readonly filenameState = signal('');
  private readonly previewState = signal<StructureJsonProjectImportPreview | undefined>(undefined);
  private readonly failureState = signal<StructureJsonProjectImportFailure | undefined>(undefined);
  private readonly creatingState = signal(false);
  readonly open = this.openState.asReadonly();
  readonly progress = this.progressState.asReadonly();
  readonly filename = this.filenameState.asReadonly();
  readonly preview = this.previewState.asReadonly();
  readonly failure = this.failureState.asReadonly();
  readonly creating = this.creatingState.asReadonly();

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
    this.openState.set(true);
    this.filenameState.set(file.name);
    this.previewState.set(undefined);
    this.failureState.set(undefined);
    this.progressState.set('reading');
    try {
      const serialized = await file.text();
      if (generation !== this.generation) return;
      this.progressState.set('parsing');
      const parsed = await parseStructureJsonWithWorker(serialized, cancellation);
      if (generation !== this.generation) return;
      if (!parsed.valid || !parsed.value) {
        this.failureState.set({ kind: 'parse', code: parsed.code });
        this.progressState.set('error');
        return;
      }
      this.progressState.set('checking');
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
      this.previewState.set(result.preview);
      if (!result.ok) {
        this.failureState.set({ kind: 'prepare', code: result.code });
        this.progressState.set('error');
        return;
      }
      this.progressState.set('ready');
    } catch {
      if (generation === this.generation) {
        this.failureState.set({ kind: 'read' });
        this.progressState.set('error');
      }
    }
  }

  close(): void {
    if (this.creating()) return;
    this.cancelCurrent();
    this.generation += 1;
    this.openState.set(false);
    this.previewState.set(undefined);
    this.failureState.set(undefined);
    this.progressState.set('idle');
  }

  async createProject(): Promise<ProjectDocument | undefined> {
    const project = this.preview()?.project;
    if (!project || this.creating()) return undefined;
    const generation = this.generation;
    this.creatingState.set(true);
    this.progressState.set('saving');
    this.failureState.set(undefined);
    try {
      await this.persist(project);
      if (generation !== this.generation) return undefined;
      this.openState.set(false);
      return project;
    } catch {
      if (generation === this.generation) {
        this.failureState.set({ kind: 'save' });
        this.progressState.set('error');
      }
      return undefined;
    } finally {
      this.creatingState.set(false);
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

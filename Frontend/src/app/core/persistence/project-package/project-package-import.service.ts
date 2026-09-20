import { signal } from '@angular/core';
import { ProjectPersistenceService } from '../project-persistence.service';
import { ProjectDocument } from '../../domain/project.types';
import { parseProjectPackage, ProjectPackageError } from './project-package';
import { ProjectPackageImportStage, ProjectPackageImportState, ProjectPackageWorkerRequest, ProjectPackageWorkerResponse } from './project-package-import.types';

const WORKER_THRESHOLD = 256 * 1024;

export class ProjectPackageImportService {
  readonly state = signal<ProjectPackageImportState>({ stage: 'idle' });
  private running = false;

  constructor(private readonly persistence: ProjectPersistenceService) {}

  async import(file: File, saveCurrent: () => Promise<void>, activate: (project: ProjectDocument) => Promise<void> | void): Promise<void> {
    if (this.running) return;
    this.running = true;
    const base = { filename: file.name, fileSize: file.size };
    try {
      this.set('saving-current', base); await nextPaint(); await saveCurrent();
      this.set('reading-file', base); let text: string | undefined; let buffer: ArrayBuffer | undefined;
      try {
        if (file.size >= WORKER_THRESHOLD && typeof file.arrayBuffer === 'function') buffer = await file.arrayBuffer();
        else text = await file.text();
      } catch (error) { throw new ImportStageError('read-failed', error instanceof Error ? error.message : 'Unable to read file'); }
      this.set('parsing', base); const parsed = await this.parse(text, buffer);
      this.set('validating', { ...base, projectName: parsed.metadata.name, blockCount: parsed.blocks.length });
      this.set('checking-destination', { ...base, projectName: parsed.metadata.name, blockCount: parsed.blocks.length });
      const collision = await this.persistence.exists(parsed.id);
      const project = collision ? { ...parsed, id: createProjectId(), metadata: { ...parsed.metadata, name: `${parsed.metadata.name} (imported)`, updatedAt: new Date().toISOString() } } : parsed;
      this.set('storing', { ...base, projectName: project.metadata.name, blockCount: project.blocks.length });
      try { await this.persistence.createValidatedImportedProject(project); } catch (error) { throw new ImportStageError('storage-failed', error instanceof Error ? error.message : 'Unable to save imported project'); }
      this.set('activating', { ...base, projectName: project.metadata.name, blockCount: project.blocks.length });
      await activate(project);
      this.set('success', { ...base, projectName: project.metadata.name, blockCount: project.blocks.length });
    } catch (error) {
      const failure = classifyImportError(error);
      this.state.set({ ...base, stage: 'error', errorCategory: failure.category, errorMessage: failure.message, errorDetails: failure.details });
    } finally { this.running = false; }
  }

  reset(): void { if (!this.running) this.state.set({ stage: 'idle' }); }

  private async parse(text: string | undefined, buffer: ArrayBuffer | undefined): Promise<ProjectDocument> {
    const useWorker = !!buffer;
    if (!useWorker || typeof Worker === 'undefined' || typeof window === 'undefined') return parseProjectPackage(text ?? new TextDecoder().decode(buffer));
    return new Promise((resolve, reject) => {
      const fallbackText = text ?? new TextDecoder().decode(buffer.slice(0));
      let worker: Worker;
      try { worker = new Worker(new URL('./project-package-import.worker', import.meta.url), { type: 'module' }); }
      catch { try { resolve(parseProjectPackage(fallbackText)); } catch (error) { reject(error); } return; }
      const request: ProjectPackageWorkerRequest = buffer ? { type: 'parse', buffer } : { type: 'parse', text };
      worker.onmessage = ({ data }: MessageEvent<ProjectPackageWorkerResponse>) => { worker.terminate(); data.ok ? resolve(data.project) : reject(new ProjectPackageError(data.category, data.message, data.details)); };
      worker.onerror = () => { worker.terminate(); try { resolve(parseProjectPackage(fallbackText)); } catch (error) { reject(error); } };
      worker.postMessage(request, buffer ? [buffer] : []);
    });
  }

  private set(stage: ProjectPackageImportStage, state: Omit<ProjectPackageImportState, 'stage'>): void { this.state.set({ stage, ...state }); }
}

function classifyImportError(error: unknown): { readonly category: ProjectPackageImportState['errorCategory']; readonly message: string; readonly details?: readonly string[] } {
  if (error instanceof ImportStageError) return { category: error.category, message: error.message };
  if (error instanceof ProjectPackageError) return { category: error.category, message: error.message, details: error.details };
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return { category: 'storage-failed', message: 'Storage quota exceeded' };
  if (error instanceof Error && /quota/i.test(error.message)) return { category: 'storage-failed', message: 'Storage quota exceeded' };
  return { category: 'unexpected', message: error instanceof Error ? error.message : 'Unexpected import failure' };
}

class ImportStageError extends Error {
  constructor(readonly category: 'read-failed' | 'storage-failed', message: string) { super(message); }
}

function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  return Promise.resolve();
}

function createProjectId(): string { return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

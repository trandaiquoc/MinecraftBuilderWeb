import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshJob, TerrainMeshResult, TerrainMeshWorkerRequest, TerrainMeshWorkerResponse } from './terrain-mesh-protocol';

export interface TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: TerrainMeshWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

interface PendingJob { readonly job: TerrainMeshJob; readonly resolve: (result: TerrainMeshResult) => void; readonly reject: (error: unknown) => void; }
interface WorkerSlot { readonly worker: TerrainWorkerLike; busy: boolean; startedAt: number; job?: PendingJob; }

export interface TerrainMeshWorkerPoolEvidence {
  readonly terrainWorkerSupported: boolean;
  readonly terrainWorkerCount: number;
  readonly terrainWorkerQueued: number;
  readonly terrainWorkerRunning: number;
  readonly terrainWorkerCompleted: number;
  readonly terrainWorkerStaleResults: number;
  readonly terrainWorkerFailures: number;
  readonly terrainWorkerFallbackJobs: number;
  readonly terrainWorkerCpuMs: { readonly count: number; readonly p50: number; readonly p95: number; readonly max: number };
  readonly terrainWorkerRoundTripMs: { readonly count: number; readonly p50: number; readonly p95: number; readonly max: number };
  readonly terrainWorkerBytesIn: number;
  readonly terrainWorkerBytesOut: number;
}

export interface TerrainMeshWorkerPoolOptions {
  readonly workerCount?: number;
  readonly workerFactory?: () => TerrainWorkerLike;
  readonly supported?: boolean;
}

/** Bounded worker transport with an identical synchronous core fallback. */
export class TerrainMeshWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private readonly cpuSamples: number[] = [];
  private readonly roundTripSamples: number[] = [];
  private disposed = false;
  private completed = 0;
  private staleResults = 0;
  private failures = 0;
  private fallbackJobs = 0;
  private bytesIn = 0;
  private bytesOut = 0;

  supported: boolean;
  readonly workerCount: number;

  constructor(private readonly options: TerrainMeshWorkerPoolOptions = {}) {
    const factory = options.workerFactory ?? (typeof Worker === 'undefined' ? undefined : defaultWorkerFactory);
    this.supported = options.supported ?? !!factory;
    this.workerCount = clampWorkerCount(options.workerCount ?? defaultWorkerCount());
    if (this.supported && factory) {
      for (let i = 0; i < this.workerCount; i += 1) {
        try { this.slots.push(this.createSlot(factory())); }
        catch { this.failures += 1; }
      }
    }
    if (!this.slots.length && options.supported === undefined) this.supported = false;
  }

  submit(job: TerrainMeshJob): Promise<TerrainMeshResult> {
    if (this.disposed) return Promise.reject(new Error('Terrain mesh worker pool is disposed'));
    if (!this.supported || !this.slots.length) {
      this.fallbackJobs += 1;
      const started = now();
      const result = { ...meshTerrainCore(job), cpuMs: Math.max(0, now() - started) };
      this.recordSample(this.cpuSamples, result.cpuMs);
      this.recordSample(this.roundTripSamples, now() - started);
      this.completed += 1;
      return Promise.resolve(result);
    }
    return new Promise<TerrainMeshResult>((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.queue.sort((a, b) => (b.job.priority ?? 0) - (a.job.priority ?? 0));
      this.bytesIn += estimateJobBytes(job);
      this.pump();
    });
  }

  markStaleResult(): void { this.staleResults += 1; }

  evidence(): TerrainMeshWorkerPoolEvidence {
    return {
      terrainWorkerSupported: this.supported,
      terrainWorkerCount: this.workerCount,
      terrainWorkerQueued: this.queue.length,
      terrainWorkerRunning: this.slots.filter((slot) => slot.busy).length,
      terrainWorkerCompleted: this.completed,
      terrainWorkerStaleResults: this.staleResults,
      terrainWorkerFailures: this.failures,
      terrainWorkerFallbackJobs: this.fallbackJobs,
      terrainWorkerCpuMs: summary(this.cpuSamples),
      terrainWorkerRoundTripMs: summary(this.roundTripSamples),
      terrainWorkerBytesIn: this.bytesIn,
      terrainWorkerBytesOut: this.bytesOut,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.queue.splice(0)) pending.reject(new Error('Terrain mesh worker pool disposed'));
    for (const slot of this.slots) {
      const pending = slot.job;
      slot.job = undefined;
      slot.busy = false;
      pending?.reject(new Error('Terrain mesh worker pool disposed'));
      slot.worker.terminate();
    }
    this.slots.length = 0;
  }

  private createSlot(worker: TerrainWorkerLike): WorkerSlot {
    const slot: WorkerSlot = { worker, busy: false, startedAt: 0 };
    worker.onmessage = (event) => {
      if (this.disposed) return;
      const pending = slot.job;
      if (!pending) return;
      slot.busy = false; slot.job = undefined;
      const result = event.data;
      if (result.type === 'error') {
        this.failures += 1;
        this.resolveFallback(pending);
      } else {
        this.completed += 1;
        this.bytesOut += estimateResultBytes(result.result);
        this.recordSample(this.cpuSamples, result.result.cpuMs);
        this.recordSample(this.roundTripSamples, now() - slot.startedAt);
        pending.resolve(result.result);
      }
      this.pump();
    };
    worker.onerror = () => {
      if (this.disposed) return;
      const pending = slot.job;
      slot.busy = false; slot.job = undefined;
      this.failures += 1;
      if (pending) this.resolveFallback(pending);
      slot.worker.terminate();
      const index = this.slots.indexOf(slot);
      if (index >= 0) this.slots.splice(index, 1);
      if (!this.slots.length) for (const queued of this.queue.splice(0)) this.resolveFallback(queued);
      this.pump();
    };
    return slot;
  }

  private pump(): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      const pending = this.queue.shift();
      if (!pending || slot.busy) {
        if (pending) this.queue.unshift(pending);
        continue;
      }
      slot.busy = true; slot.job = pending; slot.startedAt = now();
      try {
        const transfer: Transferable[] = [];
        for (const template of pending.job.templates) for (const face of template.faces) transfer.push(face.positions.buffer, face.normals.buffer, face.uvs.buffer);
        transfer.push(pending.job.occupancy.opaque.buffer);
        slot.worker.postMessage({ type: 'mesh', job: pending.job }, transfer);
      } catch (error) {
        slot.busy = false; slot.job = undefined; this.failures += 1; pending.reject(error); this.pump();
      }
    }
  }

  private recordSample(target: number[], value: number): void { target.push(Math.max(0, value)); if (target.length > 256) target.shift(); }

  private resolveFallback(pending: PendingJob): void {
    try {
      this.fallbackJobs += 1;
      const started = now();
      const result = { ...meshTerrainCore(pending.job), cpuMs: Math.max(0, now() - started) };
      this.recordSample(this.cpuSamples, result.cpuMs);
      this.recordSample(this.roundTripSamples, now() - started);
      this.completed += 1;
      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
    }
  }
}

function defaultWorkerCount(): number {
  const concurrency = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(4, concurrency - 2));
}
function clampWorkerCount(value: number): number { return Math.max(1, Math.min(4, Math.floor(value))); }
function defaultWorkerFactory(): TerrainWorkerLike {
  return new Worker(new URL('./terrain-mesh.worker', import.meta.url), { type: 'module' }) as unknown as TerrainWorkerLike;
}
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
function summary(values: readonly number[]): { count: number; p50: number; p95: number; max: number } {
  if (!values.length) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1)! };
}
function estimateJobBytes(job: TerrainMeshJob): number { return job.occupancy.opaque.byteLength + job.templates.reduce((total, template) => total + template.faces.reduce((sum, face) => sum + face.positions.byteLength + face.normals.byteLength + face.uvs.byteLength, 0), 0) + job.entries.length * 32; }
function estimateResultBytes(result: TerrainMeshResult): number { return result.buckets.reduce((total, bucket) => total + bucket.positions.byteLength + bucket.normals.byteLength + bucket.uvs.byteLength + bucket.indices.byteLength, 0); }

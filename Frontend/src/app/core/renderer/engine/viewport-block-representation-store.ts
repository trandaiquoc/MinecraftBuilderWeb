import type * as THREE from 'three';
import type { ProjectDocument } from '../../domain/project.types';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { SurfaceFaceMembership } from '../batching/surface-face-batch-renderer';

/** Logical ownership of the current visual representation for each voxel. */
export interface RenderedBlockEntry {
  readonly key: string;
  block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: 'normal' | 'reference' | 'missing';
  fallback?: THREE.Mesh;
  revision: number;
  object?: THREE.Object3D;
  instanceBatchKey?: string;
  instanceIndex?: number;
  surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  surfaceExposedFaceCount?: number;
  surfaceNeighborFacesCulled?: number;
  terrainChunkKey?: string;
  /** Provider that owns the currently committed visual/resources. */
  provider?: BlockVisualProvider;
  reusableVisualKey?: string;
  staticModelAttempted?: boolean;
  staticModelDecision?: ReturnType<StaticModelBatchRenderer['decisionFor']>;
  staticModelFamily?: string;
  fluidChunkKey?: string;
  fluidFallback?: boolean;
}

/** Owns canonical per-voxel representation linkage; renderers retain their GPU state. */
export class ViewportBlockRepresentationStore implements ReadonlyMap<string, RenderedBlockEntry> {
  private readonly entriesByKey = new Map<string, RenderedBlockEntry>();

  get(key: string): RenderedBlockEntry | undefined { return this.entriesByKey.get(key); }
  has(key: string): boolean { return this.entriesByKey.has(key); }
  createOrReplace(entry: RenderedBlockEntry): void { this.entriesByKey.set(entry.key, entry); }
  update(key: string, mutate: (entry: RenderedBlockEntry) => void): boolean {
    const entry = this.entriesByKey.get(key);
    if (!entry) return false;
    mutate(entry);
    return true;
  }
  updateEntry(entry: RenderedBlockEntry, mutate: (entry: RenderedBlockEntry) => void): boolean {
    if (this.entriesByKey.get(entry.key) !== entry) return false;
    mutate(entry);
    return true;
  }
  remove(key: string): boolean { return this.entriesByKey.delete(key); }
  clear(): void { this.entriesByKey.clear(); }
  get size(): number { return this.entriesByKey.size; }
  keys(): IterableIterator<string> { return this.entriesByKey.keys(); }
  values(): IterableIterator<RenderedBlockEntry> { return this.entriesByKey.values(); }
  entries(): IterableIterator<[string, RenderedBlockEntry]> { return this.entriesByKey.entries(); }
  forEach(callbackfn: (value: RenderedBlockEntry, key: string, map: ReadonlyMap<string, RenderedBlockEntry>) => void, thisArg?: unknown): void {
    this.entriesByKey.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
  [Symbol.iterator](): IterableIterator<[string, RenderedBlockEntry]> { return this.entries(); }
  snapshot(): readonly Readonly<RenderedBlockEntry>[] { return [...this.entriesByKey.values()].map((entry) => Object.freeze({ ...entry })); }
}

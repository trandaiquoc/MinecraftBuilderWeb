import type * as THREE from 'three';
import type { ProjectDocument } from '../../domain/project.types';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { SurfaceFaceMembership } from '../batching/surface-face-batch-renderer';

/** Logical ownership of the current visual representation for each voxel. */
export interface RenderedBlockEntry {
  readonly key: string;
  readonly block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: 'normal' | 'reference' | 'missing';
  readonly fallback?: THREE.Mesh;
  readonly revision: number;
  readonly object?: THREE.Object3D;
  readonly instanceBatchKey?: string;
  readonly instanceIndex?: number;
  readonly surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  readonly surfaceExposedFaceCount?: number;
  readonly surfaceNeighborFacesCulled?: number;
  readonly terrainChunkKey?: string;
  /** Provider that owns the currently committed visual/resources. */
  readonly provider?: BlockVisualProvider;
  readonly reusableVisualKey?: string;
  readonly staticModelAttempted?: boolean;
  readonly staticModelDecision?: ReturnType<StaticModelBatchRenderer['decisionFor']>;
  readonly staticModelFamily?: string;
  readonly fluidChunkKey?: string;
  readonly fluidFallback?: boolean;
}

type MutableRenderedBlockEntry = {
  -readonly [Property in keyof RenderedBlockEntry]: RenderedBlockEntry[Property];
};

/** Owns canonical per-voxel representation linkage; renderers retain their GPU state. */
export class ViewportBlockRepresentationStore implements ReadonlyMap<string, RenderedBlockEntry> {
  private readonly entriesByKey = new Map<string, RenderedBlockEntry>();

  get(key: string): RenderedBlockEntry | undefined { return this.entriesByKey.get(key); }
  has(key: string): boolean { return this.entriesByKey.has(key); }
  createOrReplace(entry: RenderedBlockEntry): void { this.entriesByKey.set(entry.key, entry); }
  setBlock(key: string, block: ProjectDocument['blocks'][number]): boolean { return this.mutate(key, (entry) => { entry.block = block; }); }
  incrementRevision(key: string): number | undefined {
    const entry = this.entriesByKey.get(key) as MutableRenderedBlockEntry | undefined;
    if (!entry) return undefined;
    entry.revision += 1;
    return entry.revision;
  }
  setFallback(key: string, fallback: THREE.Mesh): boolean { return this.mutate(key, (entry) => { entry.fallback = fallback; entry.object = fallback; }); }
  setObject(key: string, object: THREE.Object3D | undefined): boolean { return this.mutate(key, (entry) => { entry.object = object; }); }
  setProvider(key: string, provider: BlockVisualProvider | undefined): boolean { return this.mutate(key, (entry) => { entry.provider = provider; }); }
  setInstanceMembership(key: string, membership: { readonly batchKey?: string; readonly index?: number; readonly object?: THREE.Object3D }): boolean {
    return this.mutate(key, (entry) => { entry.instanceBatchKey = membership.batchKey; entry.instanceIndex = membership.index; if (membership.object) entry.object = membership.object; });
  }
  setSurfaceMemberships(key: string, memberships: readonly SurfaceFaceMembership[] | undefined): boolean {
    return this.mutate(key, (entry) => {
      entry.surfaceFaceMemberships = memberships;
      entry.surfaceExposedFaceCount = memberships?.length;
      entry.surfaceNeighborFacesCulled = memberships === undefined ? undefined : 6 - memberships.length;
    });
  }
  setSurfaceObject(key: string, memberships: readonly SurfaceFaceMembership[], object: THREE.Object3D | undefined): boolean {
    return this.mutate(key, (entry) => {
      entry.surfaceFaceMemberships = memberships;
      entry.surfaceExposedFaceCount = memberships.length;
      entry.surfaceNeighborFacesCulled = 6 - memberships.length;
      entry.object = object;
    });
  }
  setTerrainRepresentation(key: string, terrainChunkKey: string | undefined, reusableVisualKey?: string): boolean {
    return this.mutate(key, (entry) => { entry.terrainChunkKey = terrainChunkKey; if (reusableVisualKey !== undefined) entry.reusableVisualKey = reusableVisualKey; });
  }
  setReusableVisual(key: string, reusableVisualKey: string | undefined): boolean { return this.mutate(key, (entry) => { entry.reusableVisualKey = reusableVisualKey; }); }
  setStaticModel(key: string, values: { readonly attempted?: boolean; readonly decision?: RenderedBlockEntry['staticModelDecision']; readonly family?: string }): boolean {
    return this.mutate(key, (entry) => { if (values.attempted !== undefined) entry.staticModelAttempted = values.attempted; if (values.decision !== undefined) entry.staticModelDecision = values.decision; if (values.family !== undefined) entry.staticModelFamily = values.family; });
  }
  setFluidRepresentation(key: string, fluidChunkKey: string | undefined, fallback?: boolean): boolean {
    return this.mutate(key, (entry) => { entry.fluidChunkKey = fluidChunkKey; if (fallback !== undefined) entry.fluidFallback = fallback; });
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
  private mutate(key: string, mutate: (entry: MutableRenderedBlockEntry) => void): boolean {
    const entry = this.entriesByKey.get(key) as MutableRenderedBlockEntry | undefined;
    if (!entry) return false;
    mutate(entry);
    return true;
  }
  snapshot(): readonly Readonly<RenderedBlockDiagnosticSnapshot>[] {
    return [...this.entriesByKey.values()].map((entry) => Object.freeze({
      key: entry.key,
      block: freezeDiagnosticValue(cloneDiagnosticValue(entry.block)),
      signature: entry.signature,
      role: entry.role,
      revision: entry.revision,
      instanceBatchKey: entry.instanceBatchKey,
      instanceIndex: entry.instanceIndex,
      surfaceFaceMemberships: entry.surfaceFaceMemberships ? Object.freeze(entry.surfaceFaceMemberships.map((membership) => Object.freeze({ ...membership }))) : undefined,
      surfaceExposedFaceCount: entry.surfaceExposedFaceCount,
      surfaceNeighborFacesCulled: entry.surfaceNeighborFacesCulled,
      terrainChunkKey: entry.terrainChunkKey,
      reusableVisualKey: entry.reusableVisualKey,
      staticModelAttempted: entry.staticModelAttempted,
      staticModelFamily: entry.staticModelFamily,
      fluidChunkKey: entry.fluidChunkKey,
      fluidFallback: entry.fluidFallback,
    }));
  }
}

/** Detached diagnostic data intentionally excludes live Three.js/provider ownership. */
export interface RenderedBlockDiagnosticSnapshot {
  readonly key: string;
  readonly block: Readonly<RenderedBlockEntry['block']>;
  readonly signature: string;
  readonly role: RenderedBlockEntry['role'];
  readonly revision: number;
  readonly instanceBatchKey?: string;
  readonly instanceIndex?: number;
  readonly surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  readonly surfaceExposedFaceCount?: number;
  readonly surfaceNeighborFacesCulled?: number;
  readonly terrainChunkKey?: string;
  readonly reusableVisualKey?: string;
  readonly staticModelAttempted?: boolean;
  readonly staticModelFamily?: string;
  readonly fluidChunkKey?: string;
  readonly fluidFallback?: boolean;
}

function cloneDiagnosticValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDiagnosticValue<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDiagnosticValue(child);
  }
  return value;
}

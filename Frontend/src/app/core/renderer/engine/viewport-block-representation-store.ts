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

/** Owns canonical per-voxel representation linkage; renderers retain their GPU state. */
export class ViewportBlockRepresentationStore implements ReadonlyMap<string, RenderedBlockEntry> {
  private readonly entriesByKey = new Map<string, RenderedBlockEntry>();
  private readonly providerReferenceCounts = new Map<BlockVisualProvider, number>();

  get(key: string): RenderedBlockEntry | undefined { return this.entriesByKey.get(key); }
  has(key: string): boolean { return this.entriesByKey.has(key); }
  createOrReplace(entry: RenderedBlockEntry): void {
    const previous = this.entriesByKey.get(entry.key);
    if (previous?.provider !== entry.provider) {
      this.releaseProvider(previous?.provider);
      this.retainProvider(entry.provider);
    }
    this.entriesByKey.set(entry.key, freezeEntry(entry));
  }
  setBlock(key: string, block: ProjectDocument['blocks'][number]): boolean { return this.replace(key, (entry) => ({ ...entry, block })); }
  incrementRevision(key: string): number | undefined {
    const entry = this.entriesByKey.get(key);
    if (!entry) return undefined;
    const revision = entry.revision + 1;
    this.entriesByKey.set(key, freezeEntry({ ...entry, revision }));
    return revision;
  }
  setFallback(key: string, fallback: THREE.Mesh): boolean { return this.replace(key, (entry) => ({ ...entry, fallback, object: fallback })); }
  setObject(key: string, object: THREE.Object3D | undefined): boolean { return this.replace(key, (entry) => ({ ...entry, object })); }
  setProvider(key: string, provider: BlockVisualProvider | undefined): boolean { return this.replace(key, (entry) => ({ ...entry, provider })); }
  setInstanceMembership(key: string, membership: { readonly batchKey?: string; readonly index?: number; readonly object?: THREE.Object3D }): boolean {
    return this.replace(key, (entry) => ({ ...entry, instanceBatchKey: membership.batchKey, instanceIndex: membership.index, object: membership.object ?? entry.object }));
  }
  setSurfaceMemberships(key: string, memberships: readonly SurfaceFaceMembership[] | undefined): boolean {
    return this.replace(key, (entry) => ({ ...entry, surfaceFaceMemberships: memberships ? [...memberships] : undefined, surfaceExposedFaceCount: memberships?.length, surfaceNeighborFacesCulled: memberships === undefined ? undefined : 6 - memberships.length }));
  }
  setSurfaceObject(key: string, memberships: readonly SurfaceFaceMembership[], object: THREE.Object3D | undefined): boolean {
    return this.replace(key, (entry) => ({ ...entry, surfaceFaceMemberships: [...memberships], surfaceExposedFaceCount: memberships.length, surfaceNeighborFacesCulled: 6 - memberships.length, object }));
  }
  setTerrainRepresentation(key: string, terrainChunkKey: string | undefined, reusableVisualKey?: string): boolean {
    return this.replace(key, (entry) => ({ ...entry, terrainChunkKey, reusableVisualKey: reusableVisualKey ?? entry.reusableVisualKey }));
  }
  setReusableVisual(key: string, reusableVisualKey: string | undefined): boolean { return this.replace(key, (entry) => ({ ...entry, reusableVisualKey })); }
  setStaticModel(key: string, values: { readonly attempted?: boolean; readonly decision?: RenderedBlockEntry['staticModelDecision']; readonly family?: string }): boolean {
    return this.replace(key, (entry) => ({ ...entry, ...(values.attempted === undefined ? {} : { staticModelAttempted: values.attempted }), ...(values.decision === undefined ? {} : { staticModelDecision: values.decision }), ...(values.family === undefined ? {} : { staticModelFamily: values.family }) }));
  }
  setFluidRepresentation(key: string, fluidChunkKey: string | undefined, fallback?: boolean): boolean {
    return this.replace(key, (entry) => ({ ...entry, fluidChunkKey, ...(fallback === undefined ? {} : { fluidFallback: fallback }) }));
  }
  removeIfRevision(key: string, revision: number): boolean {
    if (this.entriesByKey.get(key)?.revision !== revision) return false;
    return this.remove(key);
  }
  remove(key: string): boolean {
    const entry = this.entriesByKey.get(key);
    if (!entry) return false;
    this.entriesByKey.delete(key);
    this.releaseProvider(entry.provider);
    return true;
  }
  clear(): void { this.entriesByKey.clear(); this.providerReferenceCounts.clear(); }
  providerReferenceCount(provider: BlockVisualProvider): number { return this.providerReferenceCounts.get(provider) ?? 0; }
  hasProviderReference(provider: BlockVisualProvider): boolean { return this.providerReferenceCount(provider) > 0; }
  get size(): number { return this.entriesByKey.size; }
  keys(): IterableIterator<string> { return this.entriesByKey.keys(); }
  values(): IterableIterator<RenderedBlockEntry> { return this.entriesByKey.values(); }
  entries(): IterableIterator<[string, RenderedBlockEntry]> { return this.entriesByKey.entries(); }
  forEach(callbackfn: (value: RenderedBlockEntry, key: string, map: ReadonlyMap<string, RenderedBlockEntry>) => void, thisArg?: unknown): void {
    this.entriesByKey.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
  [Symbol.iterator](): IterableIterator<[string, RenderedBlockEntry]> { return this.entries(); }
  private replace(key: string, update: (entry: RenderedBlockEntry) => RenderedBlockEntry): boolean {
    const entry = this.entriesByKey.get(key);
    if (!entry) return false;
    this.createOrReplace(update(entry));
    return true;
  }
  private retainProvider(provider: BlockVisualProvider | undefined): void {
    if (!provider) return;
    this.providerReferenceCounts.set(provider, (this.providerReferenceCounts.get(provider) ?? 0) + 1);
  }
  private releaseProvider(provider: BlockVisualProvider | undefined): void {
    if (!provider) return;
    const count = (this.providerReferenceCounts.get(provider) ?? 0) - 1;
    if (count > 0) this.providerReferenceCounts.set(provider, count);
    else this.providerReferenceCounts.delete(provider);
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

function freezeEntry(entry: RenderedBlockEntry): RenderedBlockEntry {
  return Object.freeze(entry.surfaceFaceMemberships
    ? { ...entry, surfaceFaceMemberships: Object.freeze([...entry.surfaceFaceMemberships]) }
    : { ...entry });
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

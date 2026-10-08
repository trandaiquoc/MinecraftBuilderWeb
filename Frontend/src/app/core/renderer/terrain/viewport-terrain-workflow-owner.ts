import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ViewportRenderOptions } from '../engine/viewport-engine-contracts';
import type { BlockVisualProvider, BlockVisualResult } from '../visuals/block-visual-provider-contract';
import type { HydrationLane } from '../scheduling/hydration-progress-tracker';
import type { ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { VisibleBlockProjectionEntry } from '../engine/y-layer-projection-coordinator';
import type { BlockHydrationJob, HydrationWorldContext, HydratedBlockVisualResult } from '../visuals/block-representation-contracts';
import type { ChunkSurfaceRenderer, TerrainApplyResult, TerrainSurfaceRecord } from './chunk-surface-renderer';
import { extractSurfaceFaceTemplates } from '../batching/surface-template-extractor';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { disposeObject } from '../presentation/renderer-resource-disposal';
import { renderChunkKey } from '../batching/render-chunk-geometry';
import { ViewportTerrainRepresentationPipeline } from './viewport-terrain-representation-pipeline';

type TerrainBlock = ProjectDocument['blocks'][number];

export interface TerrainHydrationCandidate {
  readonly key: string;
  readonly next: VisibleBlockProjectionEntry;
  readonly reusableKey: string;
  readonly worldContext: { readonly getBlock: (position: VoxelCoordinate) => TerrainBlock | undefined };
  readonly provider: BlockVisualProvider;
}

export interface TerrainWorkflowPorts {
  readonly representation: {
    readonly store: ViewportBlockRepresentationStore;
    readonly visibleEntry: (key: string) => VisibleBlockProjectionEntry | undefined;
    readonly visibleSignature: (key: string) => string | undefined;
    readonly clearPending: (key: string) => void;
    readonly pending: (key: string) => boolean;
    readonly ensurePlaceholder: (key: string, block: TerrainBlock, role: 'normal' | 'reference' | 'missing') => void;
    readonly removePlaceholder: (key: string) => void;
    readonly complete: (generation: number, keys: readonly string[]) => void;
  };
  readonly projection: {
    readonly revision: () => number;
    readonly revisionFor: (key: string) => number;
    readonly disposed: () => boolean;
  };
  readonly renderer: ChunkSurfaceRenderer;
  readonly hydration: {
    readonly generation: () => number;
    readonly providerGeneration: () => number;
    readonly runningGenerationFor: (key: string) => number | undefined;
    readonly removePending: (keys: ReadonlySet<string>) => void;
    readonly reorder: () => void;
    readonly beginProgress: (lane: HydrationLane) => void;
    readonly queuedBlocks: () => number;
    readonly schedule: () => void;
  };
  readonly fallback: {
    readonly renderOptions: () => ViewportRenderOptions;
    readonly worldContext: () => HydrationWorldContext;
    readonly enqueue: (job: BlockHydrationJob) => void;
    readonly surfaceVisibleEntries: () => ReadonlyMap<string, VisibleBlockProjectionEntry>;
  };
  readonly visual: {
    readonly create: (provider: BlockVisualProvider, block: TerrainBlock, world: TerrainHydrationCandidate['worldContext']) => Promise<BlockVisualResult & { readonly terrainTemplates?: readonly SurfaceFaceTemplate[] }>;
    readonly disposeTemplates: (templates: readonly SurfaceFaceTemplate[]) => void;
  };
  readonly trace: (event: string, details: Record<string, unknown>) => void;
  readonly recordProviderCacheStats: () => void;
  readonly scheduleRender: () => void;
}

/** Controlled placeholder ownership; callers cannot obtain the backing Map. */
export class TerrainPlaceholderSignatureStore {
  private readonly values = new Map<string, string>();
  get size(): number { return this.values.size; }
  has(key: string): boolean { return this.values.has(key); }
  get(key: string): string | undefined { return this.values.get(key); }
  set(key: string, signature: string): void { this.values.set(key, signature); }
  delete(key: string): boolean { return this.values.delete(key); }
  keys(): IterableIterator<string> { return this.values.keys(); }
  clear(): void { this.values.clear(); }
  snapshot(): ReadonlyMap<string, string> { return new Map(this.values); }
}

/**
 * Owns the semantic terrain workflow. The chunk renderer owns GPU resources;
 * this owner owns candidate disposition and the handoff back to hydration.
 */
export class ViewportTerrainWorkflowOwner {
  private readonly batches = new ViewportTerrainRepresentationPipeline<readonly SurfaceFaceTemplate[]>();
  readonly placeholderState = new TerrainPlaceholderSignatureStore();

  constructor(private readonly ports: TerrainWorkflowPorts) {}

  get pendingGroupCount(): number { return this.batches.pendingGroupCount; }
  get pendingTemplateCount(): number { return this.batches.pendingCount; }
  hasPlaceholder(key: string): boolean { return this.placeholderState.has(key); }
  placeholderSignature(key: string): string | undefined { return this.placeholderState.get(key); }
  placeholderKeys(): IterableIterator<string> { return this.placeholderState.keys(); }
  placeholderSnapshot(): ReadonlyMap<string, string> { return this.placeholderState.snapshot(); }
  placeholderCount(): number { return this.placeholderState.size; }
  setPlaceholderSignature(key: string, signature: string): void { this.placeholderState.set(key, signature); }
  clearPlaceholderSignature(key: string): void { this.placeholderState.delete(key); }
  clearPlaceholderSignatures(): void { this.placeholderState.clear(); }

  resolveTemplatesFor(
    key: string,
    create: () => Promise<HydratedBlockVisualResult>,
  ): Promise<readonly SurfaceFaceTemplate[] | undefined> {
    return this.batches.resolve(key, () => create().then((visual) => {
      if (!visual.object) return visual.terrainTemplates;
      const templates = visual.terrainTemplates ?? extractSurfaceFaceTemplates(visual.object);
      disposeObject(visual.object);
      return templates;
    }));
  }

  commit(records: Iterable<TerrainSurfaceRecord>, result: TerrainApplyResult, projectionRevision = this.ports.projection.revision()): void {
    if (projectionRevision !== this.ports.projection.revision()) return;
    const represented = new Set(result.representedKeys);
    const failed = new Set(result.failedKeys);
    for (const key of failed) {
      const current = this.ports.representation.store.get(key);
      if (!current || represented.has(key)) continue;
      this.ports.representation.store.setTerrainRepresentation(key, undefined);
      this.ports.representation.ensurePlaceholder(key, current.block, current.role);
      if (!this.ports.representation.pending(key)) this.placeholderState.set(key, current.signature);
    }
    for (const record of records) {
      const current = this.ports.representation.store.get(record.key);
      if (!current || current.signature !== this.ports.representation.visibleSignature(record.key)) continue;
      if (!represented.has(record.key)) continue;
      this.ports.representation.store.setTerrainRepresentation(record.key, renderChunkKey(record.block.position));
      this.ports.representation.clearPending(record.key);
      this.placeholderState.delete(record.key);
      this.ports.representation.removePlaceholder(record.key);
    }
    const hydrationKeys = [...new Set(result.hydrationCandidateKeys ?? result.changedKeys)].filter((key) => represented.has(key));
    if (hydrationKeys.length) {
      this.ports.representation.complete(this.ports.hydration.generation(), hydrationKeys);
      this.ports.trace('terrain-commit-hydration', { candidateKeys: (result.hydrationCandidateKeys ?? result.changedKeys).length, completedKeys: hydrationKeys.length, publishCount: 1 });
    }
  }

  scheduleWorkflowBatch(candidates: readonly TerrainHydrationCandidate[], occupancyEntries: readonly VisibleBlockProjectionEntry[], affectedPositions: readonly VoxelCoordinate[], initial: boolean, local = false, lane: HydrationLane = local ? 'local' : 'structural'): void {
    if (!candidates.length) return;
    const projectionRevision = this.ports.projection.revision();
    const generation = this.ports.hydration.generation();
    const providerGeneration = this.ports.hydration.providerGeneration();
    this.batches.scheduleBatch(
      candidates,
      {
        affectedPositions, initial, local, lane, generation, providerGeneration,
        currentGeneration: () => this.ports.hydration.generation(),
        currentProviderGeneration: () => this.ports.hydration.providerGeneration(),
        isDisposed: () => this.ports.projection.disposed(),
        projectionRevision,
        candidateProjectionRevisions: new Map(candidates.map((candidate) => [candidate.key, this.ports.projection.revisionFor(candidate.key)] as const)),
        projectionRevisionFor: (key) => this.ports.projection.revisionFor(key),
      },
      {
        cachedTemplates: (key) => this.ports.renderer.templatesFor(key),
        cacheTemplates: (key, templates) => this.ports.renderer.cacheTemplates(key, templates),
        resolveTemplates: (candidate) => this.resolveTemplates(candidate),
        disposeTemplates: (templates) => this.ports.visual.disposeTemplates(templates),
      },
      {
        currentSignature: (key) => this.ports.representation.store.get(key)?.signature,
        candidateSignature: (candidate) => candidate.next.signature,
        toRecord: (candidate, templates) => ({ key: candidate.key, block: candidate.next.block, templates, role: candidate.next.role === 'reference' ? 'reference' as const : 'normal' as const }),
        apply: (records, context) => local
          ? this.ports.renderer.applyBlockChanges(records.map((record) => ({ key: record.key, position: record.block.position, after: record, afterOpaque: record.role === 'normal' })), true)
          : this.ports.renderer.bulkUpsert(records, initial ? occupancyEntries : undefined, context.affectedPositions, { initial }),
      },
      {
        onCommit: (records, result, revision) => this.commit(records, result, revision),
        onStale: (items, staleLane) => this.discardStale(items, staleLane as HydrationLane),
        onFailed: (items, failedLane) => this.enqueueFailed(items, failedLane as HydrationLane),
        onFinished: () => {
          this.ports.recordProviderCacheStats();
          this.ports.scheduleRender();
          if (this.ports.hydration.queuedBlocks()) this.ports.hydration.schedule();
        },
      },
    );
    if (this.pendingGroupCount) this.ports.hydration.beginProgress(lane);
  }

  enqueueFailed(items: readonly TerrainHydrationCandidate[] | readonly string[], lane: HydrationLane = 'structural'): void {
    const keys = items.length && typeof items[0] !== 'string' ? items.map((item) => (item as TerrainHydrationCandidate).key) : items as readonly string[];
    const candidates = new Set<string>();
    for (const key of keys) {
      const next = this.ports.representation.visibleEntry(key);
      const current = this.ports.representation.store.get(key);
      if (!next || !current || current.signature !== next.signature) continue;
      if (this.ports.hydration.runningGenerationFor(key) === this.ports.hydration.generation()) continue;
      candidates.add(key);
    }
    if (!candidates.size) return;
    this.ports.hydration.removePending(candidates);
    for (const key of candidates) {
      const next = this.ports.representation.visibleEntry(key);
      if (!next) continue;
      this.ports.fallback.enqueue({
        token: this.ports.hydration.generation(),
        projectionRevision: this.ports.projection.revisionFor(key),
        key,
        block: next.block,
        signature: next.signature,
        role: next.role,
        worldContext: this.ports.fallback.worldContext(),
        options: this.ports.fallback.renderOptions(),
        allowInstancing: true,
        surfaceFastPathEligible: false,
        surfaceVisibleEntries: this.ports.fallback.surfaceVisibleEntries(),
      });
    }
    this.ports.hydration.reorder();
    this.ports.hydration.beginProgress(lane);
    this.ports.hydration.schedule();
  }

  /** Stale work belongs to an obsolete generation/projection, not to fallback failure. */
  private discardStale(items: readonly TerrainHydrationCandidate[], lane: HydrationLane): void {
    this.ports.trace('terrain-stale-discarded', { lane, candidateKeys: items.length });
  }

  reset(): void { this.batches.resetGroups(); }
  resetGroups(): void { this.reset(); }

  dispose(): void { this.batches.dispose(); this.placeholderState.clear(); }

  private resolveTemplates(candidate: TerrainHydrationCandidate): Promise<readonly SurfaceFaceTemplate[] | undefined> {
    return this.resolveTemplatesFor(candidate.reusableKey, () => this.ports.visual.create(candidate.provider, candidate.next.block, candidate.worldContext));
  }
}

import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { planYLayerProjectionDelta, type LayerBlockIndex } from '../../editor/viewport/y-layer';
import { isBlockVisibleForViewport } from '../../editor/viewport/visible-blocks';
import type { ViewportProjectionActivity, ViewportProjectionState } from '../diagnostics/viewport-diagnostics-contracts';
import { cancelViewportFrame, requestViewportFrame } from '../scheduling/viewport-camera-input-controller';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { coordinateKey } from '../../domain/coordinates';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { blockRenderSignature, canonicalRenderOptions, renderFilterKey } from './viewport-render-signatures';
import { yieldToBrowser } from '../../assets/cooperative-yield';
import { YLayerPresentationOwner, type VisibleBlockProjectionEntry } from './y-layer-presentation-owner';

type ProjectionMetric = 'yLayerProjectionRequests' | 'yLayerProjectionRequestsCoalesced' | 'yLayerProjectionCommits' | 'yLayerProjectionSlices' | 'yLayerProjectionYields' | 'yLayerProjectionCancellations' | 'blockSignatureComputations' | 'yLayerProjectionChangedLayers' | 'yLayerProjectionChangedBlocks' | 'yLayerProjectionAddedVisible' | 'yLayerProjectionRemovedVisible' | 'yLayerProjectionRoleChanged' | 'yLayerProjectionVoxelVisits';
export const Y_LAYER_PROJECTION_SLICE_BLOCK_LIMIT = 384;
export const Y_LAYER_PROJECTION_INITIAL_SLICE_BLOCK_LIMIT = 128;
export const Y_LAYER_PROJECTION_SLICE_BUDGET_MS = 6;
type ProjectionSnapshot = { readonly project: ProjectDocument; readonly options: ViewportRenderOptions };
type PrewarmedProjection = {
  readonly project: ProjectDocument;
  readonly options: ViewportRenderOptions;
  readonly providerGeneration: number;
};
export type PrewarmedProjectionResult =
  | { readonly entries: readonly VisibleBlockProjectionEntry[] }
  | { readonly fallbackReason: 'project-changed' | 'provider-changed' | 'projection-changed' };
export interface ProjectionLayerDelta {
  readonly layers: readonly number[];
  readonly blockOverrides?: ReadonlyMap<number, readonly PlacedBlock[]>;
  readonly flushTerrain: boolean;
  readonly publishProgress: boolean;
}
export interface ProjectionVisibleChange {
  readonly before?: VisibleBlockProjectionEntry;
  readonly after?: VisibleBlockProjectionEntry;
  readonly position: VoxelCoordinate;
}
export interface ProjectionVisibleDeltaPlan {
  readonly changes: ReadonlyMap<string, ProjectionVisibleChange>;
  readonly addedVisible: number;
  readonly removedVisible: number;
  readonly roleChanged: number;
}
export type { VisibleBlockProjectionEntry } from './y-layer-presentation-owner';
type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (frame: number) => void;

export interface YLayerProjectionPorts {
  readonly isDisposed: () => boolean;
  readonly isSuspended: () => boolean;
  readonly applyDelta: (project: ProjectDocument, options: ViewportRenderOptions, delta: ProjectionLayerDelta) => void;
  readonly finishCooperativeWork: () => void;
  readonly keySettled: (key: string) => boolean;
  readonly onCommit: (project: ProjectDocument, options: ViewportRenderOptions) => void;
  readonly onWorkFailure: (error: unknown) => void;
  readonly record: (metric: ProjectionMetric, delta?: number) => void;
  readonly recordMax: (metric: 'yLayerProjectionMaxSliceMs', value: number) => void;
}

/** Owns committed/pending Y-layer projection state, work cancellation, revisions, and settlement. */
export class YLayerProjectionCoordinator {
  private committed?: ProjectionSnapshot;
  private pending?: ProjectionSnapshot;
  private applying?: ProjectionSnapshot;
  private frame?: number;
  private revisionValue = 0;
  private workToken = 0;
  private activity: ViewportProjectionActivity = 'idle';
  private activityRevision = 0;
  private readonly listeners = new Set<(state: ViewportProjectionState) => void>();
  private readonly pendingKeys = new Set<string>();
  private settlementTimer?: ReturnType<typeof setTimeout>;
  private readonly inFlightLayers = new Set<number>();
  private readonly keyRevisions = new Map<string, number>();
  private pendingLayerIndex?: LayerBlockIndex;
  private visibleEntriesValue: VisibleBlockProjectionEntry[] = [];
  private visibleMap = new Map<string, VisibleBlockProjectionEntry>();
  private readonly visibleIndices = new Map<string, number>();
  private visibleProjectValue?: ProjectDocument;
  private visibleKey = '';
  private prewarmedProjection?: PrewarmedProjection;
  private static readonly cooperativeBlockThreshold = Y_LAYER_PROJECTION_INITIAL_SLICE_BLOCK_LIMIT;

  constructor(
    private readonly ports: YLayerProjectionPorts,
    private readonly requestFrame: FrameRequest = requestViewportFrame,
    private readonly cancelFrame: FrameCancel = cancelViewportFrame,
    private readonly presentation: YLayerPresentationOwner = new YLayerPresentationOwner(),
  ) {}

  get revision(): number { return this.revisionValue; }
  get state(): ViewportProjectionState { return { activity: this.activity, revision: this.activityRevision }; }
  get visibleEntries(): readonly VisibleBlockProjectionEntry[] { return this.presentation.isActive ? this.presentation.materializedEntries : this.visibleEntriesValue; }
  get visibleEntriesByKey(): ReadonlyMap<string, VisibleBlockProjectionEntry> { return this.presentation.isActive ? this.presentation.materializedMap : this.visibleMap; }
  get visibleProject(): ProjectDocument | undefined { return this.presentation.project ?? this.visibleProjectValue; }
  get hasDirectPresentation(): boolean { return this.presentation.isActive; }
  directVisibleEntryCount(): number | undefined { return this.presentation.visibleBlockCount(); }

  committedOptionsFor(project: ProjectDocument | undefined): ViewportRenderOptions | undefined {
    return project && this.committed?.project === project ? this.committed.options : undefined;
  }

  isProjectionTargetInFlight(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    return [this.pending, this.applying].some((snapshot) => snapshot?.project === project
      && snapshot.options.layerY === options.layerY
      && snapshot.options.visibility === options.visibility
      && snapshot.options.exposedFaceRendering === options.exposedFaceRendering);
  }

  hasVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    if (this.presentation.matches(project, options)) return true;
    return this.visibleProjectValue === project && this.visibleKey === renderFilterKey(options);
  }

  canUseCachedVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    if (this.presentation.matches(project, options)) return true;
    if (this.hasVisibleProjection(project, options)) return true;
    return this.pending?.project === project && this.committed?.project.id === project.id
      && this.committed.project.blocks === project.blocks;
  }

  visibleEntry(key: string): VisibleBlockProjectionEntry | undefined { return this.presentation.isActive ? this.presentation.visibleEntry(key) : this.visibleMap.get(key); }
  hasVisibleEntry(key: string): boolean { return this.presentation.isActive ? !!this.presentation.visibleEntry(key) : this.visibleMap.has(key); }

  setDirectPresentation(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    providerGeneration: number,
    resolveBlock: (position: VoxelCoordinate) => PlacedBlock | undefined,
    createEntry: (block: PlacedBlock, options: ViewportRenderOptions) => VisibleBlockProjectionEntry,
  ): void {
    this.presentation.activate(project, options, providerGeneration, resolveBlock, createEntry);
    this.visibleEntriesValue = [];
    this.visibleMap.clear();
    this.visibleIndices.clear();
    this.associateVisibleProjection(project, options);
    this.setCommitted(project, options);
  }

  clearDirectPresentation(): boolean {
    if (!this.presentation.isActive) return false;
    this.presentation.clear();
    this.visibleEntriesValue = [];
    this.visibleMap.clear();
    this.visibleIndices.clear();
    this.visibleProjectValue = undefined;
    this.visibleKey = '';
    return true;
  }

  createVisibleEntry(block: PlacedBlock, options: ViewportRenderOptions, occlusionClass: OcclusionClass): VisibleBlockProjectionEntry {
    const role = block.kind === 'missing' ? 'missing' : options.layerY !== undefined && block.position.y !== options.layerY ? 'reference' : 'normal';
    this.ports.record('blockSignatureComputations');
    return { block, role, signature: `${blockRenderSignature(block)}|${role}`, occlusionClass };
  }

  applyLayerDelta(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    layers: readonly number[],
    blockOverrides: ReadonlyMap<number, readonly PlacedBlock[]> | undefined,
    layerIndex: LayerBlockIndex | undefined,
    occlusionClass: (block: PlacedBlock) => OcclusionClass,
  ): ProjectionVisibleDeltaPlan {
    const blocksForLayer = createLayerLookup(project, layerIndex, blockOverrides);
    const changes = new Map<string, ProjectionVisibleChange>();
    const visibilityOptions = { ...canonicalRenderOptions(options), layerIndex };
    for (const layer of layers) for (const block of blocksForLayer(layer)) {
      this.ports.record('yLayerProjectionVoxelVisits');
      const key = coordinateKey(block.position);
      if (changes.has(key)) continue;
      const before = this.visibleMap.get(key);
      const after = isBlockVisibleForViewport(block, project, visibilityOptions)
        ? this.createVisibleEntry(block, options, occlusionClass(block))
        : undefined;
      if (before?.signature === after?.signature && before?.role === after?.role) continue;
      changes.set(key, { before, after, position: block.position });
    }

    let addedVisible = 0;
    let removedVisible = 0;
    let roleChanged = 0;
    for (const [key, change] of changes) {
      if (!change.before && change.after) addedVisible += 1;
      else if (change.before && !change.after) removedVisible += 1;
      else if (change.before && change.after && change.before.role !== change.after.role) roleChanged += 1;
      if (change.after) this.cacheVisibleEntry(key, change.after);
      else this.removeVisibleEntry(key);
    }
    this.associateVisibleProjection(project, options);
    if (changes.size) {
      this.ports.record('yLayerProjectionChangedLayers', layers.length);
      this.ports.record('yLayerProjectionChangedBlocks', changes.size);
      this.ports.record('yLayerProjectionAddedVisible', addedVisible);
      this.ports.record('yLayerProjectionRemovedVisible', removedVisible);
      this.ports.record('yLayerProjectionRoleChanged', roleChanged);
    }
    return { changes, addedVisible, removedVisible, roleChanged };
  }

  replaceVisible(project: ProjectDocument, options: ViewportRenderOptions, entries: readonly VisibleBlockProjectionEntry[]): void {
    this.clearDirectPresentation();
    this.prewarmedProjection = undefined;
    this.visibleEntriesValue = [...entries];
    this.visibleMap = new Map(entries.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    this.visibleIndices.clear();
    this.visibleEntriesValue.forEach((entry, index) => this.visibleIndices.set(coordinateKey(entry.block.position), index));
    this.associateVisibleProjection(project, options);
  }

  prewarmVisible(project: ProjectDocument, options: ViewportRenderOptions, entries: readonly VisibleBlockProjectionEntry[], providerGeneration: number): void {
    this.replaceVisible(project, options, entries);
    this.prewarmedProjection = { project, options, providerGeneration };
  }

  takePrewarmedVisible(project: ProjectDocument, options: ViewportRenderOptions, providerGeneration: number): PrewarmedProjectionResult | undefined {
    const prepared = this.prewarmedProjection;
    this.prewarmedProjection = undefined;
    if (!prepared) return undefined;
    if (prepared.project !== project) return { fallbackReason: 'project-changed' };
    if (prepared.providerGeneration !== providerGeneration) return { fallbackReason: 'provider-changed' };
    if (prepared.options.layerY !== options.layerY || prepared.options.visibility !== options.visibility
      || prepared.options.exposedFaceRendering !== options.exposedFaceRendering) return { fallbackReason: 'projection-changed' };
    return { entries: this.visibleEntriesValue };
  }

  associateVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): void {
    if (this.presentation.isActive && !this.presentation.update(project, options, this.presentation.providerGeneration ?? 0)) this.clearDirectPresentation();
    this.visibleProjectValue = project;
    this.visibleKey = renderFilterKey(options);
  }

  cacheVisibleEntry(key: string, entry: VisibleBlockProjectionEntry): void {
    if (this.presentation.isActive) return;
    const index = this.visibleIndices.get(key);
    this.visibleMap.set(key, entry);
    if (index === undefined) {
      this.visibleIndices.set(key, this.visibleEntriesValue.length);
      this.visibleEntriesValue.push(entry);
    } else this.visibleEntriesValue[index] = entry;
  }

  removeVisibleEntry(key: string): void {
    if (this.presentation.isActive) return;
    this.visibleMap.delete(key);
    const index = this.visibleIndices.get(key);
    if (index === undefined) return;
    const lastIndex = this.visibleEntriesValue.length - 1;
    if (index !== lastIndex) {
      const last = this.visibleEntriesValue[lastIndex];
      this.visibleEntriesValue[index] = last;
      this.visibleIndices.set(coordinateKey(last.block.position), index);
    }
    this.visibleEntriesValue.pop();
    this.visibleIndices.delete(key);
  }

  plan(project: ProjectDocument | undefined, fallback: ViewportRenderOptions, next: ViewportRenderOptions, index?: LayerBlockIndex) {
    const base = this.committedOptionsFor(project) ?? fallback;
    return planYLayerProjectionDelta(base.layerY, base.visibility, next.layerY, next.visibility, index, project?.blocks);
  }

  setCommitted(project: ProjectDocument, options: ViewportRenderOptions): void { this.committed = { project, options }; }

  request(project: ProjectDocument, options: ViewportRenderOptions, index?: LayerBlockIndex): void {
    this.pending = { project, options };
    this.pendingLayerIndex = index;
    this.ports.record('yLayerProjectionRequests');
    this.setActivity('applying', this.revisionValue + 1);
    if (this.frame !== undefined) {
      this.ports.record('yLayerProjectionRequestsCoalesced');
      return;
    }
    this.frame = this.requestFrame(() => this.commitPending());
  }

  cancel(): void {
    this.workToken += 1;
    this.applying = undefined;
    this.inFlightLayers.clear();
    this.pendingKeys.clear();
    if (this.settlementTimer !== undefined) clearTimeout(this.settlementTimer);
    this.settlementTimer = undefined;
    if (this.frame !== undefined) this.cancelFrame(this.frame);
    this.frame = undefined;
    this.pending = undefined;
    this.pendingLayerIndex = undefined;
    this.setActivity('idle', this.revisionValue);
  }

  clear(): void {
    this.cancel();
    this.presentation.clear();
    this.committed = undefined;
    this.keyRevisions.clear();
    this.visibleEntriesValue = [];
    this.visibleMap.clear();
    this.visibleIndices.clear();
    this.visibleProjectValue = undefined;
    this.visibleKey = '';
    this.prewarmedProjection = undefined;
  }

  dispose(): void { this.clear(); this.listeners.clear(); }

  onActivity(listener: (state: ViewportProjectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  revisionForKey(key: string): number { return this.keyRevisions.get(key) ?? 0; }
  bumpKeyRevisions(keys: ReadonlySet<string>): void { for (const key of keys) this.keyRevisions.set(key, this.revisionForKey(key) + 1); }
  markPendingKeys(keys: ReadonlySet<string>): void { for (const key of keys) this.pendingKeys.add(key); }
  isWorkCurrent(token: number): boolean { return token === this.workToken; }

  private commitPending(): void {
    this.frame = undefined;
    const pending = this.pending;
    this.pending = undefined;
    const index = this.pendingLayerIndex;
    this.pendingLayerIndex = undefined;
    const token = ++this.workToken;
    if (!pending || this.ports.isDisposed() || this.ports.isSuspended()) {
      this.applying = undefined;
      this.setActivity('idle', this.activityRevision);
      return;
    }
    const base = this.committed;
    if (!base || base.project.id !== pending.project.id || base.project.blocks !== pending.project.blocks) {
      this.applying = undefined;
      this.setActivity('idle', this.activityRevision);
      return;
    }
    const delta = planYLayerProjectionDelta(base.options.layerY, base.options.visibility, pending.options.layerY, pending.options.visibility, index ?? pending.options.layerIndex);
    const layers = [...new Set([...delta.changedLayers, ...this.inFlightLayers])].sort((left, right) => left - right);
    if (!layers.length) {
      this.applying = undefined;
      this.setActivity('idle', this.activityRevision);
      return;
    }
    this.revisionValue += 1;
    this.activityRevision = this.revisionValue;
    this.pendingKeys.clear();
    this.applying = pending;
    void this.applyLayerWork(pending.project, pending.options, layers, index ?? pending.options.layerIndex, token).then((completed) => {
      if (!completed || !this.isWorkCurrent(token) || this.ports.isDisposed()) return;
      this.applying = undefined;
      this.committed = pending;
      this.ports.onCommit(pending.project, pending.options);
      this.ports.record('yLayerProjectionCommits');
      this.setActivity('settling', this.revisionValue);
      this.scheduleSettlement(this.revisionValue);
    }).catch((error: unknown) => {
      if (this.ports.isDisposed()) return;
      if (this.isWorkCurrent(token)) this.applying = undefined;
      this.ports.onWorkFailure(error);
      if (this.isWorkCurrent(token) && !this.pending && this.frame === undefined) this.setActivity('idle', this.activityRevision);
    });
  }

  private async applyLayerWork(project: ProjectDocument, options: ViewportRenderOptions, changedLayers: readonly number[], layerIndex: LayerBlockIndex | undefined, token: number): Promise<boolean> {
    const blocksForLayer = createLayerLookup(project, layerIndex);
    const countedLayers = new Map<number, readonly PlacedBlock[]>();
    const totalBlocks = changedLayers.length > 8 ? YLayerProjectionCoordinator.cooperativeBlockThreshold + 1
      : changedLayers.reduce((count, layer) => {
        const blocks = blocksForLayer(layer);
        countedLayers.set(layer, blocks);
        return count + blocks.length;
      }, 0);
    const cooperative = changedLayers.length > 8 || totalBlocks > YLayerProjectionCoordinator.cooperativeBlockThreshold;
    if (!cooperative) {
      if (!this.isWorkCurrent(token)) return false;
      try {
        this.ports.applyDelta(project, options, { layers: changedLayers, flushTerrain: true, publishProgress: true });
        return this.isWorkCurrent(token);
      } finally {
        if (this.isWorkCurrent(token)) this.inFlightLayers.clear();
      }
    }

    try {
      let sliceLimit = Y_LAYER_PROJECTION_INITIAL_SLICE_BLOCK_LIMIT;
      let hasMore = false;
      for (let layerIndex = 0; layerIndex < changedLayers.length; layerIndex += 1) {
        const layer = changedLayers[layerIndex];
        const blocks = countedLayers.get(layer) ?? blocksForLayer(layer);
        if (!blocks.length) {
          if (!this.isWorkCurrent(token)) return this.recordCancelledWork();
          this.inFlightLayers.add(layer);
          this.ports.applyDelta(project, options, { layers: [layer], blockOverrides: new Map([[layer, []]]), flushTerrain: false, publishProgress: false });
          this.ports.record('yLayerProjectionSlices');
          hasMore = layerIndex + 1 < changedLayers.length;
          if (hasMore) {
            this.ports.record('yLayerProjectionYields');
            await yieldToBrowser();
          }
          continue;
        }
        for (let start = 0; start < blocks.length;) {
          if (!this.isWorkCurrent(token)) return this.recordCancelledWork();
          const slice = blocks.slice(start, start + sliceLimit);
          this.inFlightLayers.add(layer);
          const started = performance.now();
          this.ports.applyDelta(project, options, { layers: [layer], blockOverrides: new Map([[layer, slice]]), flushTerrain: false, publishProgress: false });
          const elapsed = performance.now() - started;
          this.ports.recordMax('yLayerProjectionMaxSliceMs', elapsed);
          this.ports.record('yLayerProjectionSlices');
          start += slice.length;
          hasMore = start < blocks.length || layerIndex + 1 < changedLayers.length;
          if (hasMore) {
            const targetLimit = Math.round(sliceLimit * Y_LAYER_PROJECTION_SLICE_BUDGET_MS / Math.max(elapsed, 1));
            sliceLimit = Math.max(32, Math.min(Y_LAYER_PROJECTION_SLICE_BLOCK_LIMIT, targetLimit));
            this.ports.record('yLayerProjectionYields');
            await yieldToBrowser();
          }
        }
      }
      if (!this.isWorkCurrent(token)) return false;
      this.ports.finishCooperativeWork();
      return this.isWorkCurrent(token);
    } finally {
      if (this.isWorkCurrent(token)) this.inFlightLayers.clear();
    }
  }

  private recordCancelledWork(): false {
    this.ports.record('yLayerProjectionCancellations');
    return false;
  }

  private scheduleSettlement(revision: number): void {
    if (this.ports.isDisposed() || this.activityRevision !== revision || this.activity !== 'settling' || this.settlementTimer !== undefined) return;
    this.settlementTimer = setTimeout(() => {
      this.settlementTimer = undefined;
      if (this.ports.isDisposed() || this.activityRevision !== revision || this.activity !== 'settling') return;
      if ([...this.pendingKeys].every((key) => this.ports.keySettled(key))) {
        this.pendingKeys.clear();
        this.setActivity('idle', revision);
      } else this.scheduleSettlement(revision);
    }, 0);
  }

  private setActivity(activity: ViewportProjectionActivity, revision: number): void {
    if (this.activity === activity && this.activityRevision === revision) return;
    this.activity = activity;
    this.activityRevision = revision;
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }
}

function createLayerLookup(
  project: ProjectDocument,
  index?: LayerBlockIndex,
  overrides?: ReadonlyMap<number, readonly PlacedBlock[]>,
): (layer: number) => readonly PlacedBlock[] {
  let fallback: Map<number, PlacedBlock[]> | undefined;
  return (layer) => {
    const override = overrides?.get(layer);
    if (override) return override;
    const indexed = index?.blocksAtY(layer);
    if (indexed) return indexed;
    fallback ??= groupBlocksByLayer(project.blocks);
    return fallback.get(layer) ?? [];
  };
}

function groupBlocksByLayer(blocks: readonly PlacedBlock[]): Map<number, PlacedBlock[]> {
  const byLayer = new Map<number, PlacedBlock[]>();
  for (const block of blocks) {
    let layer = byLayer.get(block.position.y);
    if (!layer) byLayer.set(block.position.y, layer = []);
    layer.push(block);
  }
  return byLayer;
}

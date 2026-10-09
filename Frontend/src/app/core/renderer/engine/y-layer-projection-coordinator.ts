import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { planYLayerProjectionDelta, type LayerBlockIndex } from '../../editor/viewport/y-layer';
import { isBlockVisibleForViewport } from '../../editor/viewport/visible-blocks';
import type { ViewportProjectionActivity, ViewportProjectionState } from '../diagnostics/viewport-diagnostics-contracts';
import { cancelViewportFrame, requestViewportFrame } from '../scheduling/viewport-camera-input-controller';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { coordinateKey } from '../../domain/coordinates';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { blockRenderSignature, canonicalRenderOptions, renderFilterKey } from './viewport-render-signatures';

type ProjectionMetric = 'yLayerProjectionRequests' | 'yLayerProjectionRequestsCoalesced' | 'yLayerProjectionCommits' | 'yLayerProjectionSlices' | 'yLayerProjectionYields' | 'yLayerProjectionCancellations' | 'blockSignatureComputations' | 'yLayerProjectionChangedLayers' | 'yLayerProjectionChangedBlocks' | 'yLayerProjectionAddedVisible' | 'yLayerProjectionRemovedVisible' | 'yLayerProjectionRoleChanged';
type ProjectionSnapshot = { readonly project: ProjectDocument; readonly options: ViewportRenderOptions };
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
export type VisibleBlockProjectionEntry = {
  readonly block: ProjectDocument['blocks'][number];
  readonly role: 'normal' | 'reference' | 'missing';
  readonly signature: string;
  readonly occlusionClass: OcclusionClass;
};
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
  private static readonly sliceBlockLimit = 256;

  constructor(
    private readonly ports: YLayerProjectionPorts,
    private readonly requestFrame: FrameRequest = requestViewportFrame,
    private readonly cancelFrame: FrameCancel = cancelViewportFrame,
  ) {}

  get revision(): number { return this.revisionValue; }
  get state(): ViewportProjectionState { return { activity: this.activity, revision: this.activityRevision }; }
  get visibleEntries(): readonly VisibleBlockProjectionEntry[] { return this.visibleEntriesValue; }
  get visibleEntriesByKey(): ReadonlyMap<string, VisibleBlockProjectionEntry> { return this.visibleMap; }
  get visibleProject(): ProjectDocument | undefined { return this.visibleProjectValue; }

  committedOptionsFor(project: ProjectDocument | undefined): ViewportRenderOptions | undefined {
    return project && this.committed?.project === project ? this.committed.options : undefined;
  }

  hasVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    return this.visibleProjectValue === project && this.visibleKey === renderFilterKey(options);
  }

  canUseCachedVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    if (this.hasVisibleProjection(project, options)) return true;
    return this.pending?.project === project
      && this.pending.options.visibility === 'whole-structure'
      && this.committed?.options.visibility === 'whole-structure';
  }

  visibleEntry(key: string): VisibleBlockProjectionEntry | undefined { return this.visibleMap.get(key); }
  hasVisibleEntry(key: string): boolean { return this.visibleMap.has(key); }

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
    const blocksForLayer = (layer: number): readonly PlacedBlock[] => blockOverrides?.get(layer) ?? layerIndex?.blocksAtY(layer) ?? project.blocks.filter((block) => block.position.y === layer);
    const changes = new Map<string, ProjectionVisibleChange>();
    const visibilityOptions = { ...canonicalRenderOptions(options), layerIndex };
    for (const layer of layers) for (const block of blocksForLayer(layer)) {
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
    this.visibleEntriesValue = [...entries];
    this.visibleMap = new Map(entries.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    this.visibleIndices.clear();
    this.visibleEntriesValue.forEach((entry, index) => this.visibleIndices.set(coordinateKey(entry.block.position), index));
    this.associateVisibleProjection(project, options);
  }

  associateVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): void {
    this.visibleProjectValue = project;
    this.visibleKey = renderFilterKey(options);
  }

  cacheVisibleEntry(key: string, entry: VisibleBlockProjectionEntry): void {
    const index = this.visibleIndices.get(key);
    this.visibleMap.set(key, entry);
    if (index === undefined) {
      this.visibleIndices.set(key, this.visibleEntriesValue.length);
      this.visibleEntriesValue.push(entry);
    } else this.visibleEntriesValue[index] = entry;
  }

  removeVisibleEntry(key: string): void {
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
    return planYLayerProjectionDelta(base.layerY, base.visibility, next.layerY, next.visibility, index);
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
    this.committed = undefined;
    this.keyRevisions.clear();
    this.visibleEntriesValue = [];
    this.visibleMap.clear();
    this.visibleIndices.clear();
    this.visibleProjectValue = undefined;
    this.visibleKey = '';
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
    if (!pending || this.ports.isDisposed() || this.ports.isSuspended()) {
      this.setActivity('idle', this.activityRevision);
      return;
    }
    const base = this.committed;
    if (!base || base.project.id !== pending.project.id || base.project.blocks !== pending.project.blocks) {
      this.setActivity('idle', this.activityRevision);
      return;
    }
    const delta = planYLayerProjectionDelta(base.options.layerY, base.options.visibility, pending.options.layerY, pending.options.visibility, index ?? pending.options.layerIndex);
    const layers = [...new Set([...delta.changedLayers, ...this.inFlightLayers])].sort((left, right) => left - right);
    if (!layers.length) {
      this.setActivity('idle', this.activityRevision);
      return;
    }
    this.revisionValue += 1;
    this.activityRevision = this.revisionValue;
    this.pendingKeys.clear();
    const token = ++this.workToken;
    void this.applyLayerWork(pending.project, pending.options, layers, index ?? pending.options.layerIndex, token).then((completed) => {
      if (!completed || !this.isWorkCurrent(token) || this.ports.isDisposed()) return;
      this.committed = pending;
      this.ports.onCommit(pending.project, pending.options);
      this.ports.record('yLayerProjectionCommits');
      this.setActivity('settling', this.revisionValue);
      this.scheduleSettlement(this.revisionValue);
    }).catch((error: unknown) => {
      if (this.ports.isDisposed()) return;
      this.ports.onWorkFailure(error);
      if (this.isWorkCurrent(token) && !this.pending && this.frame === undefined) this.setActivity('idle', this.activityRevision);
    });
  }

  private async applyLayerWork(project: ProjectDocument, options: ViewportRenderOptions, changedLayers: readonly number[], layerIndex: LayerBlockIndex | undefined, token: number): Promise<boolean> {
    const blocksForLayer = (layer: number): readonly PlacedBlock[] => layerIndex?.blocksAtY(layer) ?? project.blocks.filter((block) => block.position.y === layer);
    const cooperative = options.visibility === 'all-below' && changedLayers.length > 8;
    if (!cooperative) {
      if (!this.isWorkCurrent(token)) return false;
      try {
        this.ports.applyDelta(project, options, { layers: changedLayers, flushTerrain: true, publishProgress: true });
        return this.isWorkCurrent(token);
      } finally {
        if (this.isWorkCurrent(token)) this.inFlightLayers.clear();
      }
    }

    const batches: ProjectionLayerDelta[] = [];
    for (const layer of changedLayers) {
      const blocks = blocksForLayer(layer);
      if (!blocks.length) {
        batches.push({ layers: [layer], blockOverrides: new Map([[layer, []]]), flushTerrain: false, publishProgress: false });
        continue;
      }
      for (let start = 0; start < blocks.length; start += YLayerProjectionCoordinator.sliceBlockLimit) {
        batches.push({ layers: [layer], blockOverrides: new Map([[layer, blocks.slice(start, start + YLayerProjectionCoordinator.sliceBlockLimit)]]), flushTerrain: false, publishProgress: false });
      }
    }

    try {
      for (let index = 0; index < batches.length; index += 1) {
        if (!this.isWorkCurrent(token)) {
          this.ports.record('yLayerProjectionCancellations');
          return false;
        }
        const batch = batches[index];
        for (const layer of batch.layers) this.inFlightLayers.add(layer);
        const started = performance.now();
        this.ports.applyDelta(project, options, batch);
        this.ports.recordMax('yLayerProjectionMaxSliceMs', performance.now() - started);
        this.ports.record('yLayerProjectionSlices');
        if (index + 1 < batches.length) {
          this.ports.record('yLayerProjectionYields');
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      if (!this.isWorkCurrent(token)) return false;
      this.ports.finishCooperativeWork();
      return this.isWorkCurrent(token);
    } finally {
      if (this.isWorkCurrent(token)) this.inFlightLayers.clear();
    }
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

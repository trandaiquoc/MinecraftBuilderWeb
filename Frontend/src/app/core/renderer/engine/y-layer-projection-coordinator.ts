import type { ProjectDocument } from '../../domain/project.types';
import { planYLayerProjectionDelta, type LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { ViewportProjectionActivity, ViewportProjectionState } from '../diagnostics/viewport-diagnostics-contracts';
import { cancelViewportFrame, requestViewportFrame } from '../scheduling/viewport-camera-input-controller';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { coordinateKey } from '../../domain/coordinates';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { renderFilterKey } from './viewport-render-signatures';

type ProjectionMetric = 'yLayerProjectionRequests' | 'yLayerProjectionRequestsCoalesced' | 'yLayerProjectionCommits';
type ProjectionSnapshot = { readonly project: ProjectDocument; readonly options: ViewportRenderOptions };
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
  readonly applyLayers: (project: ProjectDocument, options: ViewportRenderOptions, layers: readonly number[], token: number) => Promise<boolean>;
  readonly keySettled: (key: string) => boolean;
  readonly onCommit: (project: ProjectDocument, options: ViewportRenderOptions) => void;
  readonly record: (metric: ProjectionMetric) => void;
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
  addInFlightLayer(layer: number): void { this.inFlightLayers.add(layer); }
  clearInFlightLayers(): void { this.inFlightLayers.clear(); }
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
    void this.ports.applyLayers(pending.project, pending.options, layers, token).then((completed) => {
      if (!completed || !this.isWorkCurrent(token) || this.ports.isDisposed()) return;
      this.committed = pending;
      this.ports.onCommit(pending.project, pending.options);
      this.ports.record('yLayerProjectionCommits');
      this.setActivity('settling', this.revisionValue);
      this.scheduleSettlement(this.revisionValue);
    });
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

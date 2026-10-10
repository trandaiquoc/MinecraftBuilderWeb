import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type {
  BlockVisualProvider,
  BlockVisualResult,
} from '../visuals/block-visual-provider-contract';
import type { BlockRepresentationHydrationOwner } from '../visuals/block-representation-hydration-owner';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type {
  RenderedBlockEntry,
  ViewportBlockRepresentationStore,
} from './viewport-block-representation-store';
import type { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type {
  ViewportRenderOptions,
  YLayerPrewarmOutcome,
  YLayerPrewarmTerminalNotification,
} from './viewport-engine-contracts';
import type { HydrationWorkOwnerToken } from '../scheduling/hydration-work-coordinator';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from './y-layer-projection-coordinator';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { CompiledInstanceTemplates } from '../batching/instance-template-cache';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { ChunkSurfaceRenderer } from '../terrain/chunk-surface-renderer';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { ViewportTerrainWorkflowOwner } from '../terrain/viewport-terrain-workflow-owner';
import { blockRenderSignature } from './viewport-render-signatures';
import { disposeObject } from '../presentation/renderer-resource-disposal';
import {
  YLayerVisualPreloader,
  yieldYLayerPreloadToBrowser,
  type YLayerVisualPreloadEvidence,
} from './y-layer-visual-preloader';

export const Y_LAYER_STANDALONE_RESIDENCY_LIMIT = 16_384;

export interface YLayerRepresentationPrewarmEvidence {
  readonly state: 'idle' | 'preparing' | 'ready' | 'partial' | 'cancelled' | 'failed';
  readonly blocksTotal: number;
  readonly blocksVisited: number;
  readonly representationsResident: number;
  readonly representationsSkipped: number;
  readonly jobsPending: number;
  readonly rendererPath: 'layered-resident' | 'unsupported-active-path' | 'not-started';
  readonly gpuPresentationState: 'viewport-dependent';
}

interface PreparedYLayerVisualResource {
  readonly reusableKey: string;
  readonly renderer: 'terrain' | 'instance';
  readonly compiled?: CompiledInstanceTemplates;
}

interface TerrainHydrationResult extends BlockVisualResult {
  readonly terrainTemplates?: readonly SurfaceFaceTemplate[];
}

interface PrewarmRun {
  readonly attemptId: number;
  readonly projectId: string;
  readonly blocks: readonly PlacedBlock[];
  readonly providerGeneration: number;
  index: number;
  inFlight: number;
  standaloneInFlight: number;
  standalonePrepared: number;
  readonly standaloneKeys: Set<string>;
  readonly pendingJobs: Map<string, PendingPrewarmJob>;
  prepared: number;
  skipped: number;
}

interface PendingPrewarmJob {
  readonly signature: string;
  readonly ownerToken: HydrationWorkOwnerToken;
}

interface PrewarmScope {
  readonly project: () => ProjectDocument | undefined;
  readonly options: () => ViewportRenderOptions;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly providerGeneration: () => number;
  readonly hydrationGeneration: () => number;
  readonly isDisposed: () => boolean;
}

interface PrewarmResources {
  readonly blockIndex: ViewportBlockIndexOwner;
  readonly representations: ViewportBlockRepresentationStore;
  readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly projection: YLayerProjectionCoordinator;
  readonly fluids: FluidRenderCoordinator;
  readonly instances: StaticModelBatchRenderer;
  readonly terrain: ChunkSurfaceRenderer;
  readonly terrainWorkflow: ViewportTerrainWorkflowOwner;
  readonly representationHydration: BlockRepresentationHydrationOwner;
}

interface PrewarmCallbacks {
  readonly createVisual: (
    provider: BlockVisualProvider,
    block: PlacedBlock,
    world: PrewarmWorldContext,
  ) => Promise<TerrainHydrationResult>;
  readonly reusableKey: (
    provider: BlockVisualProvider,
    block: PlacedBlock,
    world: PrewarmWorldContext,
  ) => string | undefined;
  readonly visibleEntry: (
    block: PlacedBlock,
    options: ViewportRenderOptions,
  ) => VisibleBlockProjectionEntry;
  readonly scheduleHydration: (delay?: boolean) => void;
  readonly activatePresentation: (project: ProjectDocument, providerGeneration: number) => void;
  readonly record: (metric: string, delta?: number) => void;
  readonly recordProviderCacheStats: () => void;
  readonly invalidateDiagnostics: () => void;
  readonly removeRepresentation: (key: string, entry: RenderedBlockEntry) => void;
  readonly onTerminal: (notification: YLayerPrewarmTerminalNotification) => void;
}

interface PrewarmAttempt {
  readonly attemptId: number;
  readonly project: ProjectDocument;
  readonly provider: BlockVisualProvider;
  readonly providerGeneration: number;
  phase: YLayerPrewarmTerminalNotification['phase'];
}

interface PrewarmWorldContext {
  readonly visualRevisionKey: number;
  readonly getBlock: (position: VoxelCoordinate) => PlacedBlock | undefined;
}

/** Owns Y-layer template preparation and bounded representation-prewarm lifecycle. */
export class YLayerRepresentationPrewarmOwner {
  private readonly visualPreloader: YLayerVisualPreloader<PreparedYLayerVisualResource>;
  private run?: PrewarmRun;
  private nextAttemptId = 0;
  private activeAttempt?: PrewarmAttempt;
  private scope?: {
    readonly attemptId: number;
    readonly projectId: string;
    readonly blocks: readonly PlacedBlock[];
    readonly provider: BlockVisualProvider;
    readonly providerGeneration: number;
    readonly supportsLayerResidency: boolean;
    readonly usesTerrainTemplates: boolean;
  };
  private evidenceValue: YLayerRepresentationPrewarmEvidence = emptyRepresentationEvidence();

  constructor(
    private readonly current: PrewarmScope,
    private readonly resources: PrewarmResources,
    private readonly callbacks: PrewarmCallbacks,
  ) {
    this.visualPreloader = new YLayerVisualPreloader<PreparedYLayerVisualResource>({
      hasCached: (key) =>
        this.usesTerrainTemplates()
          ? resources.terrain.hasTemplates(key)
          : resources.instances.hasTemplate(key),
      reusableKey: (block) => {
        const provider = current.provider();
        return provider ? callbacks.reusableKey(provider, block, this.worldContext()) : undefined;
      },
      create: (block, key) => this.createTemplateResource(block, key),
      commit: (key, resource) =>
        resource.value.renderer === 'instance' && resource.value.compiled
          ? resources.instances.cachePreparedTemplate(key, resource.value.compiled)
          : true,
      dispose: (resource) => {
        if (resource.value.renderer === 'instance' && resource.value.compiled)
          resources.instances.disposePreparedTemplate(resource.value.compiled);
      },
      isCurrent: (blocks, providerGeneration) =>
        !current.isDisposed() &&
        current.project()?.blocks === blocks &&
        current.providerGeneration() === providerGeneration,
      providerGeneration: current.providerGeneration,
      yieldToBrowser: yieldYLayerPreloadToBrowser,
    });
  }

  get visualEvidence(): YLayerVisualPreloadEvidence {
    return this.visualPreloader.evidence;
  }
  get representationEvidence(): YLayerRepresentationPrewarmEvidence {
    return { ...this.evidenceValue };
  }
  get isPreparingRepresentation(): boolean {
    return this.run !== undefined;
  }

  prepare(project: ProjectDocument): void {
    const options = this.current.options();
    const provider = this.current.provider();
    if (
      this.current.isDisposed() ||
      options.layerY === undefined ||
      !provider ||
      this.current.project()?.id !== project.id ||
      this.current.project()?.blocks !== project.blocks
    )
      return;

    const providerGeneration = this.current.providerGeneration();
    const usesTerrainTemplates = options.exposedFaceRendering === true;
    const supportsLayerResidency = !usesTerrainTemplates;
    if (
      this.scope?.projectId === project.id &&
      this.scope.blocks === project.blocks &&
      this.scope.provider === provider &&
      this.scope.providerGeneration === providerGeneration &&
      this.scope.supportsLayerResidency === supportsLayerResidency &&
      this.scope.usesTerrainTemplates === usesTerrainTemplates
    )
      return;

    if (this.scope) this.cancel();

    const attemptId = ++this.nextAttemptId;
    this.scope = {
      attemptId,
      projectId: project.id,
      blocks: project.blocks,
      provider,
      providerGeneration,
      supportsLayerResidency,
      usesTerrainTemplates,
    };
    const attempt: PrewarmAttempt = {
      attemptId,
      project,
      provider,
      providerGeneration,
      phase: 'visual-templates',
    };
    this.activeAttempt = attempt;
    this.evidenceValue = {
      state: supportsLayerResidency ? 'preparing' : 'partial',
      blocksTotal: project.blocks.length,
      blocksVisited: 0,
      representationsResident: 0,
      representationsSkipped: supportsLayerResidency ? 0 : project.blocks.length,
      jobsPending: 0,
      rendererPath: supportsLayerResidency ? 'layered-resident' : 'unsupported-active-path',
      gpuPresentationState: 'viewport-dependent',
    };

    const preparation = this.visualPreloader.start(
      project.blocks,
      providerGeneration,
      usesTerrainTemplates ? 'terrain-surface' : 'static-instance',
    );
    void preparation.then((evidence) => {
      this.onVisualPreloadSettled(attempt, evidence, usesTerrainTemplates);
    }).catch(() => this.failAttempt(attempt));
  }

  onHydrationCompleted(job: BlockHydrationJob, authoritative: boolean): void {
    const run = this.run;
    const pending = run?.pendingJobs.get(job.key);
    if (
      !run ||
      job.layerPrewarm !== true ||
      job.layerPrewarmAttemptId !== run.attemptId ||
      !pending ||
      pending.signature !== job.signature ||
      !sameOwnerToken(pending.ownerToken, job.ownerToken) ||
      job.token !== this.current.hydrationGeneration() ||
      !this.isCurrentRun(run)
    ) return;
    run.pendingJobs.delete(job.key);
    run.inFlight = Math.max(0, run.inFlight - 1);
    if (run.standaloneKeys.delete(job.key))
      run.standaloneInFlight = Math.max(0, run.standaloneInFlight - 1);
    try {
      const canonical = this.resources.blockIndex.get(job.block.position);
      const representation = this.resources.representations.get(job.key);
      const valid =
        authoritative &&
        this.current.providerGeneration() === run.providerGeneration &&
        canonical &&
        blockRenderSignature(canonical) === blockRenderSignature(job.block) &&
        representation &&
        representation.signature === job.signature;
      if (valid) {
        run.prepared += 1;
        if (isStandalone(representation)) run.standalonePrepared += 1;
        this.callbacks.record('yLayerRepresentationJobsCompleted');
      } else if (
        representation?.signature === job.signature &&
        canonical &&
        blockRenderSignature(canonical) !== blockRenderSignature(job.block)
      ) {
        this.callbacks.removeRepresentation(job.key, representation);
        this.callbacks.record('yLayerRepresentationJobsSkipped');
        run.skipped += 1;
      } else {
        run.skipped += 1;
      }
      this.pumpRepresentationPrewarm();
    } catch {
      const attempt = this.activeAttempt;
      if (attempt?.attemptId === run.attemptId) this.failAttempt(attempt);
    }
  }

  dependencySettled(): void {
    this.pumpRepresentationPrewarm();
  }

  cancel(): void {
    this.cancelActiveAttempt(true);
  }

  private cancelActiveAttempt(notify: boolean): void {
    const attempt = this.activeAttempt;
    this.visualPreloader.cancel();
    if (this.run) this.cleanupQueuedJobs(this.run);
    if (attempt || this.run)
      this.evidenceValue = { ...this.evidenceValue, state: 'cancelled', jobsPending: 0 };
    this.run = undefined;
    try {
      if (attempt) {
        if (notify) this.finishAttempt(attempt, 'cancelled');
        else this.activeAttempt = undefined;
      }
    } finally {
      this.scope = undefined;
    }
  }

  dispose(): void {
    this.cancelActiveAttempt(false);
    this.visualPreloader.dispose();
    this.evidenceValue = emptyRepresentationEvidence();
  }

  private onVisualPreloadSettled(
    attempt: PrewarmAttempt,
    evidence: YLayerVisualPreloadEvidence,
    usesTerrainTemplates: boolean,
  ): void {
    if (!this.isCurrentAttempt(attempt)) return;
    if (evidence.state === 'cancelled') {
      this.evidenceValue = { ...this.evidenceValue, state: 'cancelled', jobsPending: 0 };
      this.finishAttempt(attempt, 'cancelled');
      this.scope = undefined;
      return;
    }
    if (evidence.state === 'failed') {
      this.failAttempt(attempt);
      return;
    }
    if (usesTerrainTemplates) {
      this.finishAttempt(attempt, evidence.state === 'partial' ? 'partial' : 'ready');
      return;
    }
    this.beginRepresentationPrewarm(attempt);
  }

  private beginRepresentationPrewarm(attempt: PrewarmAttempt): void {
    const { project, providerGeneration } = attempt;
    if (
      this.run?.projectId === project.id &&
      this.run.blocks === project.blocks &&
      this.run.providerGeneration === providerGeneration
    )
      return;
    attempt.phase = 'representations';
    this.run = {
      attemptId: attempt.attemptId,
      projectId: project.id,
      blocks: project.blocks,
      providerGeneration,
      index: 0,
      inFlight: 0,
      standaloneInFlight: 0,
      standalonePrepared: 0,
      standaloneKeys: new Set(),
      pendingJobs: new Map(),
      prepared: 0,
      skipped: 0,
    };
    this.evidenceValue = {
      state: 'preparing',
      blocksTotal: project.blocks.length,
      blocksVisited: 0,
      representationsResident: 0,
      representationsSkipped: 0,
      jobsPending: 0,
      rendererPath: 'layered-resident',
      gpuPresentationState: 'viewport-dependent',
    };
    this.pumpRepresentationPrewarm();
  }

  private pumpRepresentationPrewarm(): void {
    try {
      this.pumpRepresentationPrewarmWork();
    } catch {
      const attempt = this.activeAttempt;
      if (attempt) this.failAttempt(attempt);
    }
  }

  private pumpRepresentationPrewarmWork(): void {
    const run = this.run;
    if (!run || !this.isCurrentRun(run)) return;
    const maxInFlight = 192;
    const sliceLimit = 96;
    let queued = 0;
    let scanned = 0;
    const options = this.current.options();
    const world = this.worldContext();
    let waitingOnFluid = false;

    while (run.index < run.blocks.length && run.inFlight < maxInFlight && scanned < sliceLimit) {
      const block = run.blocks[run.index++];
      scanned += 1;
      const key = coordinateKey(block.position);
      if (this.resources.fluids.isClaimed(key)) {
        if (!this.resources.fluids.isTerminal(key)) {
          run.index -= 1;
          waitingOnFluid = true;
          break;
        }
        run.prepared += 1;
        continue;
      }
      const existing = this.resources.representations.get(key);
      if (existing) {
        run.prepared += 1;
        if (isStandalone(existing)) run.standalonePrepared += 1;
        continue;
      }
      if (this.resources.hydration.hasPendingSignature(key)) {
        run.skipped += 1;
        continue;
      }
      const provider = this.current.provider();
      if (!provider) {
        run.skipped += 1;
        continue;
      }
      const reusableKey = this.callbacks.reusableKey(provider, block, world);
      const reusableTemplate = !!reusableKey && this.resources.instances.hasTemplate(reusableKey);
      if (
        !reusableTemplate &&
        run.standalonePrepared + run.standaloneInFlight >= Y_LAYER_STANDALONE_RESIDENCY_LIMIT
      ) {
        run.skipped += 1;
        continue;
      }
      const visible = this.callbacks.visibleEntry(block, options);
      const hydrationToken = this.current.hydrationGeneration();
      const ownerToken: HydrationWorkOwnerToken = {
        owner: 'y-layer-prewarm',
        attempt: run.attemptId,
        generation: hydrationToken,
      };
      run.pendingJobs.set(key, { signature: visible.signature, ownerToken });
      this.resources.hydration.setPendingSignature(key, visible.signature, ownerToken);
      this.resources.hydration.enqueueRegular({
        token: hydrationToken,
        projectionRevision: this.resources.projection.revisionForKey(key),
        key,
        block,
        signature: visible.signature,
        role: visible.role,
        worldContext: world,
        options,
        allowInstancing: reusableTemplate,
        surfaceFastPathEligible: false,
        surfaceVisibleEntries: this.resources.projection.visibleEntriesByKey,
        layerPrewarm: true,
        layerPrewarmAttemptId: run.attemptId,
        ownerToken,
      });
      run.inFlight += 1;
      if (!reusableTemplate) {
        run.standaloneInFlight += 1;
        run.standaloneKeys.add(key);
      }
      queued += 1;
    }

    if (queued) {
      this.callbacks.record('yLayerRepresentationJobsQueued', queued);
      this.callbacks.scheduleHydration(true);
    }
    this.evidenceValue = {
      ...this.evidenceValue,
      blocksVisited: run.index,
      representationsResident: run.prepared,
      representationsSkipped: run.skipped,
      jobsPending: run.inFlight,
    };
    if (run.index >= run.blocks.length && run.inFlight === 0) {
      if (run.skipped) this.callbacks.record('yLayerRepresentationJobsSkipped', run.skipped);
      this.callbacks.record('yLayerRepresentationPrewarmCompleted', run.prepared);
      this.evidenceValue = {
        ...this.evidenceValue,
        state: run.skipped ? 'partial' : 'ready',
        jobsPending: 0,
      };
      this.run = undefined;
      this.callbacks.recordProviderCacheStats();
      this.callbacks.invalidateDiagnostics();
      const project = this.current.project();
      if (project) this.callbacks.activatePresentation(project, run.providerGeneration);
      this.callbacks.scheduleHydration(false);
      const attempt = this.activeAttempt;
      if (attempt?.attemptId === run.attemptId)
        this.finishAttempt(attempt, run.skipped ? 'partial' : 'ready');
      return;
    }
    if (!waitingOnFluid && !queued && run.inFlight === 0 && run.index < run.blocks.length)
      setTimeout(() => this.pumpRepresentationPrewarm(), 0);
  }

  private async createTemplateResource(block: PlacedBlock, key: string) {
    const provider = this.current.provider();
    if (!provider) return undefined;
    const world = this.worldContext();
    const projectBlocks = this.current.project()?.blocks;
    const providerGeneration = this.current.providerGeneration();
    if (this.usesTerrainTemplates()) {
      const templates = await this.resources.terrainWorkflow.resolveTemplatesFor(
        key,
        () => this.callbacks.createVisual(provider, block, world),
        provider,
        () =>
          this.current.provider() === provider &&
          this.current.project()?.blocks === projectBlocks &&
          this.current.providerGeneration() === providerGeneration,
      );
      if (!templates || !this.resources.terrain.hasTemplates(key)) return undefined;
      return {
        value: { reusableKey: key, renderer: 'terrain' as const },
        estimatedBytes: estimateSurfaceTemplateBytes(templates),
        alreadyCached: true,
      };
    }

    const releaseProvider =
      this.resources.representationHydration.acquireProviderReference(provider);
    let visual: TerrainHydrationResult | undefined;
    try {
      visual = await this.callbacks.createVisual(provider, block, world);
      if (
        !visual?.object ||
        this.current.provider() !== provider ||
        this.current.project()?.blocks !== projectBlocks ||
        this.current.providerGeneration() !== providerGeneration
      )
        return undefined;
      const prepared = this.resources.instances.prepareReusableTemplate(visual.object);
      return prepared
        ? {
            value: { reusableKey: key, renderer: 'instance' as const, compiled: prepared.compiled },
            estimatedBytes: prepared.estimatedBytes,
          }
        : undefined;
    } finally {
      releaseProvider();
      if (visual?.object) disposeObject(visual.object);
    }
  }

  private worldContext(): PrewarmWorldContext {
    return {
      visualRevisionKey: this.resources.blockIndex.visualRevision,
      getBlock: (position) => this.resources.blockIndex.get(position),
    };
  }

  private usesTerrainTemplates(): boolean {
    return this.current.options().exposedFaceRendering === true;
  }

  private isCurrent(project: ProjectDocument, providerGeneration: number): boolean {
    return (
      !this.current.isDisposed() &&
      this.current.project()?.id === project.id &&
      this.current.project()?.blocks === project.blocks &&
      this.current.providerGeneration() === providerGeneration
    );
  }

  private isCurrentAttempt(attempt: PrewarmAttempt): boolean {
    return this.activeAttempt === attempt && this.scope?.attemptId === attempt.attemptId &&
      this.current.provider() === attempt.provider &&
      this.isCurrent(attempt.project, attempt.providerGeneration);
  }

  private failAttempt(attempt: PrewarmAttempt): void {
    if (!this.isCurrentAttempt(attempt)) return;
    if (this.run?.attemptId === attempt.attemptId) this.cleanupQueuedJobs(this.run);
    this.run = undefined;
    this.evidenceValue = { ...this.evidenceValue, state: 'failed', jobsPending: 0 };
    this.finishAttempt(attempt, 'failed');
  }

  private finishAttempt(attempt: PrewarmAttempt, outcome: YLayerPrewarmOutcome): void {
    if (!this.isCurrentAttempt(attempt)) return;
    this.activeAttempt = undefined;
    if (this.current.isDisposed()) return;
    this.callbacks.onTerminal({
      attemptId: attempt.attemptId,
      projectId: attempt.project.id,
      blocks: attempt.project.blocks,
      provider: attempt.provider,
      providerGeneration: attempt.providerGeneration,
      phase: attempt.phase,
      outcome,
    });
  }

  private cleanupQueuedJobs(run: PrewarmRun): void {
    for (const [key, pending] of run.pendingJobs) {
      this.resources.hydration.removePendingForKey(
        key,
        (job) =>
          job.layerPrewarm === true &&
          job.layerPrewarmAttemptId === run.attemptId &&
          job.token === pending.ownerToken.generation &&
          sameOwnerToken(job.ownerToken, pending.ownerToken),
      );
      this.resources.hydration.clearPendingSignatureIfOwned(
        key,
        pending.signature,
        pending.ownerToken,
      );
    }
    run.pendingJobs.clear();
  }

  private isCurrentRun(run: PrewarmRun): boolean {
    const project = this.current.project();
    return (
      !this.current.isDisposed() &&
      project?.id === run.projectId &&
      project.blocks === run.blocks &&
      this.current.providerGeneration() === run.providerGeneration
    );
  }
}

function isStandalone(entry: {
  readonly instanceBatchKey?: string;
  readonly surfaceFaceMemberships?: unknown;
  readonly terrainChunkKey?: string;
  readonly fluidChunkKey?: string;
}): boolean {
  return (
    !entry.instanceBatchKey &&
    !entry.surfaceFaceMemberships &&
    entry.terrainChunkKey === undefined &&
    entry.fluidChunkKey === undefined
  );
}

function estimateSurfaceTemplateBytes(templates: readonly SurfaceFaceTemplate[]): number {
  let byteLength = 0;
  for (const template of templates) {
    for (const attribute of Object.values(template.geometry.attributes))
      byteLength += attribute.array.byteLength;
    if (template.geometry.index) byteLength += template.geometry.index.array.byteLength;
  }
  return byteLength;
}

function emptyRepresentationEvidence(): YLayerRepresentationPrewarmEvidence {
  return {
    state: 'idle',
    blocksTotal: 0,
    blocksVisited: 0,
    representationsResident: 0,
    representationsSkipped: 0,
    jobsPending: 0,
    rendererPath: 'not-started',
    gpuPresentationState: 'viewport-dependent',
  };
}

function sameOwnerToken(
  left: HydrationWorkOwnerToken | undefined,
  right: HydrationWorkOwnerToken | undefined,
): boolean {
  return left === right || (
    !!left && !!right && left.owner === right.owner &&
    left.attempt === right.attempt && left.generation === right.generation
  );
}

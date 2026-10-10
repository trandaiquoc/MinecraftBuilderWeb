import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { visibleBlockEntries } from '../../editor/viewport/visible-blocks';
import type { ViewportRenderOptions } from '../engine/viewport-engine-contracts';
import { canonicalRenderOptions } from '../engine/viewport-render-signatures';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { BlockRepresentationHydrationOwner } from '../visuals/block-representation-hydration-owner';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { ViewportBlockIndexOwner } from '../engine/viewport-block-index-owner';
import type {
  ViewportBlockRepresentationStore,
  RenderedBlockEntry,
} from '../engine/viewport-block-representation-store';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from '../engine/y-layer-projection-coordinator';
import { isCompiledTerrainEntry } from '../terrain/terrain-classifier';
import { ViewportProviderRefreshPipeline } from './viewport-provider-refresh-pipeline';

export interface ProviderRefreshCandidate {
  readonly key: string;
  readonly entry: RenderedBlockEntry;
  readonly visibleEntry: VisibleBlockProjectionEntry;
  readonly previousProvider: BlockVisualProvider;
  readonly nextProvider: BlockVisualProvider;
  readonly worldContext: {
    readonly visualRevisionKey: number;
    getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined;
  };
  readonly visible: ReadonlyMap<string, VisibleBlockProjectionEntry>;
}

export interface ViewportProviderRefreshOwnerPorts {
  readonly currentProject: () => ProjectDocument | undefined;
  readonly currentOptions: () => ViewportRenderOptions;
  readonly layerIndex: () => import('../../editor/viewport/y-layer').LayerBlockIndex | undefined;
  readonly isSuspended: () => boolean;
  readonly markSuspendedRefresh: () => void;
  readonly reusableKey: (
    provider: BlockVisualProvider,
    block: ProjectDocument['blocks'][number],
    world: ProviderRefreshCandidate['worldContext'],
  ) => string | undefined;
  readonly scheduleHydration: () => void;
  readonly publishProgress: () => void;
  readonly trace: (event: string, details: Readonly<Record<string, unknown>>) => void;
}

/** Owns provider-refresh candidate construction and provider-reference release policy. */
export class ViewportProviderRefreshOwner {
  constructor(
    readonly pipeline: ViewportProviderRefreshPipeline<
      BlockVisualProvider,
      ProviderRefreshCandidate,
      BlockHydrationJob
    >,
    private readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>,
    private readonly blockIndex: ViewportBlockIndexOwner,
    private readonly representations: ViewportBlockRepresentationStore,
    private readonly projection: YLayerProjectionCoordinator,
    private readonly fluids: FluidRenderCoordinator,
    private readonly representationHydration: BlockRepresentationHydrationOwner,
    private readonly ports: ViewportProviderRefreshOwnerPorts,
  ) {}

  transition(
    previous: BlockVisualProvider | undefined,
    next: BlockVisualProvider | undefined,
  ): void {
    this.pipeline.transition(previous, next);
  }

  defer(previous: BlockVisualProvider, next: BlockVisualProvider): void {
    this.pipeline.defer(previous, next);
  }

  takeDeferred():
    { readonly previous: BlockVisualProvider; readonly next: BlockVisualProvider } | undefined {
    return this.pipeline.takeDeferred();
  }

  cancelPlanning(): void {
    this.pipeline.cancelPlanning();
  }

  retire(provider: BlockVisualProvider | undefined): void {
    this.pipeline.retire(provider);
  }

  dispose(): void {
    this.pipeline.dispose(
      (provider) =>
        this.representations.hasProviderReference(provider) ||
        this.representationHydration.hasActiveProviderReference(provider) ||
        this.fluids.referencedProviders().has(provider),
    );
  }

  refresh(previousProvider: BlockVisualProvider, nextProvider: BlockVisualProvider): void {
    if (this.ports.isSuspended()) {
      this.defer(previousProvider, nextProvider);
      this.ports.markSuspendedRefresh();
      return;
    }
    const project = this.ports.currentProject();
    if (!project) return;
    const options = this.ports.currentOptions();
    const visible = this.projection.hasVisibleProjection(project, options)
      ? this.projection.visibleEntriesByKey
      : new Map(
          visibleBlockEntries(project, {
            ...canonicalRenderOptions(options),
            layerIndex: options.layerIndex ?? this.ports.layerIndex(),
          }).map((block) => {
            const entry = this.projection.createVisibleEntry(
              block,
              options,
              nextProvider.occlusionClass?.(block) ?? 'unknown',
            );
            return [coordinateKey(block.position), entry] as const;
          }),
        );
    const worldContext = {
      visualRevisionKey: this.blockIndex.visualRevision,
      getBlock: (position: VoxelCoordinate) => this.blockIndex.get(position),
    };
    this.pipeline.refreshRepresentations(
      [...this.representations],
      visible,
      (key, entry, visibleEntry) => ({
        key,
        entry,
        visibleEntry,
        previousProvider,
        nextProvider,
        worldContext,
        visible,
      }),
      {
        isMissing: (candidate) => candidate.entry.block.kind === 'missing',
        isFluid: (candidate) =>
          candidate.entry.fluidChunkKey !== undefined || this.fluids.isClaimed(candidate.key),
        reusableKey: (candidate, provider) =>
          this.ports.reusableKey(provider, candidate.entry.block, candidate.worldContext),
        createJob: (candidate, planGeneration) => ({
          token: this.hydration.generation,
          projectionRevision: this.projection.revisionForKey(candidate.key),
          key: candidate.key,
          block: candidate.visibleEntry.block,
          signature: candidate.visibleEntry.signature,
          role: candidate.visibleEntry.role,
          worldContext: candidate.worldContext,
          options,
          allowInstancing: false,
          surfaceFastPathEligible:
            options.exposedFaceRendering === true && isCompiledTerrainEntry(candidate.visibleEntry),
          surfaceVisibleEntries: candidate.visible,
          providerRefresh: true,
          providerRefreshGeneration: planGeneration,
        }),
        onTrace: this.ports.trace,
        onStateChange: this.ports.publishProgress,
        onScheduleHydration: this.ports.scheduleHydration,
      },
    );
  }

  releaseUnused(): void {
    this.pipeline.releaseUnused(
      (provider) =>
        this.representations.hasProviderReference(provider) ||
        this.representationHydration.hasActiveProviderReference(provider) ||
        this.fluids.referencedProviders().has(provider),
    );
  }
}

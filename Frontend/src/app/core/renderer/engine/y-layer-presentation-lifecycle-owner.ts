import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import { visibleLayerSet } from '../../editor/viewport/y-layer';
import type { RendererDiagnostics } from './renderer-diagnostics';
import type { ViewportBlockRepresentationStore } from './viewport-block-representation-store';
import type { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import type { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { ViewportTerrainWorkflowOwner } from '../terrain/viewport-terrain-workflow-owner';
import type { ChunkSurfaceRenderer } from '../terrain/chunk-surface-renderer';
import type { ViewportInteriorCullingOwner } from '../visibility/viewport-interior-culling-owner';
import type { ViewportProviderRefreshPipeline } from '../provider/viewport-provider-refresh-pipeline';
import type { LayeredObjectPresentationOwner } from '../batching/layered-object-presentation-owner';
import type { YLayerProjectionCoordinator } from './y-layer-projection-coordinator';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import {
  YLayerPresentationOwner,
  type YLayerPresentationDecision,
  type YLayerPresentationFallbackReason,
  type YLayerPresentationReadiness,
} from './y-layer-presentation-owner';

interface ReadinessCache {
  readonly projectId: string;
  readonly blocks: ProjectDocument['blocks'];
  readonly providerGeneration: number;
  readonly representationRevision: number;
  readonly instanceBatchCount: number;
  readonly surfaceBatchCount: number;
  readonly placeholderBatchCount: number;
  readonly instanceMembers: number;
  readonly placeholders: number;
  readonly surfaceRepresentations: number;
  readonly terrainRepresentations: number;
  readonly fluidRepresentations: number;
  readonly layeredFluids: boolean;
  readonly interiorCulledBlocks: number;
  readonly pendingWork: boolean;
  readonly value: YLayerPresentationReadiness;
}

export interface DirectPresentationTransition {
  readonly direct: boolean;
  readonly fallbackReason?: YLayerPresentationFallbackReason;
  readonly transitioned: boolean;
}

export interface DirectPresentationInput {
  readonly project?: ProjectDocument;
  readonly previousProject?: ProjectDocument;
  readonly options: ViewportRenderOptions;
  readonly allowed: boolean;
  readonly hadDirectPresentation: boolean;
  readonly retainDirectPresentation: boolean;
  readonly layerProjectionOnly: boolean;
}

interface PresentationResources {
  readonly representations: ViewportBlockRepresentationStore;
  readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly providerRefresh: Pick<
    ViewportProviderRefreshPipeline<BlockVisualProvider, never, BlockHydrationJob>,
    'isPlanning' | 'progress'
  >;
  readonly instances: StaticModelBatchRenderer;
  readonly surfaces: SurfaceFaceBatchRenderer;
  readonly placeholders: PlaceholderBatchRenderer;
  readonly terrain: ViewportTerrainWorkflowOwner;
  readonly terrainRenderer: ChunkSurfaceRenderer;
  readonly fluids: FluidRenderCoordinator;
  readonly culling: ViewportInteriorCullingOwner;
  readonly layeredObjects: LayeredObjectPresentationOwner;
  readonly projection: YLayerProjectionCoordinator;
  readonly blockIndex: ViewportBlockIndexOwner;
  readonly diagnostics: RendererDiagnostics;
}

interface PresentationScope {
  readonly project: () => ProjectDocument | undefined;
  readonly options: () => ViewportRenderOptions;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly providerGeneration: () => number;
  readonly layerIndex: () => import('../../editor/viewport/y-layer').LayerBlockIndex | undefined;
  readonly hasRepresentationPrewarm: () => boolean;
  readonly isDisposed: () => boolean;
}

/** Owns resident layer presentation, readiness evidence, and direct-mode transitions. */
export class YLayerPresentationLifecycleOwner {
  private readinessCache?: ReadinessCache;

  constructor(
    private readonly presentation: YLayerPresentationOwner,
    private readonly scope: PresentationScope,
    private readonly resources: PresentationResources,
  ) {}

  apply(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    if (!project || options.layerY === undefined || options.visibility === undefined) {
      this.resources.instances.clearLayerPresentation();
      this.resources.surfaces.clearLayerPresentation();
      this.resources.placeholders.clearLayerPresentation();
      this.resources.layeredObjects.clearPresentation();
      this.resources.fluids.setLayerPresentation(undefined);
      return;
    }
    const layers = visibleLayerSet(
      options.layerY,
      project.blocks,
      options.visibility,
      options.layerIndex ?? this.scope.layerIndex(),
    );
    const hiddenGroupIds = new Set(
      project.groups.filter((group) => group.visible === false).map((group) => group.id),
    );
    const referenceOpacity = options.referenceOpacity ?? 0.28;
    this.resources.fluids.setLayerPresentation({
      visibleLayers: layers,
      currentY: options.layerY,
      hiddenGroupIds,
      isolatedGroupId: options.isolatedGroupId,
      referenceOpacity,
    });
    this.resources.instances.setLayerPresentation(
      layers,
      options.layerY,
      referenceOpacity,
      hiddenGroupIds,
      options.isolatedGroupId,
    );
    this.resources.surfaces.setLayerPresentation(
      layers,
      options.layerY,
      referenceOpacity,
      hiddenGroupIds,
      options.isolatedGroupId,
    );
    this.resources.placeholders.setLayerPresentation(
      layers,
      options.layerY,
      hiddenGroupIds,
      options.isolatedGroupId,
    );
    this.resources.layeredObjects.setPresentation({
      visibleLayers: layers,
      currentY: options.layerY,
      referenceOpacity,
      groups: project.groups,
      isolatedGroupId: options.isolatedGroupId,
    });
  }

  synchronizeDirect(input: DirectPresentationInput): DirectPresentationTransition {
    const {
      project,
      previousProject,
      options,
      allowed,
      hadDirectPresentation,
      retainDirectPresentation,
    } = input;
    if (allowed && project) {
      const decision = this.evaluate(project, options);
      if (decision.supported) {
        if (hadDirectPresentation)
          this.resources.projection.associateVisibleProjection(project, options);
        else this.activate(project, options, this.scope.providerGeneration());
        return {
          direct: true,
          transitioned: !hadDirectPresentation || input.layerProjectionOnly,
        };
      }
      if (hadDirectPresentation) this.resources.projection.clearDirectPresentation();
      return { direct: false, fallbackReason: decision.reason, transitioned: false };
    }

    if (hadDirectPresentation && !retainDirectPresentation) {
      this.resources.projection.clearDirectPresentation();
      return {
        direct: false,
        fallbackReason:
          this.presentation.providerGeneration !== this.scope.providerGeneration()
            ? 'pending-render-work'
            : project?.groups !== previousProject?.groups
              ? 'hidden-groups'
              : 'incomplete-residency',
        transitioned: false,
      };
    }

    return { direct: retainDirectPresentation, transitioned: false };
  }

  activatePrepared(project: ProjectDocument | undefined, providerGeneration: number): boolean {
    if (
      !project ||
      this.scope.isDisposed() ||
      this.scope.project()?.id !== project.id ||
      this.scope.project()?.blocks !== project.blocks ||
      this.scope.providerGeneration() !== providerGeneration
    )
      return false;
    const options = this.scope.options();
    if (
      options.layerY === undefined ||
      options.visibility === undefined ||
      !this.evaluate(project, options).supported
    )
      return false;
    this.activate(project, options, providerGeneration);
    return true;
  }

  canRetainForMutation(
    project: ProjectDocument,
    mutationHint: ProjectMutationHint | undefined,
  ): boolean {
    if (!mutationHint || mutationHint.kind !== 'block-delta') return false;
    const provider = this.scope.provider();
    const worldContext = {
      getBlock: (position: VoxelCoordinate) => this.resources.blockIndex.get(position),
    };
    return (
      mutationHint.changes.every(({ after }) => {
        if (!after) return true;
        if (after.kind !== 'resolved') return false;
        const reusableKey = provider?.reusableVisualKey?.(after, worldContext);
        return !!reusableKey && this.resources.instances.hasTemplate(reusableKey);
      }) && this.resources.blockIndex.currentProject === project
    );
  }

  evaluate(project: ProjectDocument, options: ViewportRenderOptions): YLayerPresentationDecision {
    return this.presentation.evaluate(project, options, this.readiness());
  }

  private activate(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    providerGeneration: number,
  ): void {
    this.resources.projection.setDirectPresentation(
      project,
      options,
      providerGeneration,
      (position) => this.resolveBlock(position),
      (block, currentOptions) =>
        this.resources.projection.createVisibleEntry(
          block,
          currentOptions,
          this.scope.provider()?.occlusionClass?.(block) ?? 'unknown',
        ),
    );
  }

  private resolveBlock(position: VoxelCoordinate) {
    return this.resources.blockIndex.get(position);
  }

  private readiness(): YLayerPresentationReadiness {
    const project = this.scope.project();
    const providerGeneration = this.scope.providerGeneration();
    const {
      representations,
      hydration,
      providerRefresh,
      instances,
      surfaces,
      placeholders,
      terrain,
      fluids,
      culling,
      diagnostics,
    } = this.resources;
    const instanceMembers = instances.ownershipIndex.size;
    const placeholderCount = placeholders.indices.size;
    const surfaceRepresentations = surfaces.ownership.size;
    const terrainRepresentations = this.resources.terrainRenderer.logicalBlockCount;
    const fluidRepresentations = fluids.logicalRecordCount;
    const layeredFluids = fluids.layeredPresentationReady;
    const interiorCulledBlocks = culling.size;
    const pendingWork =
      hydration.queuedWork() > 0 ||
      hydration.pendingCount > 0 ||
      hydration.runningGenerationCount(hydration.generation) > 0 ||
      terrain.pendingGroupCount > 0 ||
      this.scope.hasRepresentationPrewarm() ||
      providerRefresh.isPlanning ||
      !!providerRefresh.progress ||
      this.resources.projection.state.activity !== 'idle' ||
      (this.resources.projection.hasDirectPresentation &&
        this.presentation.providerGeneration !== providerGeneration);
    const cached = this.readinessCache;
    if (
      cached &&
      cached.projectId === project?.id &&
      cached.blocks === project?.blocks &&
      cached.providerGeneration === providerGeneration &&
      cached.representationRevision === representations.revision &&
      cached.instanceBatchCount === instances.batches.size &&
      cached.surfaceBatchCount === surfaces.batches.size &&
      cached.placeholderBatchCount === placeholders.batches.size &&
      cached.instanceMembers === instanceMembers &&
      cached.placeholders === placeholderCount &&
      cached.surfaceRepresentations === surfaceRepresentations &&
      cached.terrainRepresentations === terrainRepresentations &&
      cached.fluidRepresentations === fluidRepresentations &&
      cached.layeredFluids === layeredFluids &&
      cached.interiorCulledBlocks === interiorCulledBlocks &&
      cached.pendingWork === pendingWork
    ) {
      diagnostics.record('yLayerPresentationReadinessCacheHits');
      return cached.value;
    }

    let layeredBatches =
      [...instances.batches.values()].every((batch) => batch.layer >= 0) &&
      [...surfaces.batches.values()].every((batch) => batch.layer >= 0) &&
      [...placeholders.batches.values()].every((batch) => batch.layer >= 0);
    let objectRepresentations = 0;
    for (const entry of representations.values()) {
      if (
        entry.instanceBatchKey !== undefined ||
        entry.surfaceFaceMemberships !== undefined ||
        entry.terrainChunkKey !== undefined ||
        entry.fluidChunkKey !== undefined ||
        !entry.object
      )
        continue;
      objectRepresentations += 1;
      if (entry.object.parent?.userData['blockLayeredObjectBucket'] !== true)
        layeredBatches = false;
    }
    const residentBlocks =
      instanceMembers +
      surfaceRepresentations +
      terrainRepresentations +
      fluidRepresentations +
      objectRepresentations +
      placeholderCount;
    const value: YLayerPresentationReadiness = {
      residentBlocks,
      instanceMembers,
      objectRepresentations,
      layeredBatches,
      surfaceRepresentations,
      terrainRepresentations,
      fluidRepresentations,
      layeredFluids,
      placeholders: placeholderCount,
      pendingWork,
      interiorCulledBlocks,
    };
    diagnostics.record('yLayerPresentationReadinessScans');
    this.readinessCache = {
      projectId: project?.id ?? '',
      blocks: project?.blocks ?? [],
      providerGeneration,
      representationRevision: representations.revision,
      instanceBatchCount: instances.batches.size,
      surfaceBatchCount: surfaces.batches.size,
      placeholderBatchCount: placeholders.batches.size,
      instanceMembers,
      placeholders: placeholderCount,
      surfaceRepresentations,
      terrainRepresentations,
      fluidRepresentations,
      layeredFluids,
      interiorCulledBlocks,
      pendingWork,
      value,
    };
    return value;
  }
}

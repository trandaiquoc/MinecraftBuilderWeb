import type { ProjectDocument } from '../../domain/project.types';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { isolateKey, renderFilterKey } from './viewport-render-signatures';
import type { YLayerProjectionCoordinator } from './y-layer-projection-coordinator';
import type { ViewportStructureSyncSnapshot } from './viewport-structure-sync-state';
import { ViewportStructureSyncState } from './viewport-structure-sync-state';

export interface ViewportStructureUpdatePlan {
  readonly projectChanged: boolean;
  readonly previousSyncKey: string;
  readonly nextSyncKey: string;
  readonly structureInputsUnchanged: boolean;
  readonly groupPresentationOnly: boolean;
  readonly presentationInputsUnchanged: boolean;
  readonly isolatePresentationChanged: boolean;
  readonly referenceOpacityOnly: boolean;
  readonly projectionDelta: ReturnType<YLayerProjectionCoordinator['plan']>;
  readonly projectionTargetInFlight: boolean;
  readonly projectIdentityOnly: boolean;
  readonly layerProjectionOnly: boolean;
  readonly incrementalMutation: boolean;
  readonly metadataMutation: boolean;
  readonly full: boolean;
  readonly bootstrapInitialYProjection: boolean;
  readonly structureState: ViewportStructureSyncSnapshot;
}

export interface ViewportStructureUpdateInput {
  readonly project?: ProjectDocument;
  readonly previousProject?: ProjectDocument;
  readonly previousOptions: ViewportRenderOptions;
  readonly options: ViewportRenderOptions;
  readonly mutationHint?: ProjectMutationHint;
  readonly layerIndex?: LayerBlockIndex;
  readonly indexedProject?: ProjectDocument;
  readonly suspended: boolean;
  readonly backgroundPreparation: boolean;
}

/** Owns the identity and mutation classification policy for viewport structure updates. */
export class ViewportStructureUpdatePlanner {
  constructor(
    readonly syncState: ViewportStructureSyncState,
    private readonly projection: YLayerProjectionCoordinator,
    private readonly initialProjectionThreshold: number,
  ) {}

  plan(input: ViewportStructureUpdateInput): ViewportStructureUpdatePlan {
    const { project, previousProject, previousOptions, options, mutationHint } = input;
    const structureState = this.syncState.snapshot();
    const projectChanged = project?.id !== previousProject?.id;
    const previousSyncKey = structureState.syncKey;
    const nextSyncKey = this.syncState.keyFor(project, renderFilterKey(options));
    const structureInputsUnchanged =
      !!project &&
      !!previousProject &&
      project.id === previousProject.id &&
      project.blocks === previousProject.blocks &&
      project.groups === previousProject.groups &&
      project.decorations === previousProject.decorations &&
      project.metadata === previousProject.metadata &&
      project.structureMode === previousProject.structureMode &&
      project.size.x === previousProject.size.x &&
      project.size.y === previousProject.size.y &&
      project.size.z === previousProject.size.z;
    const groupPresentationOnly =
      !!project &&
      !!previousProject &&
      !mutationHint &&
      project.id === previousProject.id &&
      project.blocks === previousProject.blocks &&
      project.decorations === previousProject.decorations &&
      project.metadata === previousProject.metadata &&
      project.structureMode === previousProject.structureMode &&
      project.size.x === previousProject.size.x &&
      project.size.y === previousProject.size.y &&
      project.size.z === previousProject.size.z &&
      project.groups !== previousProject.groups;
    const presentationInputsUnchanged = structureInputsUnchanged || groupPresentationOnly;
    const referenceOpacityOnly =
      !!project &&
      !!previousProject &&
      project.blocks === previousProject.blocks &&
      project.id === previousProject.id &&
      project.size.x === previousProject.size.x &&
      project.size.y === previousProject.size.y &&
      project.size.z === previousProject.size.z &&
      renderFilterKey(previousOptions) === renderFilterKey(options) &&
      previousOptions.referenceOpacity !== options.referenceOpacity;
    const projectionDelta = this.projection.plan(
      previousProject,
      previousOptions,
      options,
      input.layerIndex,
    );
    const projectionTargetInFlight =
      !!project && this.projection.isProjectionTargetInFlight(project, options);
    const projectIdentityOnly =
      presentationInputsUnchanged &&
      project !== previousProject &&
      !mutationHint &&
      nextSyncKey === previousSyncKey &&
      !projectionDelta.changed &&
      previousOptions.referenceOpacity === options.referenceOpacity;
    const layerProjectionOnly =
      !!project &&
      !!previousProject &&
      project.blocks === previousProject.blocks &&
      project.groups === previousProject.groups &&
      project.id === previousProject.id &&
      project.size.x === previousProject.size.x &&
      project.size.y === previousProject.size.y &&
      project.size.z === previousProject.size.z &&
      !mutationHint &&
      (projectionDelta.changed || projectionTargetInFlight) &&
      !!previousOptions.visibility &&
      !!options.visibility &&
      options.layerY !== undefined &&
      previousOptions.layerY !== undefined &&
      previousOptions.exposedFaceRendering === options.exposedFaceRendering;
    const incrementalMutation =
      !!project &&
      !!previousProject &&
      project !== previousProject &&
      !!mutationHint &&
      nextSyncKey === previousSyncKey &&
      renderFilterKey(previousOptions) === renderFilterKey(options) &&
      this.projection.visibleProject === previousProject &&
      input.indexedProject === previousProject;
    const metadataMutation = mutationHint?.kind === 'metadata-delta';
    const bootstrapInitialYProjection =
      !!project &&
      !structureState.project &&
      !input.suspended &&
      !input.backgroundPreparation &&
      project.blocks.length >= this.initialProjectionThreshold &&
      options.layerY !== undefined &&
      !!options.visibility &&
      options.visibility !== 'current-only' &&
      !!(options.layerIndex ?? input.layerIndex);

    return {
      projectChanged,
      previousSyncKey,
      nextSyncKey,
      structureInputsUnchanged,
      groupPresentationOnly,
      presentationInputsUnchanged,
      isolatePresentationChanged: isolateKey(previousOptions) !== isolateKey(options),
      referenceOpacityOnly,
      projectionDelta,
      projectionTargetInFlight,
      projectIdentityOnly,
      layerProjectionOnly,
      incrementalMutation,
      metadataMutation,
      full: nextSyncKey !== structureState.syncKey,
      bootstrapInitialYProjection,
      structureState,
    };
  }
}

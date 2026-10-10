import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { isBlockVisibleForViewport } from '../../editor/viewport/visible-blocks';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import { blockMutationHint } from '../../editor/mutations/project-mutation-hint';
import { groupIdsOf } from '../../editor/groups/group-membership';
import { planLocalRenderDelta } from '../mutations/local-render-delta';
import { applyLocalFluidDelta } from '../mutations/local-fluid-render-delta';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import type { TerrainBlockChange, TerrainSurfaceRecord } from '../terrain/chunk-surface-renderer';
import { isCompiledTerrainEntry, isTerrainRenderableEntry } from '../terrain/terrain-classifier';
import type { TerrainHydrationCandidate } from '../terrain/viewport-terrain-workflow-owner';
import type { HydrationLane } from '../scheduling/hydration-progress-tracker';
import type { RenderedBlockEntry } from './viewport-block-representation-store';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { canonicalRenderOptions } from './viewport-render-signatures';
import type {
  ViewportStructureReconciliationOwner,
  ViewportStructureReconciliationPorts,
} from './viewport-structure-reconciliation-owner';

type PlacedBlock = ProjectDocument['blocks'][number];
type RenderInputs = Pick<
  ViewportStructureReconciliationOwner,
  'visibleEntry' | 'terrainCandidate' | 'worldContext'
>;

export type ViewportLocalMutationPorts = Pick<
  ViewportStructureReconciliationPorts,
  | 'blockIndex'
  | 'representations'
  | 'hydration'
  | 'projection'
  | 'syncState'
  | 'culling'
  | 'fluids'
  | 'terrain'
  | 'terrainWorkflow'
  | 'representationCommit'
  | 'placeholders'
  | 'hydrationLifecycle'
  | 'diagnostics'
  | 'provider'
  | 'layerIndex'
  | 'missingBlocksTerminal'
  | 'requestReusableVisualKey'
  | 'removeRepresentation'
  | 'recordTrace'
  | 'recordInstanceOwnership'
  | 'scheduleRender'
> & {
  readonly syncSpecialVisualDescriptors: () => void;
  readonly recordMissingAccountingInvariant: (checkpoint: string) => void;
};

/** Applies bounded canonical block mutations to already-owned viewport representations. */
export class ViewportLocalMutationOwner {
  constructor(
    private readonly ports: ViewportLocalMutationPorts,
    private readonly renderInputs: RenderInputs,
  ) {}

  applyMutation(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    hint: ProjectMutationHint,
  ): void {
    const { diagnostics, blockIndex, hydration, projection, syncState, culling } = this.ports;
    const lane: HydrationLane = hint.origin === 'content-resolution' ? 'content' : 'local';
    hydration.setLane(lane);
    hydration.setProgressLane(lane);
    const tracePrefix = lane === 'content' ? 'content-resolution' : 'local-edit';
    this.ports.recordTrace(`${tracePrefix}-start`, {
      source: hint.source ?? 'unknown',
      changes: hint.changes.length,
    });
    this.ports.recordTrace('incremental-reconcile', {
      changedVoxelCount: hint.changes.length,
      source: hint.source ?? 'unknown',
    });
    diagnostics.record('hintedProjectMutations');
    diagnostics.record('incrementalBlockReconciles');
    hydration.compactWork();
    const delta = planLocalRenderDelta(hint);
    const changedKeys = new Set(delta.mutatedKeys);
    const affectedPositions = new Map(delta.affectedPositions);
    const hintedKeys = new Set(delta.hintedKeys);
    if (lane === 'content')
      this.ports.recordTrace('content-resolution-delta', {
        changed: hint.changes.length,
        affected: affectedPositions.size,
      });

    for (const change of hint.changes) {
      const beforeKey = change.before
        ? coordinateKey(change.before.position)
        : coordinateKey(change.position);
      const afterKey = change.after
        ? coordinateKey(change.after.position)
        : coordinateKey(change.position);
      if (change.before && (!change.after || beforeKey !== afterKey))
        hydration.removeBlockKey(beforeKey);
      if (change.after) {
        if (!hydration.hasBlockKey(afterKey)) hydration.addBlockKey(afterKey);
        else hydration.invalidateBlock(afterKey);
        hydration.syncMissingBlockState(
          afterKey,
          change.after.kind === 'missing'
            ? this.ports.missingBlocksTerminal()
              ? 'permanent'
              : 'provisional'
            : 'resolved',
        );
      }
      blockIndex.replace(change.before?.position, change.after);
    }
    hydration.refreshProgress();
    if (lane === 'content') this.ports.recordMissingAccountingInvariant('content-resolution-delta');
    this.ports.syncSpecialVisualDescriptors();
    diagnostics.record('incrementalChangedVoxels', affectedPositions.size);
    blockIndex.adoptProject(project);
    projection.associateVisibleProjection(project, options);
    for (const [key, position] of affectedPositions) {
      const block = blockIndex.get(position);
      if (
        block &&
        isBlockVisibleForViewport(block, project, {
          ...canonicalRenderOptions(options),
          layerIndex: options.layerIndex ?? this.ports.layerIndex(),
        })
      ) {
        projection.cacheVisibleEntry(key, this.renderInputs.visibleEntry(block, options));
      } else projection.removeVisibleEntry(key);
      if (block) syncState.rememberVisiblePosition(block.position);
      else syncState.forgetVisiblePosition(key);
    }
    culling.updateKeys(
      affectedPositions.keys(),
      (key) => projection.visibleEntry(key),
      projection.visibleEntriesByKey,
    );
    hydration.removePendingKeys(changedKeys);
    for (const key of changedKeys) {
      hydration.clearPendingSignature(key);
      this.ports.terrainWorkflow.clearPlaceholderSignature(key);
    }

    const world = this.renderInputs.worldContext();
    this.ports.recordTrace('fluid-delta-start', {
      changed: hint.changes.length,
      affected: affectedPositions.size,
    });
    const fluidKeys = applyLocalFluidDelta(hint, [...affectedPositions.values()], {
      resolver: this.ports.provider()?.fluidRenderResolver,
      hasTexture: !!this.ports.provider()?.fluidTexture,
      getBlock: (position) => blockIndex.get(position),
      getVisibleEntry: (key) => projection.visibleEntry(key),
      getRenderedEntry: (key) => this.ports.representations.get(key),
      removeRenderedEntry: (key) => this.ports.representationCommit.detachFluidClaim(key),
      removeBlockEntry: (key, entry) =>
        this.ports.removeRepresentation(key, entry as RenderedBlockEntry),
      setFluidEntry: (key, block, entry) =>
        this.ports.representationCommit.publish({
          key,
          block,
          signature: entry.signature,
          role: entry.role,
          revision: 0,
          provider: this.ports.provider(),
          fluidChunkKey: fluidChunkKey(block.position),
        }),
      fluidCoordinator: this.ports.fluids,
      worldContext: world,
      hydrationGeneration: hydration.generation,
      layerY: options.layerY,
      onComplete: () => {
        this.ports.recordTrace('fluid-delta-end', { changed: hint.changes.length });
        this.ports.scheduleRender();
      },
    });

    const terrainChanges: TerrainBlockChange[] = [];
    const terrainCandidates: TerrainHydrationCandidate[] = [];
    const preparedRecords = new Map<string, TerrainSurfaceRecord>();
    const preparedCandidates = new Map<string, TerrainHydrationCandidate>();
    const renderableKeys = new Set<string>();
    for (const key of changedKeys) {
      const next = projection.visibleEntry(key);
      const renderable =
        !!next &&
        ((options.exposedFaceRendering === true && isTerrainRenderableEntry(next)) ||
          !culling.has(key));
      const current = this.ports.representations.get(key);
      if (!renderable) {
        if (current) {
          this.ports.removeRepresentation(key, current);
          diagnostics.record('blockRemovals');
        }
        if (this.ports.placeholders.indices.has(key)) this.ports.placeholders.remove(key);
        terrainChanges.push({
          key,
          position: affectedPositions.get(key) ?? current?.block.position ?? { x: 0, y: 0, z: 0 },
          afterOpaque: false,
        });
        continue;
      }
      renderableKeys.add(key);
      if (fluidKeys.has(key) && !hintedKeys.has(key)) continue;
      const needsUpdate =
        hintedKeys.has(key) ||
        !current ||
        current.signature !== next.signature ||
        current.role !== next.role ||
        current.terrainChunkKey !== undefined;
      if (fluidKeys.has(key)) {
        if (current) {
          this.ports.removeRepresentation(key, current);
          diagnostics.record('blockUpdates');
        }
        if (this.ports.placeholders.indices.has(key)) this.ports.placeholders.remove(key);
        terrainChanges.push({ key, position: next.block.position, afterOpaque: false });
        continue;
      }
      const candidate = this.renderInputs.terrainCandidate(
        key,
        next,
        world,
        options,
        this.ports.provider(),
      );
      const cachedTemplates = candidate
        ? this.ports.terrain.templatesFor(candidate.reusableKey)
        : undefined;
      if (needsUpdate && current) {
        this.ports.removeRepresentation(key, current);
        diagnostics.record('blockUpdates');
      }
      if (!needsUpdate && current) continue;
      this.ports.placeholders.ensure(key, next.block.position, next.role, groupIdsOf(next.block));
      hydration.setPendingSignature(key, next.signature);
      diagnostics.record('blockVisualCreations');
      const provider = this.ports.provider();
      if (!provider) {
        hydration.clearPendingSignature(key);
        this.ports.terrainWorkflow.setPlaceholderSignature(key, next.signature);
        terrainChanges.push({ key, position: next.block.position, afterOpaque: false });
        continue;
      }
      if (candidate && cachedTemplates) {
        const record: TerrainSurfaceRecord = {
          key,
          block: next.block,
          templates: cachedTemplates,
          role: next.role === 'reference' ? 'reference' : 'normal',
        };
        this.ports.representationCommit.publish({
          key,
          block: next.block,
          signature: next.signature,
          role: next.role,
          revision: 0,
          provider,
          reusableVisualKey: candidate.reusableKey,
        });
        preparedRecords.set(key, record);
        preparedCandidates.set(key, candidate);
        terrainChanges.push({
          key,
          position: next.block.position,
          after: record,
          afterOpaque: next.role === 'normal',
        });
      } else if (candidate) {
        this.ports.representationCommit.publish({
          key,
          block: next.block,
          signature: next.signature,
          role: next.role,
          revision: 0,
        });
        terrainChanges.push({ key, position: next.block.position, afterOpaque: false });
        terrainCandidates.push(candidate);
      } else {
        terrainChanges.push({ key, position: next.block.position, afterOpaque: false });
        hydration.enqueueRegular({
          token: hydration.generation,
          projectionRevision: projection.revisionForKey(key),
          key,
          block: next.block,
          signature: next.signature,
          role: next.role,
          worldContext: world,
          options,
          allowInstancing: true,
          surfaceFastPathEligible:
            options.exposedFaceRendering === true && isCompiledTerrainEntry(next),
          surfaceVisibleEntries: projection.visibleEntriesByKey,
        });
      }
    }

    for (const [key, position] of affectedPositions) {
      if (fluidKeys.has(key)) continue;
      if (renderableKeys.has(key) && terrainChanges.some((change) => change.key === key)) continue;
      const entry = projection.visibleEntry(key);
      const reusableKey =
        entry && this.ports.provider()
          ? this.ports.requestReusableVisualKey(this.ports.provider()!, entry.block, world)
          : undefined;
      const terrainTemplates = reusableKey
        ? this.ports.terrain.templatesFor(reusableKey)
        : undefined;
      terrainChanges.push({
        key,
        position,
        afterOpaque: !!entry && isCompiledTerrainEntry(entry) && !!terrainTemplates,
      });
    }
    const result = this.ports.terrain.applyBlockChanges(terrainChanges, true, [
      ...delta.hydrationInvalidatedKeys,
    ]);
    if (!result.pending) this.ports.terrainWorkflow.commit(preparedRecords.values(), result);
    const representedKeys = new Set(result.representedKeys);
    if (!result.pending) {
      this.ports.terrainWorkflow.enqueueFailed(
        [...preparedCandidates.entries()]
          .filter(([key]) => !representedKeys.has(key))
          .map(([, candidate]) => candidate),
        lane,
      );
    }
    if (terrainCandidates.length)
      this.ports.terrainWorkflow.scheduleWorkflowBatch(
        terrainCandidates,
        [],
        [...affectedPositions.values()],
        false,
        true,
        lane,
      );
    hydration.prioritizeRegularJobs((job) => job.role);
    this.ports.hydrationLifecycle.beginProgress(lane);
    if (hydration.queuedWork()) this.ports.hydrationLifecycle.schedule();
    this.ports.recordInstanceOwnership('after-reconcile', undefined, 'reconcile');
    this.ports.recordTrace(`${tracePrefix}-end`, {
      mutatedKeys: changedKeys.size,
      dependencyKeys: delta.dependencyKeys.size,
      terrainChunks: result.rebuiltChunks.length,
      terrainPending: result.pending ?? false,
    });
  }

  applyMetadataMutation(
    previousProject: ProjectDocument,
    previousOptions: ViewportRenderOptions,
    project: ProjectDocument,
    options: ViewportRenderOptions,
    hint: Extract<ProjectMutationHint, { readonly kind: 'metadata-delta' }>,
  ): void {
    const visibilityChanges: Array<{
      readonly position: VoxelCoordinate;
      readonly before?: PlacedBlock;
      readonly after?: PlacedBlock;
    }> = [];
    for (const change of hint.changes) {
      const before = change.before;
      const after = change.after;
      if (!before || !after) continue;
      const previousVisible = isBlockVisibleForViewport(before, previousProject, {
        ...canonicalRenderOptions(previousOptions),
        layerIndex: previousOptions.layerIndex ?? this.ports.layerIndex(),
      });
      const nextVisible = isBlockVisibleForViewport(after, project, {
        ...canonicalRenderOptions(options),
        layerIndex: options.layerIndex ?? this.ports.layerIndex(),
      });
      if (previousVisible !== nextVisible) {
        visibilityChanges.push({ position: after.position, before, after });
        continue;
      }
      this.ports.blockIndex.replace(before.position, after);
      if (nextVisible)
        this.ports.projection.cacheVisibleEntry(
          coordinateKey(after.position),
          this.renderInputs.visibleEntry(after, options),
        );
      const rendered = this.ports.representations.get(coordinateKey(after.position));
      if (rendered) this.ports.representationCommit.updateBlock(rendered.key, after);
    }
    if (visibilityChanges.length) {
      this.applyMutation(
        project,
        options,
        blockMutationHint(visibilityChanges, hint.source ?? 'group-visibility'),
      );
    } else {
      this.ports.blockIndex.adoptProject(project);
      this.ports.projection.associateVisibleProjection(project, options);
    }
    this.ports.recordTrace('group-metadata-delta', {
      source: hint.source ?? 'unknown',
      changedBlocks: hint.changes.length,
      visibilityChangedBlocks: visibilityChanges.length,
    });
    this.ports.scheduleRender();
  }
}

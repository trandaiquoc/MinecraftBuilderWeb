import { coordinateKey } from '../../domain/coordinates';
import { adoptCommittedHydrationKeys } from './hydration-generation-adoption';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { ViewportBlockHydrationPipeline } from './viewport-block-hydration-pipeline';
import type { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { ChunkSurfaceRenderer } from '../terrain/chunk-surface-renderer';
import type { ViewportTerrainWorkflowOwner } from '../terrain/viewport-terrain-workflow-owner';
import type { ViewportInteriorCullingOwner } from '../visibility/viewport-interior-culling-owner';
import type {
  RenderedBlockEntry,
  ViewportBlockRepresentationStore,
} from '../engine/viewport-block-representation-store';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from '../engine/y-layer-projection-coordinator';

export interface ViewportHydrationSettlementOwners {
  readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly projection: YLayerProjectionCoordinator;
  readonly culling: ViewportInteriorCullingOwner;
  readonly terrainWorkflow: ViewportTerrainWorkflowOwner;
  readonly representations: ViewportBlockRepresentationStore;
  readonly terrain: ChunkSurfaceRenderer;
  readonly surfaces: SurfaceFaceBatchRenderer;
  readonly instances: StaticModelBatchRenderer;
  readonly fluids: FluidRenderCoordinator;
  readonly placeholders: PlaceholderBatchRenderer;
}

/** Owns the proof that a hydration key reached a physical terminal representation. */
export class ViewportHydrationSettlementOwner {
  constructor(private readonly owners: ViewportHydrationSettlementOwners) {}

  isProjectionKeySettled(key: string): boolean {
    const { projection, culling, terrainWorkflow, hydration, representations } = this.owners;
    if (!projection.hasVisibleEntry(key)) return true;
    if (culling.has(key) || terrainWorkflow.hasPlaceholder(key)) return true;
    if (hydration.hasPendingSignature(key) || hydration.hasRunningOwnership(key)) return false;
    const entry = representations.get(key);
    return !!entry && this.hasCommittedBlockOwnership(key, entry);
  }

  adoptCommittedBlockOwnership(entries: readonly VisibleBlockProjectionEntry[]): void {
    const { culling, representations, hydration, terrainWorkflow, placeholders } = this.owners;
    const candidates = entries.map((entry) => {
      const key = coordinateKey(entry.block.position);
      const rendered = representations.get(key);
      const committed =
        culling.has(key) ||
        (!!rendered &&
          rendered.signature === entry.signature &&
          rendered.role === entry.role &&
          !hydration.hasPendingSignature(key) &&
          !terrainWorkflow.hasPlaceholder(key) &&
          !placeholders.indices.has(key) &&
          this.hasCommittedBlockOwnership(key, rendered));
      return {
        key,
        signature: entry.signature,
        committedSignature: committed ? entry.signature : undefined,
        visible: true,
        committed,
      };
    });
    const adopted = adoptCommittedHydrationKeys(candidates);
    if (adopted.length) hydration.adoptBlockKeys(hydration.generation, adopted);
  }

  hasCommittedBlockOwnership(key: string, entry: RenderedBlockEntry): boolean {
    const { terrain, surfaces, instances, fluids } = this.owners;
    const fallbackCommitted =
      !!entry.fallback?.parent && entry.fallback.userData['renderMode'] !== undefined;
    if (entry.terrainChunkKey !== undefined || terrain.has(key))
      return terrain.isRepresented(key) || fallbackCommitted;
    const surfaceMemberships = entry.surfaceFaceMemberships ?? surfaces.ownership.get(key);
    if (entry.surfaceFaceMemberships !== undefined || surfaceMemberships !== undefined) {
      return (
        fallbackCommitted ||
        (!!surfaceMemberships &&
          surfaceMemberships.every(
            (membership) =>
              surfaces.batches.get(membership.batchKey)?.keys[membership.index] === key,
          ))
      );
    }
    const instanceMembership = instances.ownershipIndex.get(key);
    if (
      entry.instanceBatchKey !== undefined ||
      entry.instanceIndex !== undefined ||
      instanceMembership
    ) {
      return (
        fallbackCommitted ||
        (!!instanceMembership &&
          instances.batches.get(instanceMembership.batchKey)?.keys[instanceMembership.index] ===
            key)
      );
    }
    if (entry.fluidChunkKey !== undefined || fluids.isClaimed(key))
      return fallbackCommitted || (fluids.isTerminal(key) && fluids.hasVoxel(key));
    if (entry.object && entry.object !== entry.fallback) return entry.object.parent !== null;
    return fallbackCommitted;
  }
}

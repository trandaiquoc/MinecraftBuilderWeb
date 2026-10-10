import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { groupIdsOf } from '../../editor/groups/group-membership';
import { visibleLayerSet, type LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { renderFilterKey } from './viewport-render-signatures';
import type { OcclusionClass } from '../visibility/interior-occlusion';

export type VisibleBlockProjectionEntry = {
  readonly block: PlacedBlock;
  readonly role: 'normal' | 'reference' | 'missing';
  readonly signature: string;
  readonly occlusionClass: OcclusionClass;
};

export type YLayerPresentationFallbackReason =
  | 'not-y-layer'
  | 'exposed-face-rendering'
  | 'hidden-groups'
  | 'isolated-group'
  | 'selection-volume'
  | 'incomplete-residency'
  | 'non-layered-batch'
  | 'non-instance-representation'
  | 'pending-render-work'
  | 'interior-culling';

export interface YLayerPresentationReadiness {
  readonly residentBlocks: number;
  readonly instanceMembers: number;
  readonly objectRepresentations: number;
  readonly layeredBatches: boolean;
  readonly surfaceRepresentations: number;
  readonly terrainRepresentations: number;
  readonly fluidRepresentations: number;
  readonly layeredFluids: boolean;
  readonly placeholders: number;
  readonly pendingWork: boolean;
  readonly interiorCulledBlocks: number;
}

export interface YLayerPresentationDecision {
  readonly supported: boolean;
  readonly reason?: YLayerPresentationFallbackReason;
}

const EMPTY_ENTRIES: ReadonlyMap<string, VisibleBlockProjectionEntry> = new Map();
const MAX_VISIBLE_ENTRY_CACHE = 512;

/** Owns the visibility scope for resident layer presentations; it never owns GPU resources. */
export class YLayerPresentationOwner {
  private active?: {
    project: ProjectDocument;
    options: ViewportRenderOptions;
    providerGeneration: number;
    visibleLayers: ReadonlySet<number>;
    hiddenGroupIds: ReadonlySet<string>;
    isolatedGroupId?: string;
    resolveBlock: (position: VoxelCoordinate) => PlacedBlock | undefined;
    createEntry: (block: PlacedBlock, options: ViewportRenderOptions) => VisibleBlockProjectionEntry;
  };
  private readonly entryCache = new Map<string, VisibleBlockProjectionEntry>();

  evaluate(project: ProjectDocument, options: ViewportRenderOptions, readiness: YLayerPresentationReadiness): YLayerPresentationDecision {
    if (options.layerY === undefined || options.visibility === undefined) return unsupported('not-y-layer');
    if (options.exposedFaceRendering) return unsupported('exposed-face-rendering');
    if (options.isolatedGroupPositions?.length && !options.isolatedGroupId) return unsupported('isolated-group');
    if (readiness.interiorCulledBlocks) return unsupported('interior-culling');
    if (readiness.pendingWork) return unsupported('pending-render-work');
    if (readiness.residentBlocks !== project.blocks.length) return unsupported('incomplete-residency');
    if (readiness.instanceMembers + readiness.surfaceRepresentations + readiness.objectRepresentations + readiness.placeholders + readiness.fluidRepresentations !== project.blocks.length
      || readiness.terrainRepresentations
      || readiness.fluidRepresentations && !readiness.layeredFluids) return unsupported('non-layered-batch');
    if (!readiness.layeredBatches) return unsupported('non-layered-batch');
    if (!options.layerIndex?.blockCountAtY) return unsupported('incomplete-residency');
    return { supported: true };
  }

  activate(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    providerGeneration: number,
    resolveBlock: (position: VoxelCoordinate) => PlacedBlock | undefined,
    createEntry: (block: PlacedBlock, options: ViewportRenderOptions) => VisibleBlockProjectionEntry,
  ): void {
    this.active = {
      project,
      options,
      providerGeneration,
      visibleLayers: visibleLayerSet(options.layerY!, project.blocks, options.visibility!, options.layerIndex),
      hiddenGroupIds: new Set(project.groups.filter((group) => group.visible === false).map((group) => group.id)),
      isolatedGroupId: options.isolatedGroupId,
      resolveBlock,
      createEntry,
    };
    this.entryCache.clear();
  }

  update(project: ProjectDocument, options: ViewportRenderOptions, providerGeneration: number): boolean {
    if (!this.active || project.id !== this.active.project.id
      || providerGeneration !== this.active.providerGeneration) return false;
    const canonicalBlocksChanged = project.blocks !== this.active.project.blocks;
    const projectionChanged = renderFilterKey(options) !== renderFilterKey(this.active.options);
    this.active = {
      ...this.active,
      project,
      options,
      visibleLayers: projectionChanged
        ? visibleLayerSet(options.layerY!, project.blocks, options.visibility!, options.layerIndex)
        : this.active.visibleLayers,
      hiddenGroupIds: new Set(project.groups.filter((group) => group.visible === false).map((group) => group.id)),
      isolatedGroupId: options.isolatedGroupId,
    };
    if (projectionChanged || canonicalBlocksChanged) this.entryCache.clear();
    return true;
  }

  get isActive(): boolean { return this.active !== undefined; }
  get providerGeneration(): number | undefined { return this.active?.providerGeneration; }
  get project(): ProjectDocument | undefined { return this.active?.project; }
  get options(): ViewportRenderOptions | undefined { return this.active?.options; }
  get materializedEntries(): readonly VisibleBlockProjectionEntry[] { return []; }
  get materializedMap(): ReadonlyMap<string, VisibleBlockProjectionEntry> { return EMPTY_ENTRIES; }

  matches(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    return !!this.active && this.active.project === project && renderFilterKey(this.active.options) === renderFilterKey(options);
  }

  visibleEntry(key: string): VisibleBlockProjectionEntry | undefined {
    const active = this.active;
    if (!active) return undefined;
    const cached = this.entryCache.get(key);
    const position = parseCoordinateKey(key);
    if (!position) return undefined;
    const block = active.resolveBlock(position);
    const groups = block ? groupIdsOf(block) : [];
    if (!block || !active.visibleLayers.has(block.position.y)
      || groups.some((id) => active.hiddenGroupIds.has(id))
      || active.isolatedGroupId !== undefined && !groups.includes(active.isolatedGroupId)) {
      this.entryCache.delete(key);
      return undefined;
    }
    const role = block.kind === 'missing' ? 'missing' : block.position.y === active.options.layerY ? 'normal' : 'reference';
    if (cached?.block === block && cached.role === role) return cached;
    const entry = active.createEntry(block, active.options);
    if (this.entryCache.size >= MAX_VISIBLE_ENTRY_CACHE) this.entryCache.delete(this.entryCache.keys().next().value!);
    this.entryCache.set(key, entry);
    return entry;
  }

  visibleBlockCount(): number | undefined {
    const active = this.active;
    if (!active) return undefined;
    const options = active.options;
    const index = options?.layerIndex;
    if (options.layerY === undefined || !options.visibility || !index?.blockCountAtY) return undefined;
    const hasGroupFilter = active.hiddenGroupIds.size > 0 || active.isolatedGroupId !== undefined;
    if (!hasGroupFilter && options.visibility === 'whole-structure') return active.project.blocks.length;
    if (hasGroupFilter && !index.blockCountAtYForPresentation) return undefined;
    const layers = visibleLayerSet(options.layerY, [], options.visibility, index);
    let count = 0;
    for (const layer of layers) {
      count += hasGroupFilter
        ? index.blockCountAtYForPresentation!(layer, active.hiddenGroupIds, active.isolatedGroupId)
        : index.blockCountAtY(layer);
    }
    return count;
  }

  clear(): void {
    this.active = undefined;
    this.entryCache.clear();
  }
}

function parseCoordinateKey(key: string): VoxelCoordinate | undefined {
  const [x, y, z, ...extra] = key.split(',').map(Number);
  return extra.length || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) ? undefined : { x, y, z };
}

function unsupported(reason: YLayerPresentationFallbackReason): YLayerPresentationDecision {
  return { supported: false, reason };
}

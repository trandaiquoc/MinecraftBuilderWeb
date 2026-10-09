import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { ProjectBlockSpatialIndex, type ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';

/** Owns the block lookup index and the project identity it represents. */
export class ViewportBlockIndexOwner implements ReadonlyBlockLookup {
  private index?: ProjectBlockSpatialIndex;
  private project?: ProjectDocument;
  private blocksReference?: readonly PlacedBlock[];
  private specialVisualIds = new Set<string>();
  private observedLookups = 0;
  constructor(private readonly record: (metric: string, delta?: number) => void) {}

  get hasIndex(): boolean { return this.index !== undefined; }
  get currentProject(): ProjectDocument | undefined { return this.project; }
  get lookupCount(): number { return this.index?.lookups ?? 0; }

  get(position: VoxelCoordinate): PlacedBlock | undefined { return this.index?.get(position); }
  has(position: VoxelCoordinate): boolean { return this.index?.has(position) ?? false; }

  ensure(project: ProjectDocument | undefined, force = false, preserveForIncrementalTransition = false): void {
    if (!project) {
      this.clear();
      return;
    }
    if (preserveForIncrementalTransition && !force && this.index) {
      this.adoptProject(project);
      return;
    }
    if (!force && this.project === project && this.blocksReference === project.blocks && this.index) return;
    this.index = new ProjectBlockSpatialIndex(project.blocks);
    this.project = project;
    this.blocksReference = project.blocks;
    this.observedLookups = 0;
    this.specialVisualIds = new Set(project.blocks.map((block) => block.id));
    this.record('spatialIndexBuilds');
  }

  adoptProject(project: ProjectDocument): void {
    this.project = project;
    this.blocksReference = project.blocks;
  }

  replace(before: VoxelCoordinate | undefined, after: PlacedBlock | undefined): void {
    this.index?.replace(before, after);
    if (after) this.specialVisualIds.add(after.id);
  }

  addSpecialVisualId(id: string): void { this.specialVisualIds.add(id); }

  specialVisualIdsFor(activeId: string | undefined, plannedBlocks: readonly PlacedBlock[]): readonly string[] {
    const ids = new Set([...this.specialVisualIds, ...(activeId ? [activeId] : []), ...plannedBlocks.map((block) => block.id)]);
    return [...ids];
  }

  recordLookupDelta(): void {
    const total = this.lookupCount;
    if (total > this.observedLookups) this.record('spatialIndexLookups', total - this.observedLookups);
    this.observedLookups = total;
  }

  clear(): void {
    this.index = undefined;
    this.project = undefined;
    this.blocksReference = undefined;
    this.specialVisualIds.clear();
    this.observedLookups = 0;
  }
}

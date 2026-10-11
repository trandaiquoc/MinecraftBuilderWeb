import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type {
  ProjectBlockLookupProvider,
  ReadonlyBlockLookup,
} from '../../domain/project-block-spatial-index';
import { ProjectBlockSpatialIndex } from '../../domain/project-block-spatial-index';

/** Binds viewport visual state to the canonical project lookup. */
export class ViewportBlockIndexOwner implements ReadonlyBlockLookup {
  private index?: ReadonlyBlockLookup;
  private localIndex?: ProjectBlockSpatialIndex;
  private project?: ProjectDocument;
  private blocksReference?: readonly PlacedBlock[];
  private specialVisualIds = new Set<string>();
  private lookupGeneration?: number;
  private lookupCountValue = 0;
  private observedLookups = 0;
  private visualRevisionValue = 0;
  constructor(
    private readonly record: (metric: string, delta?: number) => void,
    private readonly sharedLookup?: ProjectBlockLookupProvider,
  ) {}

  get hasIndex(): boolean {
    return this.index !== undefined;
  }
  get currentProject(): ProjectDocument | undefined {
    return this.project;
  }
  get lookupCount(): number {
    return this.lookupCountValue;
  }
  get visualRevision(): number {
    return this.visualRevisionValue;
  }

  get(position: VoxelCoordinate): PlacedBlock | undefined {
    this.lookupCountValue += 1;
    return this.index?.get(position);
  }
  has(position: VoxelCoordinate): boolean {
    this.lookupCountValue += 1;
    return this.index?.has(position) ?? false;
  }

  ensure(
    project: ProjectDocument | undefined,
    force = false,
    preserveForIncrementalTransition = false,
  ): void {
    if (!project) {
      this.clear();
      return;
    }
    if (this.sharedLookup) {
      this.ensureShared(project, force, preserveForIncrementalTransition);
      return;
    }
    if (preserveForIncrementalTransition && !force && this.index) {
      this.adoptProject(project);
      return;
    }
    if (!force && this.project === project && this.blocksReference === project.blocks && this.index)
      return;
    this.localIndex = new ProjectBlockSpatialIndex(project.blocks);
    this.index = this.localIndex;
    this.project = project;
    this.blocksReference = project.blocks;
    this.visualRevisionValue += 1;
    this.lookupCountValue = 0;
    this.observedLookups = 0;
    this.specialVisualIds = new Set(project.blocks.map((block) => block.id));
    this.record('spatialIndexBuilds');
  }

  private ensureShared(
    project: ProjectDocument,
    force: boolean,
    preserveForIncrementalTransition: boolean,
  ): void {
    const lookup = this.sharedLookup!;
    const previousGeneration = this.lookupGeneration;
    const forceSharedRefresh = force && previousGeneration === lookup.currentGeneration;
    const rebuilt = lookup.ensure(project, forceSharedRefresh);
    const sameContent =
      this.project?.id === project.id &&
      this.blocksReference === project.blocks &&
      this.project.size.x === project.size.x &&
      this.project.size.y === project.size.y &&
      this.project.size.z === project.size.z;

    if (preserveForIncrementalTransition && !force && this.index === lookup && !rebuilt) {
      this.adoptProject(project);
      this.lookupGeneration = lookup.currentGeneration;
      return;
    }
    if (!force && this.index === lookup && sameContent && !rebuilt) {
      this.project = project;
      this.lookupGeneration = lookup.currentGeneration;
      return;
    }

    this.index = lookup;
    this.localIndex = undefined;
    this.project = project;
    this.blocksReference = project.blocks;
    this.lookupGeneration = lookup.currentGeneration;
    this.visualRevisionValue += 1;
    this.lookupCountValue = 0;
    this.observedLookups = 0;
    this.specialVisualIds = new Set(project.blocks.map((block) => block.id));
    if (rebuilt) this.record('spatialIndexBuilds');
  }

  adoptProject(project: ProjectDocument): void {
    if (this.project?.id !== project.id || this.blocksReference !== project.blocks)
      this.visualRevisionValue += 1;
    this.project = project;
    this.blocksReference = project.blocks;
  }

  replace(before: VoxelCoordinate | undefined, after: PlacedBlock | undefined): void {
    this.localIndex?.replace(before, after);
    this.visualRevisionValue += 1;
    if (after) this.specialVisualIds.add(after.id);
  }

  addSpecialVisualId(id: string): void {
    this.specialVisualIds.add(id);
  }

  specialVisualIdsFor(
    activeId: string | undefined,
    plannedBlocks: readonly PlacedBlock[],
  ): readonly string[] {
    const ids = new Set([
      ...this.specialVisualIds,
      ...(activeId ? [activeId] : []),
      ...plannedBlocks.map((block) => block.id),
    ]);
    return [...ids];
  }

  recordLookupDelta(): void {
    const total = this.lookupCountValue;
    if (total > this.observedLookups)
      this.record('spatialIndexLookups', total - this.observedLookups);
    this.observedLookups = total;
  }

  clear(): void {
    this.index = undefined;
    this.localIndex = undefined;
    this.project = undefined;
    this.blocksReference = undefined;
    this.lookupGeneration = undefined;
    this.specialVisualIds.clear();
    this.lookupCountValue = 0;
    this.observedLookups = 0;
    this.visualRevisionValue += 1;
  }
}

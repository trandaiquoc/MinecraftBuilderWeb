import { Injectable, signal } from '@angular/core';
import { coordinateKey } from '../../domain/coordinates';
import type { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { ProjectMutationHint } from '../mutations/project-mutation-hint';

export interface ProjectBlockUsageEntry {
  readonly id: string;
  readonly namespace: string;
  readonly count: number;
  readonly resolvedCount: number;
  readonly missingCount: number;
}

/**
 * Derived, process-local block lookup for editor commands.
 *
 * ProjectDocument.blocks remains the persisted/history representation. This
 * index is deliberately replaceable: a project load, import, resize, or an
 * invalid hinted transition rebuilds it from that canonical snapshot.
 */
@Injectable({ providedIn: 'root' })
export class ProjectBlockRuntimeIndex implements ReadonlyBlockLookup {
  private project?: ProjectDocument;
  private blocksReference?: readonly PlacedBlock[];
  private sizeSignature = '';
  private blocksByKey = new Map<string, PlacedBlock>();
  private indicesByKey = new Map<string, number>();
  private blocksByY = new Map<number, Map<string, PlacedBlock>>();
  private blocksById = new Map<string, Map<string, PlacedBlock>>();
  private readonly rebuildReasons = new Map<string, number>();
  private readonly usageRevisionState = signal(0);
  readonly usageRevision = this.usageRevisionState.asReadonly();
  private generation = 0;
  private indicesComplete = true;

  ensure(project: ProjectDocument): void {
    if (this.project === project && this.blocksReference === project.blocks && this.sizeSignature === sizeOf(project.size) && this.blocksByKey.size === project.blocks.length) return;
    if (this.project?.id === project.id && this.blocksReference === project.blocks && this.sizeSignature === sizeOf(project.size) && this.blocksByKey.size === project.blocks.length) {
      this.project = project;
      return;
    }
    this.rebuild(project, this.project ? 'project-transition' : 'initial');
  }

  observeProject(project: ProjectDocument | undefined): void {
    if (!project) {
      this.project = undefined;
      this.blocksReference = undefined;
      this.sizeSignature = '';
      this.blocksByKey.clear();
      this.indicesByKey.clear();
      this.blocksByY.clear();
      this.blocksById.clear();
      this.indicesComplete = true;
      this.generation += 1;
      this.usageRevisionState.update((revision) => revision + 1);
      return;
    }
    this.ensure(project);
  }

  /** Applies a history/editor transition without scanning the new snapshot. */
  adoptTransition(from: ProjectDocument, to: ProjectDocument, hint: ProjectMutationHint | undefined): boolean {
    if (!this.isCompatibleTransition(from, to, hint)) {
      this.rebuild(to, this.reasonForInvalidTransition(from, to, hint));
      return false;
    }

    const changes = hint.changes;
    const touched = new Set<string>();
    for (const change of changes) {
      const beforePosition = change.before?.position ?? change.position;
      const beforeKey = coordinateKey(beforePosition);
      if (touched.has(beforeKey)) {
        this.rebuild(to, 'duplicate-hint-position');
        return false;
      }
      touched.add(beforeKey);
      const current = this.blocksByKey.get(beforeKey);
      if (change.before && current !== change.before) {
        this.rebuild(to, 'hint-before-mismatch');
        return false;
      }
      if (change.before && this.indicesByKey.get(beforeKey) === undefined) {
        this.rebuild(to, 'missing-hint-index');
        return false;
      }
    }

    for (const change of changes) {
      const beforePosition = change.before?.position ?? change.position;
      const beforeKey = coordinateKey(beforePosition);
      const index = this.indicesByKey.get(beforeKey);
      this.blocksByKey.delete(beforeKey);
      this.indicesByKey.delete(beforeKey);
      this.removeFromLayer(beforeKey, change.before?.position ?? change.position);
      if (change.before) this.removeFromUsage(change.before);
      if (change.after && index !== undefined) {
        const afterKey = coordinateKey(change.after.position);
        this.blocksByKey.set(afterKey, change.after);
        this.indicesByKey.set(afterKey, index);
        this.addToLayer(afterKey, change.after);
        this.addToUsage(afterKey, change.after);
      }
    }
    for (const change of changes) {
      if (change.after && !this.blocksByKey.has(coordinateKey(change.after.position))) {
        const afterKey = coordinateKey(change.after.position);
        this.blocksByKey.set(afterKey, change.after);
        this.addToLayer(afterKey, change.after);
        this.addToUsage(afterKey, change.after);
      }
    }
    this.indicesComplete = true;
    let appendIndex = from.blocks.length;
    for (const change of changes) {
      if (!change.before && change.after) {
        if (to.blocks[appendIndex] === change.after) this.indicesByKey.set(coordinateKey(change.after.position), appendIndex);
        else this.indicesComplete = false;
        appendIndex += 1;
      } else if (!change.after || !change.before || coordinateKey(change.before.position) !== coordinateKey(change.after.position)) this.indicesComplete = false;
    }
    this.project = to;
    this.blocksReference = to.blocks;
    this.sizeSignature = sizeOf(to.size);
    this.generation += 1;
    // Group membership/metadata transitions replace block object references,
    // but they do not change block-id usage. Keep the usage revision stable so
    // Block Usage consumers do not rebuild for editor-only metadata changes.
    if (hint.usageChanged !== false) this.usageRevisionState.update((revision) => revision + 1);
    return true;
  }

  get(position: VoxelCoordinate): PlacedBlock | undefined { return this.blocksByKey.get(coordinateKey(position)); }
  has(position: VoxelCoordinate): boolean { return this.blocksByKey.has(coordinateKey(position)); }
  indexOf(position: VoxelCoordinate): number | undefined { return this.indicesComplete ? this.indicesByKey.get(coordinateKey(position)) : undefined; }
  blocksAtY(y: number): readonly PlacedBlock[] { return [...(this.blocksByY.get(y)?.values() ?? [])]; }
  occupiedLayers(): readonly number[] { return [...this.blocksByY.keys()].sort((left, right) => left - right); }
  allBlocks(): readonly PlacedBlock[] { return this.project?.blocks ?? []; }
  usageEntries(): readonly ProjectBlockUsageEntry[] {
    return [...this.blocksById.entries()].map(([id, blocks]) => {
      let resolvedCount = 0;
      let missingCount = 0;
      for (const block of blocks.values()) block.kind === 'missing' ? missingCount += 1 : resolvedCount += 1;
      return { id, namespace: blocks.values().next().value?.namespace ?? namespaceOf(id), count: blocks.size, resolvedCount, missingCount };
    });
  }
  usageForId(id: string): ProjectBlockUsageEntry | undefined {
    const blocks = this.blocksById.get(id);
    if (!blocks?.size) return undefined;
    let resolvedCount = 0;
    let missingCount = 0;
    for (const block of blocks.values()) block.kind === 'missing' ? missingCount += 1 : resolvedCount += 1;
    return { id, namespace: blocks.values().next().value?.namespace ?? namespaceOf(id), count: blocks.size, resolvedCount, missingCount };
  }
  blocksForId(id: string): readonly PlacedBlock[] { return [...(this.blocksById.get(id)?.values() ?? [])]; }
  blockCountForId(id: string): number { return this.blocksById.get(id)?.size ?? 0; }
  uniqueBlockIdCount(): number { return this.blocksById.size; }
  get currentProject(): ProjectDocument | undefined { return this.project; }
  get currentGeneration(): number { return this.generation; }
  get rebuildCount(): number { return [...this.rebuildReasons.values()].reduce((sum, count) => sum + count, 0); }
  rebuildCountFor(reason: string): number { return this.rebuildReasons.get(reason) ?? 0; }

  private isCompatibleTransition(from: ProjectDocument, to: ProjectDocument, hint: ProjectMutationHint | undefined): hint is ProjectMutationHint {
    return this.project === from
      && from.id === to.id
      && sameSize(from.size, to.size)
      && !!hint
      && hint.kind === 'block-delta'
      && (hint.changes.length > 0 || hint.metadataOnly === true)
  }

  private reasonForInvalidTransition(from: ProjectDocument, to: ProjectDocument, hint: ProjectMutationHint | undefined): string {
    if (this.project !== from) return 'stale-index';
    if (from.id !== to.id || !sameSize(from.size, to.size)) return 'project-identity-or-size-change';
    if (!hint || hint.kind !== 'block-delta' || (!hint.changes.length && !hint.metadataOnly)) return 'missing-or-empty-hint';
    return 'invalid-hint';
  }

  private rebuild(project: ProjectDocument, reason: string): void {
    this.blocksByKey = new Map();
    this.indicesByKey = new Map();
    this.blocksByY = new Map();
    this.blocksById = new Map();
    for (const [index, block] of project.blocks.entries()) {
      const key = coordinateKey(block.position);
      this.blocksByKey.set(key, block);
      this.indicesByKey.set(key, index);
      this.addToLayer(key, block);
      this.addToUsage(key, block);
    }
    this.indicesComplete = true;
    this.project = project;
    this.blocksReference = project.blocks;
    this.sizeSignature = sizeOf(project.size);
    this.generation += 1;
    this.rebuildReasons.set(reason, (this.rebuildReasons.get(reason) ?? 0) + 1);
    this.usageRevisionState.update((revision) => revision + 1);
  }

  private addToLayer(key: string, block: PlacedBlock): void {
    const layer = this.blocksByY.get(block.position.y) ?? new Map<string, PlacedBlock>();
    layer.set(key, block);
    this.blocksByY.set(block.position.y, layer);
  }

  private removeFromLayer(key: string, position: VoxelCoordinate): void {
    const layer = this.blocksByY.get(position.y);
    if (!layer) return;
    layer.delete(key);
    if (!layer.size) this.blocksByY.delete(position.y);
  }

  private addToUsage(key: string, block: PlacedBlock): void {
    const blocks = this.blocksById.get(block.id) ?? new Map<string, PlacedBlock>();
    blocks.set(key, block);
    this.blocksById.set(block.id, blocks);
  }

  private removeFromUsage(block: PlacedBlock): void {
    const key = coordinateKey(block.position);
    const blocks = this.blocksById.get(block.id);
    if (!blocks) return;
    blocks.delete(key);
    if (!blocks.size) this.blocksById.delete(block.id);
  }
}

/** Shared fallback for direct unit-test construction outside Angular DI. */
export const defaultProjectBlockRuntimeIndex = new ProjectBlockRuntimeIndex();

function sameSize(left: ProjectSize, right: ProjectSize): boolean { return left.x === right.x && left.y === right.y && left.z === right.z; }
function sizeOf(size: ProjectSize): string { return `${size.x},${size.y},${size.z}`; }
function namespaceOf(id: string): string { return id.includes(':') ? id.slice(0, id.indexOf(':')) : ''; }

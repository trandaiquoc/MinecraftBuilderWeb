import { Injectable } from '@angular/core';
import { coordinateKey } from '../../domain/coordinates';
import type { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { ProjectMutationHint } from '../mutations/project-mutation-hint';

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
  private readonly rebuildReasons = new Map<string, number>();
  private generation = 0;
  private indicesComplete = true;

  ensure(project: ProjectDocument): void {
    if (this.project === project && this.blocksReference === project.blocks && this.sizeSignature === sizeOf(project.size) && this.blocksByKey.size === project.blocks.length) return;
    this.rebuild(project, this.project ? 'project-transition' : 'initial');
  }

  observeProject(project: ProjectDocument | undefined): void {
    if (!project) {
      this.project = undefined;
      this.blocksReference = undefined;
      this.sizeSignature = '';
      this.blocksByKey.clear();
      this.indicesByKey.clear();
      this.indicesComplete = true;
      this.generation += 1;
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
      if (change.after && index !== undefined) {
        const afterKey = coordinateKey(change.after.position);
        this.blocksByKey.set(afterKey, change.after);
        this.indicesByKey.set(afterKey, index);
      }
    }
    for (const change of changes) {
      if (change.after && !this.blocksByKey.has(coordinateKey(change.after.position))) this.blocksByKey.set(coordinateKey(change.after.position), change.after);
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
    return true;
  }

  get(position: VoxelCoordinate): PlacedBlock | undefined { return this.blocksByKey.get(coordinateKey(position)); }
  has(position: VoxelCoordinate): boolean { return this.blocksByKey.has(coordinateKey(position)); }
  indexOf(position: VoxelCoordinate): number | undefined { return this.indicesComplete ? this.indicesByKey.get(coordinateKey(position)) : undefined; }
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
      && hint.changes.length > 0;
  }

  private reasonForInvalidTransition(from: ProjectDocument, to: ProjectDocument, hint: ProjectMutationHint | undefined): string {
    if (this.project !== from) return 'stale-index';
    if (from.id !== to.id || !sameSize(from.size, to.size)) return 'project-identity-or-size-change';
    if (!hint || hint.kind !== 'block-delta' || !hint.changes.length) return 'missing-or-empty-hint';
    return 'invalid-hint';
  }

  private rebuild(project: ProjectDocument, reason: string): void {
    this.blocksByKey = new Map(project.blocks.map((block) => [coordinateKey(block.position), block] as const));
    this.indicesByKey = new Map(project.blocks.map((block, index) => [coordinateKey(block.position), index] as const));
    this.indicesComplete = true;
    this.project = project;
    this.blocksReference = project.blocks;
    this.sizeSignature = sizeOf(project.size);
    this.generation += 1;
    this.rebuildReasons.set(reason, (this.rebuildReasons.get(reason) ?? 0) + 1);
  }
}

/** Shared fallback for direct unit-test construction outside Angular DI. */
export const defaultProjectBlockRuntimeIndex = new ProjectBlockRuntimeIndex();

function sameSize(left: ProjectSize, right: ProjectSize): boolean { return left.x === right.x && left.y === right.y && left.z === right.z; }
function sizeOf(size: ProjectSize): string { return `${size.x},${size.y},${size.z}`; }

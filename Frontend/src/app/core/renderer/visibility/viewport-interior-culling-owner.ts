import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import {
  coordinateNeighbors,
  hasConfirmedOpaqueNeighbors,
  type OcclusionEntry,
} from './interior-occlusion';

export interface InteriorCullingChange {
  readonly position: VoxelCoordinate;
}

/** Owns the bounded dirty-set and committed interior-culling state for a viewport. */
export class ViewportInteriorCullingOwner {
  private readonly culledKeys = new Set<string>();

  constructor(
    private readonly record: (
      metric: 'interiorCullingChecks' | 'interiorBlocksCulled',
      delta?: number,
    ) => void,
  ) {}

  get size(): number {
    return this.culledKeys.size;
  }
  has(key: string): boolean {
    return this.culledKeys.has(key);
  }
  keys(): IterableIterator<string> {
    return this.culledKeys.keys();
  }

  clear(): void {
    for (const _key of this.culledKeys) this.record('interiorBlocksCulled', -1);
    this.culledKeys.clear();
  }

  remove(key: string): boolean {
    const removed = this.culledKeys.delete(key);
    if (removed) this.record('interiorBlocksCulled', -1);
    return removed;
  }

  updateFull(
    visible: readonly OcclusionEntry[],
    full: boolean,
    changed: ReadonlySet<string>,
    previousVisiblePositions: ReadonlyMap<string, VoxelCoordinate>,
  ): void {
    const entries = new Map(
      visible.map((entry) => [coordinateKey(entry.block.position), entry] as const),
    );
    if (full) {
      this.clear();
      for (const entry of visible) this.updateEntry(entry, entries);
      return;
    }
    for (const key of [...this.culledKeys]) if (!entries.has(key)) this.remove(key);
    const dirty = new Set<string>();
    for (const key of changed) {
      dirty.add(key);
      const position = entries.get(key)?.block.position ?? previousVisiblePositions.get(key);
      if (!position) continue;
      for (const neighbor of coordinateNeighbors(position)) dirty.add(coordinateKey(neighbor));
    }
    for (const key of dirty) {
      const entry = entries.get(key);
      if (entry) this.updateEntry(entry, entries);
    }
  }

  updateDelta(
    changes: ReadonlyMap<string, InteriorCullingChange>,
    visibleEntry: (key: string) => OcclusionEntry | undefined,
    visibleEntries: ReadonlyMap<string, OcclusionEntry>,
  ): void {
    const dirty = new Set<string>();
    for (const change of changes.values()) {
      dirty.add(coordinateKey(change.position));
      for (const neighbor of coordinateNeighbors(change.position))
        dirty.add(coordinateKey(neighbor));
    }
    for (const key of dirty) {
      const entry = visibleEntry(key);
      if (!entry) {
        this.remove(key);
        continue;
      }
      this.updateEntry(entry, visibleEntries);
    }
  }

  /** Recomputes exactly the supplied keys for local edits; callers own the dependency set. */
  updateKeys(
    keys: Iterable<string>,
    visibleEntry: (key: string) => OcclusionEntry | undefined,
    visibleEntries: ReadonlyMap<string, OcclusionEntry>,
  ): void {
    for (const key of keys) {
      const entry = visibleEntry(key);
      if (!entry) {
        this.remove(key);
        continue;
      }
      this.updateEntry(entry, visibleEntries);
    }
  }

  private updateEntry(entry: OcclusionEntry, entries: ReadonlyMap<string, OcclusionEntry>): void {
    this.record('interiorCullingChecks');
    this.set(entry.block, hasConfirmedOpaqueNeighbors(entry, entries));
  }

  private set(block: PlacedBlock, culled: boolean): void {
    const key = coordinateKey(block.position);
    const previous = this.culledKeys.has(key);
    if (culled === previous) return;
    if (culled) {
      this.culledKeys.add(key);
      this.record('interiorBlocksCulled');
    } else {
      this.culledKeys.delete(key);
      this.record('interiorBlocksCulled', -1);
    }
  }
}

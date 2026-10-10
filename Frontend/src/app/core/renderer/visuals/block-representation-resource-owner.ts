import * as THREE from 'three';
import type { PlaceholderRole } from '../batching/placeholder-batch-renderer';
import type { RenderedBlockEntry, ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import { disposeObject } from '../presentation/renderer-resource-disposal';

export interface BlockRepresentationResourceOwnerPorts {
  readonly store: ViewportBlockRepresentationStore;
  readonly blocksGroup: THREE.Group;
  readonly objectPresentation?: {
    readonly parentFor: (block: RenderedBlockEntry['block']) => THREE.Group;
    readonly release: (object: THREE.Object3D | undefined) => void;
  };
  readonly terrain: { readonly has: (key: string) => boolean; readonly remove: (key: string) => void; readonly clear: () => void; readonly dispose: () => void };
  readonly surface: { readonly ownership: ReadonlyMap<string, unknown>; readonly setVisible: (key: string, visible: boolean) => boolean; readonly remove: (key: string, entry?: RenderedBlockEntry) => void; readonly clear: (entries: Iterable<RenderedBlockEntry>) => void };
  readonly instance: {
    readonly ownershipIndex: ReadonlyMap<string, unknown>;
    readonly memberships: (key: string, scanAll?: boolean) => readonly unknown[];
    readonly setVisible: (key: string, visible: boolean) => boolean;
    readonly remove: (key: string, entry: RenderedBlockEntry, source: 'rollback' | 'reconcile') => void;
    readonly removeOrphaned: (key: string, source: 'rollback' | 'reconcile', entry?: RenderedBlockEntry) => void;
    readonly reconcile: (entries: ReadonlyMap<string, RenderedBlockEntry>) => void;
  };
  readonly placeholders: { readonly remove: (key: string) => void; readonly clear: () => void };
  readonly fallbackGeometry: THREE.BoxGeometry;
  readonly fallbackMaterials: Readonly<Record<PlaceholderRole, THREE.Material>>;
  readonly record: (metric: string, delta?: number) => void;
  readonly invalidateDiagnostics: () => void;
  readonly trace: (phase: string, key: string | undefined, source: string, entry?: RenderedBlockEntry) => void;
}

/** Owns cross-renderer disposal and membership cleanup for one canonical block entry. */
export class BlockRepresentationResourceOwner {
  private fallbackGeometryCounted = false;
  private readonly fallbackMaterialRoles = new Set<PlaceholderRole>();

  constructor(private readonly ports: BlockRepresentationResourceOwnerPorts) {}

  remove(key: string, entry: RenderedBlockEntry): void {
    this.ports.invalidateDiagnostics();
    const removalRevision = this.ports.store.incrementRevision(entry.key);
    if (removalRevision === undefined) return;
    if (entry.fluidChunkKey !== undefined) {
      this.ports.store.removeIfRevision(key, removalRevision);
      return;
    }
    if (entry.terrainChunkKey !== undefined || this.ports.terrain.has(key)) this.ports.terrain.remove(key);
    const hasSurfaceVisual = entry.surfaceFaceMemberships !== undefined || this.ports.surface.ownership.has(key);
    if (hasSurfaceVisual) this.ports.surface.remove(key, entry);
    if (entry.instanceBatchKey || this.ports.instance.ownershipIndex.has(key)) {
      this.ports.trace('before-remove', key, 'reconcile', entry);
      this.ports.instance.remove(key, entry, 'reconcile');
      this.ports.store.setInstanceMembership(entry.key, {});
      this.ports.trace('after-remove', key, 'reconcile');
    } else if (!hasSurfaceVisual) {
      this.releaseObject(entry.object);
      if (entry.object && entry.object !== entry.fallback) disposeObject(entry.object);
      if (entry.fallback && entry.fallback !== entry.object) {
        this.releaseObject(entry.fallback);
        disposeObject(entry.fallback);
      }
    }
    this.ports.store.removeIfRevision(key, removalRevision);
    this.ports.trace('after-remove-entry', key, 'reconcile', entry);
  }

  setPresentationVisible(key: string, entry: RenderedBlockEntry, visible: boolean): boolean {
    if (entry.fluidChunkKey !== undefined || entry.terrainChunkKey !== undefined || this.ports.terrain.has(key)) return false;
    if (entry.instanceBatchKey || this.ports.instance.ownershipIndex.has(key)) {
      if (!this.ports.instance.setVisible(key, visible)) return false;
    } else if (entry.surfaceFaceMemberships !== undefined || this.ports.surface.ownership.has(key)) {
      if (!this.ports.surface.setVisible(key, visible)) return false;
    } else if (entry.object) entry.object.visible = visible;
    else return false;
    this.ports.store.setPresentationVisible(key, visible);
    return true;
  }

  /**
   * Releases only the previous representation after a replacement has already
   * been installed. The canonical store is deliberately untouched here: the
   * commit owner still owns the final store transition.
   */
  releasePreviousAfterReplacement(key: string, entry: RenderedBlockEntry, replacement: 'terrain' | 'surface' | 'instance' | 'object'): void {
    if (replacement !== 'terrain' && (entry.terrainChunkKey !== undefined || this.ports.terrain.has(key))) this.ports.terrain.remove(key);
    if (replacement !== 'surface' && (entry.surfaceFaceMemberships !== undefined || this.ports.surface.ownership.has(key))) this.ports.surface.remove(key, entry);
    if (replacement !== 'instance' && (entry.instanceBatchKey || this.ports.instance.ownershipIndex.has(key))) {
      this.ports.instance.remove(key, entry, 'reconcile');
    }
    if (!entry.instanceBatchKey && !entry.surfaceFaceMemberships && entry.object) {
      this.releaseObject(entry.object);
      disposeObject(entry.object);
    }
    if (entry.fallback && entry.fallback !== entry.object) {
      this.releaseObject(entry.fallback);
      disposeObject(entry.fallback);
    }
    this.ports.invalidateDiagnostics();
  }

  rollbackPartial(key: string): void {
    this.ports.surface.remove(key, this.ports.store.get(key));
    this.removeOrphanedInstanceMemberships(key, 'rollback');
  }

  removeOrphanedInstanceMemberships(key: string, source: 'rollback' | 'reconcile', entry = this.ports.store.get(key)): void {
    this.ports.instance.removeOrphaned(key, source, entry);
    if (entry) this.ports.store.setInstanceMembership(entry.key, {});
  }

  reconcileInstances(): void { this.ports.instance.reconcile(this.ports.store); }

  private clearEntries(): void {
    for (const [key, entry] of this.ports.store) this.remove(key, entry);
    this.ports.surface.clear(this.ports.store.values());
    this.ports.placeholders.clear();
  }

  clear(): void {
    this.clearEntries();
    this.ports.terrain.clear();
  }

  dispose(): void {
    this.clearEntries();
    this.ports.terrain.dispose();
  }

  removePlaceholder(key: string): void { this.ports.placeholders.remove(key); }
  clearPlaceholders(): void { this.ports.placeholders.clear(); }

  ensureFallback(entry: RenderedBlockEntry, referenceOpacity = .28): THREE.Mesh {
    if (entry.fallback) return entry.fallback;
    if (!this.fallbackGeometryCounted) { this.ports.record('fallbackGeometryConstructions'); this.fallbackGeometryCounted = true; }
    if (!this.fallbackMaterialRoles.has(entry.role)) { this.ports.record('fallbackMaterialCreations'); this.fallbackMaterialRoles.add(entry.role); }
    const isReference = entry.role === 'reference';
    const material = entry.role === 'missing' ? this.ports.fallbackMaterials.missing : isReference ? this.ports.fallbackMaterials.reference : this.ports.fallbackMaterials.normal;
    material.transparent = isReference;
    material.opacity = isReference ? referenceOpacity : 1;
    const fallback = new THREE.Mesh(this.ports.fallbackGeometry, material);
    fallback.position.set(entry.block.position.x + .5, entry.block.position.y + .5, entry.block.position.z + .5);
    fallback.userData['voxel'] = entry.block.position;
    fallback.userData['renderRole'] = entry.role;
    this.ports.store.setFallback(entry.key, fallback);
    (this.ports.objectPresentation?.parentFor(entry.block) ?? this.ports.blocksGroup).add(fallback);
    this.ports.record('fallbackMeshCreations');
    return fallback;
  }

  private releaseObject(object: THREE.Object3D | undefined): void {
    if (this.ports.objectPresentation) this.ports.objectPresentation.release(object);
    else if (object?.parent === this.ports.blocksGroup) this.ports.blocksGroup.remove(object);
  }
}

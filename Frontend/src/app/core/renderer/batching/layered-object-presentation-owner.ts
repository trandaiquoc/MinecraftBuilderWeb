import * as THREE from 'three';
import type { PlacedBlock, ProjectGroup } from '../../domain/project.types';
import { groupIdsOf } from '../../editor/groups/group-membership';

export interface LayeredObjectPresentationState {
  readonly visibleLayers: ReadonlySet<number>;
  readonly currentY: number;
  readonly referenceOpacity: number;
  readonly groups: readonly ProjectGroup[];
  readonly isolatedGroupId?: string;
}

interface LayerObjectBucket {
  readonly key: string;
  readonly layer: number;
  readonly groupIds: readonly string[];
  readonly root: THREE.Group;
  role: 'normal' | 'reference';
}

/** Retains standalone block objects under layer/group presentation buckets. */
export class LayeredObjectPresentationOwner {
  private readonly buckets = new Map<string, LayerObjectBucket>();
  private state?: LayeredObjectPresentationState;

  constructor(
    private readonly root: THREE.Group,
    private readonly applyRole: (
      object: THREE.Object3D,
      role: 'normal' | 'reference',
      opacity: number,
    ) => void,
    private readonly record: (
      metric: 'yLayerObjectVisibilityUpdates' | 'yLayerObjectRoleUpdates',
      delta?: number,
    ) => void = () => undefined,
  ) {}

  parentFor(block: PlacedBlock): THREE.Group {
    const state = this.state;
    if (!state) return this.root;
    const groupIds = [...new Set(groupIdsOf(block))].sort();
    const key = `${block.position.y}|${groupIds.join('\u001f')}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const layer = Math.trunc(block.position.y);
      const role = layer === state.currentY ? 'normal' : 'reference';
      const parent = new THREE.Group();
      parent.name = `block-layer:${key}`;
      parent.userData['blockLayeredObjectBucket'] = true;
      parent.userData['blockLayer'] = layer;
      parent.userData['blockGroupIds'] = groupIds;
      parent.visible = this.isVisible(layer, groupIds, state);
      bucket = { key, layer, groupIds, root: parent, role };
      this.buckets.set(key, bucket);
      this.root.add(parent);
    }
    return bucket.root;
  }

  setPresentation(state: LayeredObjectPresentationState): void {
    this.state = state;
    for (const bucket of this.buckets.values()) {
      const visible = this.isVisible(bucket.layer, bucket.groupIds, state);
      if (bucket.root.visible !== visible) {
        bucket.root.visible = visible;
        this.record('yLayerObjectVisibilityUpdates');
      }
      const role = bucket.layer === state.currentY ? 'normal' : 'reference';
      if (bucket.role === role) continue;
      bucket.role = role;
      for (const child of bucket.root.children) this.applyRole(child, role, state.referenceOpacity);
      this.record('yLayerObjectRoleUpdates');
    }
  }

  clearPresentation(): void {
    this.state = undefined;
    for (const bucket of this.buckets.values()) {
      bucket.root.visible = true;
      if (bucket.role !== 'normal') {
        bucket.role = 'normal';
        for (const child of bucket.root.children) this.applyRole(child, 'normal', 1);
      }
    }
  }

  release(object: THREE.Object3D | undefined): void {
    const parent = object?.parent;
    if (!parent) return;
    if (parent === this.root) {
      this.root.remove(object!);
      return;
    }
    if (parent.userData['blockLayeredObjectBucket'] !== true) return;
    parent.remove(object!);
    if (parent.children.length) return;
    this.root.remove(parent);
    for (const [key, bucket] of this.buckets)
      if (bucket.root === parent) {
        this.buckets.delete(key);
        break;
      }
  }

  clear(): void {
    this.clearPresentation();
    for (const bucket of this.buckets.values()) {
      for (const child of [...bucket.root.children]) {
        bucket.root.remove(child);
        this.root.add(child);
      }
      this.root.remove(bucket.root);
    }
    this.buckets.clear();
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  private isVisible(
    layer: number,
    groupIds: readonly string[],
    state: LayeredObjectPresentationState,
  ): boolean {
    if (!state.visibleLayers.has(layer)) return false;
    if (groupIds.some((id) => state.groups.find((group) => group.id === id)?.visible === false))
      return false;
    return !state.isolatedGroupId || groupIds.includes(state.isolatedGroupId);
  }
}

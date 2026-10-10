import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { LayeredObjectPresentationOwner } from './layered-object-presentation-owner';

function block(y: number, groupIds: readonly string[] = []): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'example:block',
    namespace: 'example',
    position: { x: 0, y, z: 0 },
    state: {},
    groupIds,
  };
}

describe('LayeredObjectPresentationOwner', () => {
  it('retains standalone objects by layer/group and changes visibility without disposing them', () => {
    const root = new THREE.Group();
    const applyRole = vi.fn();
    const owner = new LayeredObjectPresentationOwner(root, applyRole);
    owner.setPresentation({
      visibleLayers: new Set([10, 11]),
      currentY: 10,
      referenceOpacity: 0.25,
      groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }],
    });
    const roofParent = owner.parentFor(block(10, ['roof']));
    const otherParent = owner.parentFor(block(11));
    const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    roofParent.add(object);

    owner.setPresentation({
      visibleLayers: new Set([11]),
      currentY: 11,
      referenceOpacity: 0.25,
      groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }],
    });

    expect(roofParent.visible).toBe(false);
    expect(otherParent.visible).toBe(true);
    expect(object.parent).toBe(roofParent);
    expect(applyRole).toHaveBeenCalledTimes(1);
    owner.clear();
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  });

  it('applies hidden-group and isolated-group filters at bucket granularity', () => {
    const root = new THREE.Group();
    const owner = new LayeredObjectPresentationOwner(root, () => undefined);
    owner.setPresentation({
      visibleLayers: new Set([4]),
      currentY: 4,
      referenceOpacity: 0.28,
      groups: [{ id: 'hidden', name: 'Hidden', visible: false, locked: false }],
    });
    const hidden = owner.parentFor(block(4, ['hidden', 'other']));
    const isolatedOut = owner.parentFor(block(4, ['other']));
    const isolatedIn = owner.parentFor(block(4, ['target', 'other']));

    owner.setPresentation({
      visibleLayers: new Set([4]),
      currentY: 4,
      referenceOpacity: 0.28,
      groups: [],
      isolatedGroupId: 'target',
    });

    expect(hidden.visible).toBe(false);
    expect(isolatedOut.visible).toBe(false);
    expect(isolatedIn.visible).toBe(true);
    owner.clear();
  });

  it('releases empty buckets and reuses bounded parents for matching membership signatures', () => {
    const root = new THREE.Group();
    const owner = new LayeredObjectPresentationOwner(root, () => undefined);
    owner.setPresentation({
      visibleLayers: new Set([2]),
      currentY: 2,
      referenceOpacity: 0.28,
      groups: [],
    });
    const parent = owner.parentFor(block(2, ['b', 'a']));
    expect(owner.parentFor(block(2, ['a', 'b']))).toBe(parent);
    const object = new THREE.Object3D();
    parent.add(object);

    owner.release(object);

    expect(owner.bucketCount).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});

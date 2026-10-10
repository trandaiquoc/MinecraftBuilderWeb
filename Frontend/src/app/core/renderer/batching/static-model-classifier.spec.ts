import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { classifyStaticModel } from './static-model-classifier';
import { SpecialBlockVisualRegistry } from '../visuals/special-block-visual-registry';

describe('static model classifier', () => {
  it('accepts reusable models whose envelope is smaller than one voxel', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    geometry.userData['providerOwnedGeometry'] = true;
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const result = classifyStaticModel(root);
    expect(result.kind).toBe('batchable-opaque');
    expect(result.compiled?.envelope.getSize(new THREE.Vector3()).toArray()).toEqual([
      0.5, 0.5, 0.5,
    ]);
  });

  it('keeps an oversized envelope in the compiled batch bounds', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1.2, 2, 0.8);
    geometry.userData['providerOwnedGeometry'] = true;
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const result = classifyStaticModel(root);
    expect(result.kind).toBe('batchable-opaque');
    expect(result.compiled?.envelope.getSize(new THREE.Vector3()).toArray()).toEqual([
      expect.closeTo(1.2, 5),
      2,
      expect.closeTo(0.8, 5),
    ]);
  });

  it('allows a proven static special family but rejects an unproven one', () => {
    const safe = new THREE.Group();
    safe.userData['specialVisualFamily'] = 'lanterns';
    safe.userData['staticBatchable'] = true;
    safe.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const unsafe = safe.clone();
    unsafe.userData['staticBatchable'] = false;
    expect(classifyStaticModel(safe).kind).toBe('batchable-opaque');
    expect(classifyStaticModel(unsafe).kind).toBe('special-unsafe');
  });

  it('accepts alpha-test cutout material and rejects blended transparency', () => {
    const cutout = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      alphaTest: 0.1,
      depthWrite: true,
    });
    const cutoutRoot = new THREE.Group();
    cutoutRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), cutout));
    expect(classifyStaticModel(cutoutRoot).kind).toBe('batchable-transparent-safe');
    const blended = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      depthWrite: true,
    });
    const blendedRoot = new THREE.Group();
    blendedRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), blended));
    expect(classifyStaticModel(blendedRoot).kind).toBe('transparent');
  });

  it('extracts all multipart children with root-relative transforms', () => {
    const root = new THREE.Group();
    for (const x of [0, 0.25, 0.5]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshBasicMaterial({ color: 0x223344 + Math.round(x * 10) }),
      );
      mesh.position.x = x;
      root.add(mesh);
    }
    const result = classifyStaticModel(root);
    expect(result.templates).toHaveLength(3);
    expect(result.compiled?.envelope.max.x).toBeGreaterThan(0.5);
  });

  it.each(['head', 'foot'] as const)(
    'preserves vanilla bed %s geometry in the compiled static template for every facing',
    (part) => {
      const registry = new SpecialBlockVisualRegistry();
      for (const facing of ['north', 'east', 'south', 'west'] as const) {
        const block = {
          kind: 'resolved' as const,
          id: 'minecraft:red_bed',
          namespace: 'minecraft',
          position: { x: 0, y: 0, z: 0 },
          state: { part, facing },
        };
        const adapter = registry.resolve(block)!;
        const visual = adapter.create(block);
        visual.userData['specialVisualFamily'] = adapter.family;
        visual.userData['staticBatchable'] = true;
        visual.updateMatrixWorld(true);
        const direct = new THREE.Box3().setFromObject(visual);
        const compiled = classifyStaticModel(visual).compiled;
        expect(compiled, `${part}/${facing}`).toBeDefined();
        expect(compiled!.envelope.min.toArray(), `${part}/${facing} min`).toEqual(
          direct.min.toArray(),
        );
        expect(compiled!.envelope.max.toArray(), `${part}/${facing} max`).toEqual(
          direct.max.toArray(),
        );
        expect(visual.position.toArray()).toEqual([0, 0, 0]);
      }
    },
  );
});

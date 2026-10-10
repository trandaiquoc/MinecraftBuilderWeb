import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectSceneRenderCost } from './scene-render-cost';

describe('collectSceneRenderCost', () => {
  it('separates batch, standalone and transparency costs without changing scene ownership', () => {
    const scene = new THREE.Scene();
    const blocks = new THREE.Group();
    const decorations = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const opaque = new THREE.MeshBasicMaterial();
    const transparent = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
    const standalone = new THREE.Mesh(geometry, transparent);
    blocks.add(standalone);
    scene.add(blocks, decorations);
    const batchMesh = new THREE.InstancedMesh(geometry, opaque, 2);
    batchMesh.count = 1;
    blocks.add(batchMesh);
    const cost = collectSceneRenderCost({
      scene,
      blocksGroup: blocks,
      decorationsGroup: decorations,
      instanceBatches: [{ regionKey: '0,0,0', keys: ['a'], parts: [batchMesh] }],
      surfaceBatches: [],
      placeholderBatches: [],
      renderedBlocks: [{ object: standalone }],
      renderedDecorations: [],
    });
    expect(cost.instance.meshCount).toBe(1);
    expect(cost.instance.members).toBe(1);
    expect(cost.standaloneBlockObjects).toBe(1);
    expect(cost.standaloneTransparentMeshes).toBe(1);
    expect(cost.opaqueMeshCount).toBe(1);
    geometry.dispose();
    opaque.dispose();
    transparent.dispose();
  });
});

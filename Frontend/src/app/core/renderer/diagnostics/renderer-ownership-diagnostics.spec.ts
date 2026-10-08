import * as THREE from 'three';
import { collectRendererOwnershipDiagnostics, type RendererOwnershipDiagnosticSnapshot } from './renderer-ownership-diagnostics';

function snapshot(scene: THREE.Scene, blocksGroup: THREE.Group): RendererOwnershipDiagnosticSnapshot {
  return {
    scene,
    canonicalRoot: new THREE.Group(),
    roots: [{ object: blocksGroup, name: 'blocksGroup' }],
    projectBlockCount: 0,
    expectedKeys: new Set(),
    renderedEntries: new Map(),
    placeholderIndices: new Map(),
    pendingSignatures: new Map(),
    placeholderSignatures: new Map(),
    queuedKeys: [],
    runningKeys: new Map(),
    instanceBatches: [],
    instanceOwnershipIndex: new Map(),
    placeholderBatches: [],
    runtimeChecks: false,
    preview: {
      ghostVisible: false,
      ghostModelPresent: false,
      ghostModelVisible: false,
      ghostModelKey: '',
      ghostGeneration: 0,
      movePreviewChildren: 0,
      decorationGhostChildren: 0,
      logicalSelectionChildren: 0,
      selectionOutlineVisible: false,
      reusableTemplateCount: 0,
    },
    previewActivity: { activeBlock: false, groupMoveActive: false, decorationActive: false },
    hydration: { queued: 0, running: 0, pendingSignatureCount: 0, placeholderSignatureCount: 0, runningOwnershipCount: 0 },
  };
}

describe('renderer ownership diagnostics', () => {
  it('classifies block-owned and stray scene meshes without mutating scene ownership', () => {
    const scene = new THREE.Scene();
    const blocks = new THREE.Group();
    const strayOwner = new THREE.Group();
    strayOwner.name = 'strayOwner';
    scene.add(blocks, strayOwner);
    const material = new THREE.MeshBasicMaterial();
    const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const strayMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    blocks.add(blockMesh);
    strayOwner.add(strayMesh);

    const result = collectRendererOwnershipDiagnostics(snapshot(scene, blocks));

    expect(result.visibleMeshCount).toBe(2);
    expect(result.visibleMeshesOutsideBlocksGroup).toBe(1);
    expect(result.outsideBlocksGroupOwners).toEqual([`strayOwner/Mesh:${strayMesh.uuid}`]);
    expect(result.suspiciousVisuals).toHaveLength(2);
    expect(blocks.children).toContain(blockMesh);
    expect(strayOwner.children).toContain(strayMesh);

    material.dispose();
    blockMesh.geometry.dispose();
    strayMesh.geometry.dispose();
  });

  it('does not report invisible meshes as visible ownership violations', () => {
    const scene = new THREE.Scene();
    const blocks = new THREE.Group();
    const hiddenOwner = new THREE.Group();
    hiddenOwner.visible = false;
    scene.add(blocks, hiddenOwner);
    hiddenOwner.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));

    const result = collectRendererOwnershipDiagnostics(snapshot(scene, blocks));

    expect(result.visibleMeshCount).toBe(0);
    expect(result.outsideBlocksGroupOwners).toEqual([]);
    expect(result.suspiciousVisuals).toEqual([]);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectStaticModelDiagnostics } from './static-model-diagnostics';

function metrics() {
  return {
    candidates: 4,
    batchable: 1,
    batchedMembers: 1,
    templateCacheHits: 2,
    templateCacheMisses: 1,
    providerObjectsAvoidedByStaticCache: 2,
    rejected: { transparent: 2, 'special-unsafe': 1 },
    reusableKeyRequested: 4,
    reusableKeyReturned: 3,
    reusableKeyMissing: 1,
    reusableKeyMissingByFamily: { 'generic-json': 1 },
  } as const;
}

describe('collectStaticModelDiagnostics', () => {
  it('reconciles current standalone representation without double counting', () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const objects = Array.from({ length: 4 }, () => new THREE.Mesh(geometry, material));
    const snapshot = collectStaticModelDiagnostics([
      { key: 'a', id: 'minecraft:stone', object: objects[0], staticModelAttempted: true, staticModelDecision: { classification: 'rejected', kind: 'transparent', reason: 'blended-transparency' } },
      { key: 'b', id: 'minecraft:sign', object: objects[1], staticModelAttempted: true, staticModelDecision: { classification: 'rejected', kind: 'special-unsafe', reason: 'unique-content' }, staticModelFamily: 'signs' },
      { key: 'c', id: 'minecraft:water', object: objects[2], staticModelAttempted: false, staticModelFamily: 'fluids' },
      { key: 'd', id: 'minecraft:stone', object: objects[3], staticModelAttempted: true, staticModelDecision: { classification: 'batchable', kind: 'batchable-opaque', reason: 'classified-static-model' } },
      { key: 'batched', id: 'minecraft:stone', object: objects[0], instanceBatchKey: 'batch' },
    ], metrics(), [{ key: 'stone', partCount: 1 }]);
    expect(snapshot.standaloneLogical).toBe(4);
    expect(snapshot.standaloneMeshes).toBe(4);
    expect(snapshot.standaloneClassifiedRejected).toBe(2);
    expect(snapshot.standaloneNeverClassified).toBe(1);
    expect(snapshot.standaloneClassifiedBatchableButNotBatched).toBe(1);
    expect(snapshot.standaloneReasonCounts).toEqual({ 'classification-special-unsafe': 1, 'classification-transparent': 1, 'classified-batchable-but-not-batched': 1, 'never-classified': 1 });
    expect(snapshot.standaloneLogicalByFamily['signs']).toEqual({ logical: 1, meshes: 1 });
    expect(snapshot.topStandaloneBlockIds[0]).toMatchObject({ id: 'minecraft:stone', logicalCount: 2, meshCount: 2 });
    geometry.dispose(); material.dispose();
  });
});

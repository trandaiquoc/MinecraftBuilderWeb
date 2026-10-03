import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { terrainAtlasEligibility } from './terrain-atlas-compatibility';

function texture(): THREE.DataTexture {
  const map = new THREE.DataTexture(new Uint8Array([12, 34, 56, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

describe('terrain atlas material compatibility', () => {
  it('allows different source maps while preserving render semantics', () => {
    const firstMap = texture();
    const secondMap = texture();
    const firstMaterial = new THREE.MeshLambertMaterial({ map: firstMap });
    const secondMaterial = new THREE.MeshLambertMaterial({ map: secondMap });
    const first = terrainAtlasEligibility(firstMaterial);
    const second = terrainAtlasEligibility(secondMaterial);
    expect(first.eligible).toBe(true);
    expect(second.eligible).toBe(true);
    expect(second.semantics?.key).toBe(first.semantics?.key);
    expect(second.semantics?.samplingKey).toBe(first.semantics?.samplingKey);
    firstMaterial.dispose();
    secondMaterial.dispose();
    firstMap.dispose();
    secondMap.dispose();
  });

  it('keeps incompatible render semantics out of the atlas contract', () => {
    const map = texture();
    const transparentMaterial = new THREE.MeshLambertMaterial({ map, transparent: true });
    const transformed = new THREE.MeshLambertMaterial({ map });
    map.repeat.set(2, 1);
    expect(terrainAtlasEligibility(transparentMaterial).eligible).toBe(false);
    const transformedResult = terrainAtlasEligibility(transformed);
    expect(transformedResult.eligible).toBe(false);
    transparentMaterial.dispose();
    transformed.dispose();
    map.dispose();
  });
});

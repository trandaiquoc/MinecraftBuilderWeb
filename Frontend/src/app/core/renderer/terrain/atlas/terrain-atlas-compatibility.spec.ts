import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { terrainAtlasEligibility } from './terrain-atlas-compatibility';

describe('terrain atlas compatibility', () => {
  it('accepts an opaque static mapped terrain material', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    expect(terrainAtlasEligibility(material).eligible).toBe(true);
    material.dispose(); texture.dispose();
  });

  it('rejects transformed, transparent, and special material semantics', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    expect(terrainAtlasEligibility(material).eligible).toBe(false);
    material.dispose(); texture.dispose();
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { terrainAtlasEligibility } from './terrain-atlas-compatibility';

describe('terrain atlas compatibility', () => {
  it('accepts an opaque static mapped terrain material', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    expect(terrainAtlasEligibility(material)).toMatchObject({ eligible: true, reason: 'compatible' });
    material.dispose(); texture.dispose();
  });

  it('rejects transformed, transparent, and special material semantics', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    expect(terrainAtlasEligibility(material)).toMatchObject({ eligible: false, reason: 'transparent' });
    material.dispose(); texture.dispose();
  });

  it('keeps DoubleSide closed in production but exposes an explicit probe policy', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    expect(terrainAtlasEligibility(material)).toMatchObject({ eligible: false, reason: 'side' });
    expect(terrainAtlasEligibility(material, { allowDoubleSideForProbe: true })).toMatchObject({ eligible: true, reason: 'compatible' });
    material.dispose(); texture.dispose();
  });
});

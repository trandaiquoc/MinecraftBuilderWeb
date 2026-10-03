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

  it('accepts production DoubleSide after the proven atlas parity gate', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    expect(terrainAtlasEligibility(material)).toMatchObject({ eligible: false, reason: 'side' });
    expect(terrainAtlasEligibility(material, { allowDoubleSide: true })).toMatchObject({ eligible: true, reason: 'compatible' });
    expect(terrainAtlasEligibility(material, { allowDoubleSideForProbe: true })).toMatchObject({ eligible: true, reason: 'compatible' });
    material.dispose(); texture.dispose();
  });

  it('keeps BackSide on the strict fallback path', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    expect(terrainAtlasEligibility(material, { allowDoubleSide: true })).toMatchObject({ eligible: false, reason: 'side' });
    material.dispose(); texture.dispose();
  });
});

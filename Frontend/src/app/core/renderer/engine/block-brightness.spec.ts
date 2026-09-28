import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyBlockBrightnessToMaterial, applyBlockBrightnessToObject, blockBrightnessMaterialFactor, setBlockBrightnessBaseColor } from './block-brightness';

describe('block brightness material policy', () => {
  it('uses a visible monotonic factor around the vanilla/default level', () => {
    expect(blockBrightnessMaterialFactor(0)).toBeLessThan(blockBrightnessMaterialFactor(3));
    expect(blockBrightnessMaterialFactor(3)).toBeLessThan(blockBrightnessMaterialFactor(10));
  });

  it.each([THREE.MeshLambertMaterial, THREE.MeshBasicMaterial])('changes %p materials without changing their maps', (Material) => {
    const texture = new THREE.Texture();
    const material = new Material({ color: 0x6688aa, map: texture });
    setBlockBrightnessBaseColor(material);
    applyBlockBrightnessToMaterial(material, 0);
    const dark = material.color.getHex();
    applyBlockBrightnessToMaterial(material, 10);
    const bright = material.color.getHex();
    expect(dark).not.toBe(bright);
    expect(material.map).toBe(texture);
    material.dispose(); texture.dispose();
  });

  it('is reversible and does not accumulate color drift', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0x7799bb });
    const base = material.color.clone();
    setBlockBrightnessBaseColor(material);
    applyBlockBrightnessToMaterial(material, 10);
    applyBlockBrightnessToMaterial(material, 0);
    applyBlockBrightnessToMaterial(material, 3);
    expect(material.color.r).toBeCloseTo(base.r);
    expect(material.color.g).toBeCloseTo(base.g);
    expect(material.color.b).toBeCloseTo(base.b);
    material.dispose();
  });

  it('updates shared instanced/template materials without touching overlay materials', () => {
    const blockMaterial = new THREE.MeshBasicMaterial({ color: 0x8899aa });
    const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blockMaterial);
    const overlayMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const overlay = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), overlayMaterial);
    const world = new THREE.Group(); world.add(block);
    const overlayColor = overlayMaterial.color.clone();
    setBlockBrightnessBaseColor(blockMaterial);
    applyBlockBrightnessToObject(world, 0);
    const dark = blockMaterial.color.getHex();
    applyBlockBrightnessToObject(world, 10);
    expect(blockMaterial.color.getHex()).not.toBe(dark);
    expect(overlayMaterial.color.equals(overlayColor)).toBe(true);
    block.geometry.dispose(); blockMaterial.dispose(); overlay.geometry.dispose(); overlayMaterial.dispose();
  });
});

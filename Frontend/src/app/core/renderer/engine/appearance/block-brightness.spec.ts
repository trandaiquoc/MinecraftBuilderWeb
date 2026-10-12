import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyBlockBrightnessToMaterial,
  applyBlockBrightnessToObject,
  applyStructureGuideBrightnessToObject,
  blockBrightnessMaterialFactor,
  setBlockBrightnessBaseColor,
  STRUCTURE_GUIDE_BRIGHTNESS,
  structureGuideBrightnessMaterialFactor,
} from './block-brightness';

describe('block brightness material policy', () => {
  it('uses a visible monotonic factor around the vanilla/default level', () => {
    expect(blockBrightnessMaterialFactor(0)).toBeLessThan(blockBrightnessMaterialFactor(3));
    expect(blockBrightnessMaterialFactor(3)).toBeLessThan(blockBrightnessMaterialFactor(10));
  });

  it.each([THREE.MeshLambertMaterial, THREE.MeshBasicMaterial])(
    'changes %p materials without changing their maps',
    (Material) => {
      const texture = new THREE.Texture();
      const material = new Material({ color: 0x6688aa, map: texture });
      const source = material.color.clone();
      setBlockBrightnessBaseColor(material);
      applyBlockBrightnessToMaterial(material, 3);
      expect(material.color.equals(source)).toBe(true);
      applyBlockBrightnessToMaterial(material, 0);
      const dark = material.color.getHex();
      applyBlockBrightnessToMaterial(material, 10);
      const bright = material.color.getHex();
      expect(dark).not.toBe(bright);
      expect(material.map).toBe(texture);
      material.dispose();
      texture.dispose();
    },
  );

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
    const world = new THREE.Group();
    world.add(block);
    const overlayColor = overlayMaterial.color.clone();
    setBlockBrightnessBaseColor(blockMaterial);
    applyBlockBrightnessToObject(world, 0);
    const dark = blockMaterial.color.getHex();
    applyBlockBrightnessToObject(world, 10);
    expect(blockMaterial.color.getHex()).not.toBe(dark);
    expect(overlayMaterial.color.equals(overlayColor)).toBe(true);
    block.geometry.dispose();
    blockMaterial.dispose();
    overlay.geometry.dispose();
    overlayMaterial.dispose();
  });

  it('preserves source tint for special and fluid-like world materials', () => {
    const fluid = new THREE.MeshLambertMaterial({
      color: 0x3f76e4,
      transparent: true,
      opacity: 0.7,
    });
    const special = new THREE.MeshLambertMaterial({ color: 0xb83832, map: new THREE.Texture() });
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(), fluid),
      new THREE.Mesh(new THREE.BoxGeometry(), special),
    );
    const fluidSource = fluid.color.clone();
    const specialSource = special.color.clone();
    applyBlockBrightnessToObject(root, 3);
    expect(fluid.color.equals(fluidSource)).toBe(true);
    expect(special.color.equals(specialSource)).toBe(true);
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    fluid.dispose();
    special.map?.dispose();
    special.dispose();
  });

  it('keeps guide brightness above the normal maximum as an independent semantic scale', () => {
    expect(STRUCTURE_GUIDE_BRIGHTNESS).toBe(18);
    expect(structureGuideBrightnessMaterialFactor()).toBeGreaterThan(
      blockBrightnessMaterialFactor(10),
    );
  });

  it('clones guide materials, preserves shared textures, and does not change the source material', () => {
    const texture = new THREE.Texture();
    const source = new THREE.MeshLambertMaterial({
      color: 0x6688aa,
      map: texture,
      transparent: true,
      opacity: 0.8,
      alphaTest: 0.1,
    });
    source.userData['sharedPlaceholderMaterial'] = true;
    const root = new THREE.Mesh(new THREE.BoxGeometry(), source);
    const sourceColor = source.color.clone();

    applyStructureGuideBrightnessToObject(root);

    const guide = root.material as unknown as THREE.MeshBasicMaterial;
    expect(guide).not.toBe(source);
    expect(guide).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(guide.map).toBe(texture);
    expect(guide.userData['sharedPlaceholderMaterial']).toBeUndefined();
    expect(guide.color.getHex()).not.toBe(sourceColor.getHex());
    expect(source.color.equals(sourceColor)).toBe(true);
    expect(guide.transparent).toBe(true);
    expect(guide.opacity).toBe(0.8);
    expect(guide.alphaTest).toBe(0.1);

    let textureDisposed = false;
    texture.addEventListener('dispose', () => (textureDisposed = true));
    guide.dispose();
    expect(textureDisposed).toBe(false);
    root.geometry.dispose();
    source.dispose();
    texture.dispose();
  });

  it('keeps standard materials and applies self-lit guide output without replacing their texture', () => {
    const texture = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ color: 0x6688aa, map: texture });
    const root = new THREE.Mesh(new THREE.BoxGeometry(), source);

    applyStructureGuideBrightnessToObject(root);

    const guide = root.material as THREE.MeshStandardMaterial;
    expect(guide).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(guide).not.toBe(source);
    expect(guide.map).toBe(texture);
    expect(guide.emissiveIntensity).toBeGreaterThan(0);
    guide.dispose();
    root.geometry.dispose();
    source.dispose();
    texture.dispose();
  });
});

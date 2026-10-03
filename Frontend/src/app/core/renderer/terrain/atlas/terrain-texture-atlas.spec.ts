import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { precompileTerrainTemplates } from '../chunk-surface-mesher';
import type { SurfaceFaceTemplate } from '../../batching/surface-face-batch-renderer';
import { TerrainTextureAtlas, remapTerrainUvs } from './terrain-texture-atlas';

function texture(color: readonly [number, number, number, number], width = 2, height = 2): THREE.DataTexture {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(color, index);
  const result = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  result.magFilter = THREE.NearestFilter; result.minFilter = THREE.NearestFilter; result.generateMipmaps = false; result.needsUpdate = true;
  return result;
}

describe('TerrainTextureAtlas', () => {
  it('deduplicates cloned materials sharing one texture source and remaps UVs', () => {
    const map = texture([10, 20, 30, 255]);
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const first = atlas.face(new THREE.MeshLambertMaterial({ map }), [0, 0, 1, 0, 1, 1, 0, 1])!;
    const secondMaterial = new THREE.MeshLambertMaterial({ map: map.clone() });
    const second = atlas.face(secondMaterial, [0, 0, 1, 0, 1, 1, 0, 1])!;
    expect(second.sprite).toEqual(first.sprite);
    expect(atlas.evidence()).toMatchObject({ terrainAtlasSprites: 1, terrainAtlasSpriteInsertions: 1, terrainAtlasSpriteCacheHits: 1, terrainAtlasFaces: 2, terrainAtlasMaterials: 1 });
    expect(first.uvs[0]).toBe(first.sprite.minU);
    expect(first.uvs[2]).toBe(first.sprite.maxU);
    secondMaterial.dispose(); atlas.dispose(); map.dispose();
  });

  it('extrudes gutter pixels and preserves source face orientation in the content rect', () => {
    const map = texture([255, 0, 0, 255], 2, 1);
    const atlas = new TerrainTextureAtlas({ width: 8, height: 8 }, 1);
    const face = atlas.face(new THREE.MeshBasicMaterial({ map }), [1, 0, 0, 0, 0, 1, 1, 1])!;
    expect(face.sprite.x).toBe(1);
    expect(face.sprite.y).toBe(1);
    expect(remapTerrainUvs([1, 0, 0, 1], face.sprite)).toEqual([face.sprite.maxU, face.sprite.minV, face.sprite.minU, face.sprite.maxV]);
    const page = (atlas as unknown as { pages: readonly [{ pixels: Uint8Array }] }).pages[0];
    expect(page.pixels.slice(0, 4)).toEqual(new Uint8Array([255, 0, 0, 255]));
    atlas.dispose(); map.dispose();
  });

  it('falls back for unsupported transparent materials without creating a sprite', () => {
    const map = texture([1, 2, 3, 255]);
    const atlas = new TerrainTextureAtlas({ width: 8, height: 8 }, 1);
    const material = new THREE.MeshBasicMaterial({ map, transparent: true });
    expect(atlas.face(material, [0, 0, 1, 1])).toBeUndefined();
    expect(atlas.evidence()).toMatchObject({ terrainAtlasSprites: 0, terrainAtlasFaces: 0, terrainAtlasFallbackFaces: 1 });
    material.dispose(); atlas.dispose(); map.dispose();
  });

  it('falls back for a transformed source map instead of applying the transform twice', () => {
    const map = texture([1, 2, 3, 255]);
    map.repeat.set(2, 1);
    const atlas = new TerrainTextureAtlas({ width: 8, height: 8 }, 1);
    const material = new THREE.MeshBasicMaterial({ map });
    expect(atlas.face(material, [0, 0, 1, 1])).toBeUndefined();
    expect(atlas.evidence().terrainAtlasSprites).toBe(0);
    material.dispose(); atlas.dispose(); map.dispose();
  });

  it('keeps six distinct face textures in their own atlas sprite UV rectangles', () => {
    const directions = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
    const maps = directions.map((_, index) => texture([index * 20, 40, 80, 255], 1, 1));
    const materials = maps.map((map) => new THREE.MeshBasicMaterial({ map }));
    const sourceUvs = directions.map((_, index) => index % 2 === 0 ? [0, 0, 1, 0, 1, 1, 0, 1] : [1, 0, 0, 0, 0, 1, 1, 1]);
    const templates: SurfaceFaceTemplate[] = directions.map((direction, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(sourceUvs[index], 2));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      return { geometry, material: materials[index], direction, matrix: new THREE.Matrix4() };
    });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const compiled = precompileTerrainTemplates(templates, atlas);
    expect(atlas.evidence()).toMatchObject({ terrainAtlasSprites: 6, terrainAtlasFaces: 6 });
    for (let index = 0; index < templates.length; index += 1) {
      const face = atlas.face(materials[index], sourceUvs[index])!;
      const source = sourceUvs[index];
      const indexed = [source[0], source[1], source[2], source[3], source[4], source[5], source[0], source[1], source[4], source[5], source[6], source[7]];
      expect(compiled[index].uvs).toEqual(remapTerrainUvs(indexed, face.sprite));
    }
    for (const template of templates) template.geometry.dispose();
    for (const material of materials) material.dispose();
    for (const map of maps) map.dispose();
    atlas.dispose();
  });
});

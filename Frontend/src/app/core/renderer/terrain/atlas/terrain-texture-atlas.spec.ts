import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainTextureAtlas, sampleAtlasUv } from './terrain-texture-atlas';

function texture(colors: number[]): THREE.DataTexture {
  const value = new THREE.DataTexture(new Uint8Array(colors), 2, 2, THREE.RGBAFormat);
  value.flipY = true;
  value.magFilter = THREE.NearestFilter;
  value.minFilter = THREE.NearestFilter;
  value.generateMipmaps = false;
  value.needsUpdate = true;
  return value;
}

describe('terrain texture atlas', () => {
  it('deduplicates one source texture and preserves UV semantics', () => {
    const source = texture([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    const firstMaterial = new THREE.MeshBasicMaterial({ map: source });
    const secondMaterial = firstMaterial.clone();
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const first = atlas.face(firstMaterial, [0, 0, 1, 0, 1, 1, 0, 1])!;
    const second = atlas.face(secondMaterial, [0, 0, 1, 0, 1, 1, 0, 1])!;
    expect(first.sprite).toEqual(second.sprite);
    expect(atlas.evidence()).toMatchObject({ terrainAtlasSprites: 1, terrainAtlasInsertions: 1, terrainAtlasCacheHits: 1, terrainAtlasCompatibleFaces: 2 });
    const remapped = sampleAtlasUv(first.sprite, 0, 0);
    expect(remapped[0]).toBe(first.sprite.minU);
    expect(remapped[1]).toBe(first.sprite.minV);
    atlas.clear(); firstMaterial.dispose(); secondMaterial.dispose(); source.dispose();
  });

  it('returns strict fallback for an unsupported material or unavailable pixels', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    expect(atlas.face(material, [0, 0, 1, 0])).toBeUndefined();
    expect(atlas.evidence().terrainAtlasFallbackFaces).toBe(1);
    atlas.clear(); material.dispose();
  });

  it('accepts a runtime-equivalent flipY=false source after explicit normalization', () => {
    const source = texture([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    source.flipY = false;
    const material = new THREE.MeshBasicMaterial({ map: source });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    expect(atlas.face(material, [0, 0, 1, 0, 1, 1, 0, 1])).toBeDefined();
    expect(atlas.evidence().terrainAtlasSprites).toBe(1);
    atlas.clear(); material.dispose(); source.dispose();
  });

  it('resets pages and sprite identity at a provider-generation boundary', () => {
    const source = texture([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    const material = new THREE.MeshBasicMaterial({ map: source });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const before = atlas.face(material, [0, 0, 1, 1])!.sprite;
    atlas.clear();
    const after = atlas.face(material, [0, 0, 1, 1])!.sprite;
    expect(after.page).toBe(0);
    expect(after.x).toBe(before.x);
    expect(atlas.evidence().terrainAtlasCacheHits).toBe(0);
    atlas.clear(); material.dispose(); source.dispose();
  });
});

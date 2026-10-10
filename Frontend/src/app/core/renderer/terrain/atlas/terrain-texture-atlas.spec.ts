import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VanillaAssetProvider } from '../../../assets/vanilla/vanilla-asset-provider';
import { VanillaBlockVisualProvider } from '../../geometry/vanilla-block-visual-provider';
import type { PlacedBlock } from '../../../domain/project.types';
import { TerrainTextureAtlas, remapTerrainUvs, sampleAtlasUv } from './terrain-texture-atlas';

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
    expect(atlas.evidence()).toMatchObject({
      terrainAtlasSprites: 1,
      terrainAtlasInsertions: 1,
      terrainAtlasCacheHits: 1,
      terrainAtlasCompatibleFaces: 2,
    });
    const remapped = sampleAtlasUv(first.sprite, 0, 0);
    expect(remapped[0]).toBe(first.sprite.minU);
    expect(remapped[1]).toBe(first.sprite.maxV);
    atlas.clear();
    firstMaterial.dispose();
    secondMaterial.dispose();
    source.dispose();
  });

  it('returns strict fallback for an unsupported material or unavailable pixels', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    expect(atlas.face(material, [0, 0, 1, 0])).toBeUndefined();
    expect(atlas.evidence().terrainAtlasFallbackFaces).toBe(1);
    atlas.clear();
    material.dispose();
  });

  it('accepts DoubleSide in the production atlas while strict mode remains available', () => {
    const source = texture([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
    const material = new THREE.MeshBasicMaterial({ map: source, side: THREE.DoubleSide });
    const strict = new TerrainTextureAtlas({ width: 16, height: 16 }, 1, {
      allowDoubleSide: false,
    });
    const production = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const probe = new TerrainTextureAtlas({ width: 16, height: 16 }, 1, {
      allowDoubleSideForProbe: true,
    });
    expect(strict.face(material, [0, 0, 1, 0])).toBeUndefined();
    expect(production.face(material, [0, 0, 1, 0])).toBeDefined();
    expect(probe.face(material, [0, 0, 1, 0])).toBeDefined();
    strict.clear();
    production.clear();
    probe.clear();
    material.dispose();
    source.dispose();
  });

  it('maps asymmetric CPU page coordinates to the corrected GPU V contract', () => {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      const texel = index / 4;
      pixels[index] = texel & 0xff;
      pixels[index + 1] = 0;
      pixels[index + 2] = 255 - (texel & 0xff);
      pixels[index + 3] = 255;
    }
    const source = new THREE.DataTexture(pixels, 16, 16, THREE.RGBAFormat);
    source.flipY = true;
    source.magFilter = THREE.NearestFilter;
    source.minFilter = THREE.NearestFilter;
    source.generateMipmaps = false;
    source.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: source });
    const atlas = new TerrainTextureAtlas({ width: 1024, height: 1024 }, 1);
    const face = atlas.face(material, [0, 0, 1, 1])!;
    const sprite = face.sprite;
    expect([sprite.minU, sprite.minV, sprite.maxU, sprite.maxV]).toEqual([
      1 / 1024,
      1007 / 1024,
      17 / 1024,
      1023 / 1024,
    ]);
    expect(sampleAtlasUv(sprite, 0, 0)).toEqual([1 / 1024, 1023 / 1024]);
    expect(sampleAtlasUv(sprite, 1, 0)).toEqual([17 / 1024, 1023 / 1024]);
    expect(sampleAtlasUv(sprite, 0, 1)).toEqual([1 / 1024, 1007 / 1024]);
    expect(sampleAtlasUv(sprite, 1, 1)).toEqual([17 / 1024, 1007 / 1024]);
    expect(sampleAtlasUv(sprite, 0.5, 0.5)).toEqual([9 / 1024, 1015 / 1024]);
    expect(remapTerrainUvs([0, 0, 1, 0, 1, 1, 0, 1], sprite)).toEqual([
      1 / 1024,
      1023 / 1024,
      17 / 1024,
      1023 / 1024,
      17 / 1024,
      1007 / 1024,
      1 / 1024,
      1007 / 1024,
    ]);
    expect(atlas.pagePixel(sprite.page, sprite.x, sprite.y - 1)).toEqual([0, 0, 255, 255]);
    expect(atlas.pagePixel(sprite.page, sprite.x, sprite.y + sprite.height)).toEqual([
      240, 0, 15, 255,
    ]);
    atlas.clear();
    material.dispose();
    source.dispose();
  });

  it('keeps multiple asymmetric sprites in separate oriented rectangles', () => {
    const firstPixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const secondPixels = new Uint8Array([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    ]);
    const firstTexture = texture(Array.from(firstPixels));
    const secondTexture = texture(Array.from(secondPixels));
    const firstMaterial = new THREE.MeshBasicMaterial({ map: firstTexture });
    const secondMaterial = new THREE.MeshBasicMaterial({ map: secondTexture });
    const atlas = new TerrainTextureAtlas({ width: 32, height: 32 }, 1);
    const first = atlas.face(firstMaterial, [0, 0, 1, 1])!;
    const second = atlas.face(secondMaterial, [0, 0, 1, 1])!;
    expect(second.sprite.x).toBeGreaterThan(first.sprite.x);
    expect(sampleAtlasUv(first.sprite, 0, 0)[1]).toBe(first.sprite.maxV);
    expect(sampleAtlasUv(second.sprite, 1, 1)[1]).toBe(second.sprite.minV);
    expect(atlas.pagePixel(first.sprite.page, first.sprite.x, first.sprite.y)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(atlas.pagePixel(second.sprite.page, second.sprite.x, second.sprite.y)).toEqual([
      10, 20, 30, 255,
    ]);
    atlas.clear();
    firstMaterial.dispose();
    secondMaterial.dispose();
    firstTexture.dispose();
    secondTexture.dispose();
  });

  it('keeps the first sprite stable when a second texture is appended after upload', () => {
    const firstTexture = texture([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const secondTexture = texture([
      12, 34, 56, 255, 78, 90, 12, 255, 34, 56, 78, 255, 90, 12, 34, 255,
    ]);
    const firstMaterial = new THREE.MeshBasicMaterial({ map: firstTexture });
    const secondMaterial = new THREE.MeshBasicMaterial({ map: secondTexture });
    const atlas = new TerrainTextureAtlas({ width: 32, height: 32 }, 1);
    const first = atlas.face(firstMaterial, [0, 0, 1, 1])!;
    const pageTexture = atlas.pageTexture(first.sprite.page)!;
    const versionBefore = pageTexture.version;
    const second = atlas.face(secondMaterial, [0, 0, 1, 1])!;
    expect(second.sprite).not.toEqual(first.sprite);
    expect(first.sprite.x).toBe(1);
    expect(atlas.pageTexture(first.sprite.page)).toBe(pageTexture);
    expect(atlas.pageBufferMatchesTextureSource(first.sprite.page)).toBe(true);
    expect(atlas.refreshPage(first.sprite.page)).toBeGreaterThan(versionBefore);
    atlas.clear();
    firstMaterial.dispose();
    secondMaterial.dispose();
    firstTexture.dispose();
    secondTexture.dispose();
  });

  it('admits five real-provider vanilla terrain faces into the production atlas', async () => {
    const ids = ['stone', 'dirt', 'oak_planks', 'sandstone', 'oak_log'];
    const json: Record<string, unknown> = {
      'assets/minecraft/models/block/cube.json': {
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 16],
            faces: Object.fromEntries(
              ['down', 'up', 'north', 'south', 'west', 'east'].map((direction) => [
                direction,
                { texture: '#all' },
              ]),
            ),
          },
        ],
      },
      'assets/minecraft/models/block/cube_all.json': {
        parent: 'minecraft:block/cube',
        textures: { all: '#all' },
      },
    };
    const binary = new Map<string, Uint8Array>();
    for (const id of ids) {
      json[`assets/minecraft/blockstates/${id}.json`] = {
        variants: { '': { model: `minecraft:block/${id}` } },
      };
      json[`assets/minecraft/models/block/${id}.json`] = {
        parent: 'minecraft:block/cube_all',
        textures: { all: `minecraft:block/${id}` },
      };
      binary.set(`assets/minecraft/textures/block/${id}.png`, new Uint8Array([1]));
    }
    const assets = new VanillaAssetProvider('atlas-fixture', json, binary);
    const textures: THREE.Texture[] = [];
    const provider = new VanillaBlockVisualProvider(assets, async () => {
      const texture = new THREE.DataTexture(
        new Uint8Array([120, 80, 40, 255]),
        1,
        1,
        THREE.RGBAFormat,
      );
      texture.flipY = true;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      textures.push(texture);
      return texture as unknown as THREE.Texture<HTMLImageElement>;
    });
    const atlas = new TerrainTextureAtlas({ width: 64, height: 64 }, 1);
    for (const id of ids) {
      const block: PlacedBlock = {
        kind: 'resolved',
        id: `minecraft:${id}`,
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: id === 'oak_log' ? { axis: 'y' } : {},
      };
      const visual = await provider.create(block);
      visual.object?.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        const uv = object.geometry.getAttribute('uv');
        if (material && uv) atlas.face(material, Array.from(uv.array as ArrayLike<number>, Number));
      });
    }
    const evidence = atlas.evidence();
    expect(evidence.terrainAtlasCompatibleFaces).toBeGreaterThan(0);
    expect(evidence.terrainAtlasSprites).toBe(5);
    expect(evidence.terrainAtlasMaterials).toBeGreaterThan(0);
    atlas.clear();
    provider.dispose();
    for (const texture of textures) texture.dispose();
  });

  it('accepts a runtime-equivalent flipY=false source after explicit normalization', () => {
    const source = texture([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    source.flipY = false;
    const material = new THREE.MeshBasicMaterial({ map: source });
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    expect(atlas.face(material, [0, 0, 1, 0, 1, 1, 0, 1])).toBeDefined();
    expect(atlas.evidence().terrainAtlasSprites).toBe(1);
    atlas.clear();
    material.dispose();
    source.dispose();
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
    atlas.clear();
    material.dispose();
    source.dispose();
  });
});

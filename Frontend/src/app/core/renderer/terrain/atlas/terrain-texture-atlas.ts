import * as THREE from 'three';
import { TerrainAtlasLayout, type TerrainAtlasRect } from './terrain-atlas-layout';
import { terrainAtlasEligibility, terrainTextureSourceIdentity, type TerrainAtlasMaterialSemantics } from './terrain-atlas-compatibility';

export interface TerrainAtlasSprite {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
  readonly sourceIdentity: string;
}

export interface TerrainAtlasFace {
  readonly sprite: TerrainAtlasSprite;
  readonly material: THREE.Material;
  readonly bucketKey: string;
  readonly uvs: readonly number[];
}

export interface TerrainAtlasEvidence {
  readonly terrainAtlasPages: number;
  readonly terrainAtlasSprites: number;
  readonly terrainAtlasSpriteCacheHits: number;
  readonly terrainAtlasSpriteInsertions: number;
  readonly terrainAtlasMaterials: number;
  readonly terrainAtlasFaces: number;
  readonly terrainAtlasFallbackFaces: number;
  readonly terrainAtlasChunkMeshes: number;
}

interface AtlasPage {
  readonly index: number;
  readonly localIndex: number;
  readonly pixels: Uint8Array;
  readonly texture: THREE.DataTexture;
  readonly samplingKey: string;
}

interface PixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Owns fixed-size, append-only terrain pages and shared atlas materials. */
export class TerrainTextureAtlas {
  private readonly layouts = new Map<string, TerrainAtlasLayout>();
  private readonly pages: AtlasPage[] = [];
  private readonly sprites = new Map<string, TerrainAtlasSprite>();
  private readonly materials = new Map<string, THREE.Material>();
  private spriteCacheHits = 0;
  private spriteInsertions = 0;
  private terrainAtlasFaces = 0;
  private terrainAtlasFallbackFaces = 0;

  constructor(readonly pageSize = { width: 1024, height: 1024 }, readonly gutter = 1) {}

  face(material: THREE.Material, uvs: readonly number[]): TerrainAtlasFace | undefined {
    const eligibility = terrainAtlasEligibility(material);
    const map = (material as THREE.Material & { map?: THREE.Texture }).map;
    if (!eligibility.eligible || !eligibility.semantics || !map || uvs.length === 0 || uvs.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) { this.terrainAtlasFallbackFaces += 1; return undefined; }
    const pixels = readTexturePixels(map);
    if (!pixels) { this.terrainAtlasFallbackFaces += 1; return undefined; }
    const sprite = this.registerSprite(map, eligibility.semantics.samplingKey, pixels);
    if (!sprite) { this.terrainAtlasFallbackFaces += 1; return undefined; }
    this.terrainAtlasFaces += 1;
    const atlasMaterial = this.materialFor(sprite.page, material, eligibility.semantics);
    return { sprite, material: atlasMaterial, bucketKey: `${sprite.page}|${eligibility.semantics.key}`, uvs: remapTerrainUvs(uvs, sprite) };
  }

  evidence(): TerrainAtlasEvidence {
    return { terrainAtlasPages: this.pages.length, terrainAtlasSprites: this.sprites.size, terrainAtlasSpriteCacheHits: this.spriteCacheHits, terrainAtlasSpriteInsertions: this.spriteInsertions, terrainAtlasMaterials: this.materials.size, terrainAtlasFaces: this.terrainAtlasFaces, terrainAtlasFallbackFaces: this.terrainAtlasFallbackFaces, terrainAtlasChunkMeshes: 0 };
  }

  clear(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const page of this.pages) page.texture.dispose();
    this.materials.clear(); for (const layout of this.layouts.values()) layout.clear(); this.layouts.clear(); this.pages.length = 0; this.sprites.clear(); this.spriteCacheHits = 0; this.spriteInsertions = 0; this.terrainAtlasFaces = 0; this.terrainAtlasFallbackFaces = 0;
  }

  dispose(): void { this.clear(); }

  private registerSprite(texture: THREE.Texture, samplingKey: string, source: PixelSource): TerrainAtlasSprite | undefined {
    const sourceIdentity = terrainTextureSourceIdentity(texture);
    const key = `${samplingKey}|${sourceIdentity}`;
    const cached = this.sprites.get(key);
    if (cached) { this.spriteCacheHits += 1; return cached; }
    const layout = this.layouts.get(samplingKey) ?? new TerrainAtlasLayout(this.pageSize, this.gutter);
    this.layouts.set(samplingKey, layout);
    const rect = layout.allocate(source.width, source.height);
    if (!rect) return undefined;
    const page = this.page(samplingKey, rect.page, texture);
    const globalRect = { ...rect, page: page.index };
    copyWithExtrusion(page.pixels, this.pageSize.width, globalRect, source.data);
    page.texture.needsUpdate = true;
    const sprite: TerrainAtlasSprite = { page: page.index, x: rect.x, y: rect.y, width: rect.width, height: rect.height, minU: rect.x / this.pageSize.width, minV: rect.y / this.pageSize.height, maxU: (rect.x + rect.width) / this.pageSize.width, maxV: (rect.y + rect.height) / this.pageSize.height, sourceIdentity };
    this.sprites.set(key, sprite); this.spriteInsertions += 1;
    return sprite;
  }

  private page(samplingKey: string, localIndex: number, sourceTexture: THREE.Texture): AtlasPage {
    const existing = this.pages.find((page) => page.samplingKey === samplingKey && page.localIndex === localIndex);
    if (existing) return existing;
    const pixels = new Uint8Array(this.pageSize.width * this.pageSize.height * 4);
    const texture = new THREE.DataTexture(pixels, this.pageSize.width, this.pageSize.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.magFilter = sourceTexture.magFilter; texture.minFilter = sourceTexture.minFilter; texture.generateMipmaps = false; texture.flipY = sourceTexture.flipY; texture.colorSpace = sourceTexture.colorSpace; texture.premultiplyAlpha = sourceTexture.premultiplyAlpha; texture.needsUpdate = true;
    const page = { index: this.pages.length, localIndex, pixels, texture, samplingKey };
    this.pages.push(page);
    return page;
  }

  private materialFor(pageIndex: number, source: THREE.Material, semantics: TerrainAtlasMaterialSemantics): THREE.Material {
    const key = `${pageIndex}|${semantics.key}`;
    const cached = this.materials.get(key); if (cached) return cached;
    const material = source.clone();
    (material as THREE.Material & { map?: THREE.Texture }).map = this.pages[pageIndex].texture;
    material.userData['sharedTerrainAtlasMaterial'] = true;
    material.userData['terrainAtlasPage'] = pageIndex;
    material.needsUpdate = true;
    this.materials.set(key, material);
    return material;
  }
}

export function remapTerrainUvs(uvs: readonly number[], sprite: TerrainAtlasSprite): readonly number[] {
  const result: number[] = [];
  for (let index = 0; index < uvs.length; index += 2) {
    result.push(sprite.minU + uvs[index] * (sprite.maxU - sprite.minU), sprite.minV + uvs[index + 1] * (sprite.maxV - sprite.minV));
  }
  return result;
}

function readTexturePixels(texture: THREE.Texture): PixelSource | undefined {
  const image = texture.source?.data as { readonly width?: number; readonly height?: number; readonly data?: ArrayLike<number>; readonly src?: string; readonly currentSrc?: string } | undefined;
  const width = Number(image?.width ?? 0); const height = Number(image?.height ?? 0);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return undefined;
  if (image?.data && image.data.length >= width * height * 3) {
    const channels = image.data.length >= width * height * 4 ? 4 : 3;
    const rgba = new Uint8Array(width * height * 4);
    for (let source = 0, target = 0; target < rgba.length; source += channels, target += 4) { rgba[target] = Number(image.data[source]) || 0; rgba[target + 1] = Number(image.data[source + 1]) || 0; rgba[target + 2] = Number(image.data[source + 2]) || 0; rgba[target + 3] = channels === 4 ? Number(image.data[source + 3]) || 0 : 255; }
    return { width, height, data: rgba };
  }
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width, height }) : undefined;
    const context = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!canvas || !context || !('drawImage' in context)) return undefined;
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return { width, height, data: new Uint8Array(pixels) };
  } catch { return undefined; }
}

function copyWithExtrusion(target: Uint8Array, pageWidth: number, rect: TerrainAtlasRect, source: Uint8Array): void {
  const pixel = (x: number, y: number): number => (y * rect.width + x) * 4;
  const write = (x: number, y: number, sourceIndex: number) => { const index = (y * pageWidth + x) * 4; target[index] = source[sourceIndex]; target[index + 1] = source[sourceIndex + 1]; target[index + 2] = source[sourceIndex + 2]; target[index + 3] = source[sourceIndex + 3]; };
  for (let y = 0; y < rect.height; y += 1) for (let x = 0; x < rect.width; x += 1) write(rect.x + x, rect.y + y, pixel(x, y));
  for (let edge = 1; edge <= rect.gutter; edge += 1) {
    for (let x = 0; x < rect.width; x += 1) { write(rect.x + x, rect.y - edge, pixel(x, 0)); write(rect.x + x, rect.y + rect.height - 1 + edge, pixel(x, rect.height - 1)); }
    for (let y = 0; y < rect.height; y += 1) { write(rect.x - edge, rect.y + y, pixel(0, y)); write(rect.x + rect.width - 1 + edge, rect.y + y, pixel(rect.width - 1, y)); }
    write(rect.x - edge, rect.y - edge, pixel(0, 0)); write(rect.x + rect.width - 1 + edge, rect.y - edge, pixel(rect.width - 1, 0)); write(rect.x - edge, rect.y + rect.height - 1 + edge, pixel(0, rect.height - 1)); write(rect.x + rect.width - 1 + edge, rect.y + rect.height - 1 + edge, pixel(rect.width - 1, rect.height - 1));
  }
}

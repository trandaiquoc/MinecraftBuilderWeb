import * as THREE from 'three';
import { TerrainAtlasLayout, type TerrainAtlasRect } from './terrain-atlas-layout';
import {
  copyTerrainPixelsWithGutter,
  normalizeTerrainPixels,
  readTerrainTexturePixels,
  type TerrainPixelSource,
} from './terrain-atlas-pixels';
import {
  terrainAtlasEligibility,
  terrainTextureSourceIdentity,
  type TerrainAtlasEligibilityOptions,
  type TerrainAtlasMaterialSemantics,
} from './terrain-atlas-compatibility';

export type TerrainAtlasMode = 'off' | 'on';

/**
 * x/y are CPU page coordinates. U/V are final GPU sampling bounds after the
 * page's flipY upload; source V is intentionally interpolated in reverse.
 */
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
  readonly terrainAtlasCacheHits: number;
  readonly terrainAtlasInsertions: number;
  readonly terrainAtlasMaterials: number;
  readonly terrainAtlasCompatibleFaces: number;
  readonly terrainAtlasFallbackFaces: number;
  readonly terrainAtlasChunkBuckets: number;
}
interface AtlasPage {
  readonly index: number;
  readonly pixels: Uint8Array;
  readonly texture: THREE.DataTexture;
  readonly samplingKey: string;
}

/** Owns append-only page textures and shared atlas materials for terrain only. */
export class TerrainTextureAtlas {
  private readonly layouts = new Map<string, TerrainAtlasLayout>();
  private readonly pages: AtlasPage[] = [];
  private readonly sprites = new Map<string, TerrainAtlasSprite>();
  private readonly materials = new Map<string, THREE.Material>();
  private cacheHits = 0;
  private insertions = 0;
  private compatibleFaces = 0;
  private fallbackFaces = 0;

  constructor(
    readonly pageSize = { width: 1024, height: 1024 },
    readonly gutter = 1,
    private readonly eligibilityOptions: TerrainAtlasEligibilityOptions = { allowDoubleSide: true },
  ) {}

  face(material: THREE.Material, uvs: readonly number[]): TerrainAtlasFace | undefined {
    const eligibility = terrainAtlasEligibility(material, this.eligibilityOptions);
    const map = (material as THREE.Material & { map?: THREE.Texture }).map;
    if (
      !eligibility.eligible ||
      !eligibility.semantics ||
      !map ||
      uvs.length === 0 ||
      uvs.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    )
      return this.fallback();
    const raw = readTerrainTexturePixels(map);
    if (!raw) return this.fallback();
    const source = normalizeTerrainPixels(raw, map.flipY);
    const sprite = this.registerSprite(map, eligibility.semantics.samplingKey, source);
    if (!sprite) return this.fallback();
    this.compatibleFaces += 1;
    const atlasMaterial = this.materialFor(sprite.page, material, eligibility.semantics);
    return {
      sprite,
      material: atlasMaterial,
      bucketKey: `${sprite.page}|${eligibility.semantics.key}`,
      uvs: remapTerrainUvs(uvs, sprite),
    };
  }

  evidence(): TerrainAtlasEvidence {
    return {
      terrainAtlasPages: this.pages.length,
      terrainAtlasSprites: this.sprites.size,
      terrainAtlasCacheHits: this.cacheHits,
      terrainAtlasInsertions: this.insertions,
      terrainAtlasMaterials: this.materials.size,
      terrainAtlasCompatibleFaces: this.compatibleFaces,
      terrainAtlasFallbackFaces: this.fallbackFaces,
      terrainAtlasChunkBuckets: 0,
    };
  }
  /** Diagnostic-only copy of the content region represented by a sprite. */
  spritePixels(sprite: TerrainAtlasSprite): TerrainPixelSource | undefined {
    const page = this.pages[sprite.page];
    if (
      !page ||
      sprite.x < 0 ||
      sprite.y < 0 ||
      sprite.x + sprite.width > this.pageSize.width ||
      sprite.y + sprite.height > this.pageSize.height
    )
      return undefined;
    const data = new Uint8Array(sprite.width * sprite.height * 4);
    for (let y = 0; y < sprite.height; y += 1) {
      const sourceStart = ((sprite.y + y) * this.pageSize.width + sprite.x) * 4;
      data.set(
        page.pixels.subarray(sourceStart, sourceStart + sprite.width * 4),
        y * sprite.width * 4,
      );
    }
    return { width: sprite.width, height: sprite.height, data, route: 'atlas-page' };
  }
  /** Diagnostic-only page texture access; callers must not dispose or mutate it. */
  pageTexture(page: number): THREE.DataTexture | undefined {
    return this.pages[page]?.texture;
  }
  pageBufferMatchesTextureSource(page: number): boolean {
    const entry = this.pages[page];
    if (!entry) return false;
    const image = entry.texture.image as { readonly data?: unknown } | undefined;
    const source = entry.texture.source?.data as { readonly data?: unknown } | undefined;
    const sourceValue: unknown = entry.texture.source?.data;
    return (
      image?.data === entry.pixels || source?.data === entry.pixels || sourceValue === entry.pixels
    );
  }
  pagePixel(
    page: number,
    x: number,
    y: number,
  ): readonly [number, number, number, number] | undefined {
    const entry = this.pages[page];
    if (!entry || x < 0 || y < 0 || x >= this.pageSize.width || y >= this.pageSize.height)
      return undefined;
    const index = (y * this.pageSize.width + x) * 4;
    return [
      entry.pixels[index],
      entry.pixels[index + 1],
      entry.pixels[index + 2],
      entry.pixels[index + 3],
    ];
  }
  /** Diagnostic-only dirty mark used to compare one explicit post-upload refresh. */
  refreshPage(page: number): number | undefined {
    const texture = this.pages[page]?.texture;
    if (!texture) return undefined;
    texture.needsUpdate = true;
    return texture.version;
  }
  clear(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const page of this.pages) page.texture.dispose();
    for (const layout of this.layouts.values()) layout.clear();
    this.materials.clear();
    this.layouts.clear();
    this.pages.length = 0;
    this.sprites.clear();
    this.cacheHits = 0;
    this.insertions = 0;
    this.compatibleFaces = 0;
    this.fallbackFaces = 0;
  }
  dispose(): void {
    this.clear();
  }

  private fallback(): undefined {
    this.fallbackFaces += 1;
    return undefined;
  }

  private registerSprite(
    texture: THREE.Texture,
    samplingKey: string,
    source: TerrainPixelSource,
  ): TerrainAtlasSprite | undefined {
    const sourceIdentity = terrainTextureSourceIdentity(texture);
    const key = `${samplingKey}|${sourceIdentity}`;
    const existing = this.sprites.get(key);
    if (existing) {
      this.cacheHits += 1;
      return existing;
    }
    const layout =
      this.layouts.get(samplingKey) ?? new TerrainAtlasLayout(this.pageSize, this.gutter);
    this.layouts.set(samplingKey, layout);
    const rect = layout.allocate(source.width, source.height);
    if (!rect) return undefined;
    const page = this.ensurePage(samplingKey, rect.page, texture);
    copyTerrainPixelsWithGutter(
      page.pixels,
      this.pageSize.width,
      { ...rect, page: page.index },
      source,
    );
    page.texture.needsUpdate = true;
    const sprite = {
      page: page.index,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      minU: rect.x / this.pageSize.width,
      minV: 1 - (rect.y + rect.height) / this.pageSize.height,
      maxU: (rect.x + rect.width) / this.pageSize.width,
      maxV: 1 - rect.y / this.pageSize.height,
      sourceIdentity,
    };
    this.sprites.set(key, sprite);
    this.insertions += 1;
    return sprite;
  }

  private ensurePage(samplingKey: string, localPage: number, source: THREE.Texture): AtlasPage {
    const existing = this.pages.find(
      (page) =>
        page.samplingKey === samplingKey && page.index === this.pageIndex(samplingKey, localPage),
    );
    if (existing) return existing;
    const pixels = new Uint8Array(this.pageSize.width * this.pageSize.height * 4);
    const texture = new THREE.DataTexture(
      pixels,
      this.pageSize.width,
      this.pageSize.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.magFilter = source.magFilter;
    texture.minFilter = source.minFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;
    texture.colorSpace = source.colorSpace;
    texture.premultiplyAlpha = source.premultiplyAlpha;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    const page = { index: this.pages.length, pixels, texture, samplingKey };
    this.pages.push(page);
    return page;
  }

  private pageIndex(samplingKey: string, localPage: number): number {
    return this.pages.filter((page) => page.samplingKey === samplingKey)[localPage]?.index ?? -1;
  }

  private materialFor(
    page: number,
    source: THREE.Material,
    semantics: TerrainAtlasMaterialSemantics,
  ): THREE.Material {
    const key = `${page}|${semantics.key}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = source.clone();
    (material as THREE.Material & { map?: THREE.Texture }).map = this.pages[page].texture;
    material.userData['sharedTerrainAtlasMaterial'] = true;
    material.userData['terrainAtlasPage'] = page;
    material.needsUpdate = true;
    this.materials.set(key, material);
    return material;
  }
}

export function remapTerrainUvs(
  uvs: readonly number[],
  sprite: TerrainAtlasSprite,
): readonly number[] {
  return uvs.flatMap((value, index) =>
    index % 2 === 0
      ? [sprite.minU + value * (sprite.maxU - sprite.minU)]
      : [sprite.maxV - value * (sprite.maxV - sprite.minV)],
  );
}

export function sampleAtlasUv(
  sprite: TerrainAtlasSprite,
  u: number,
  v: number,
): readonly [number, number] {
  return [
    sprite.minU + u * (sprite.maxU - sprite.minU),
    sprite.maxV - v * (sprite.maxV - sprite.minV),
  ];
}

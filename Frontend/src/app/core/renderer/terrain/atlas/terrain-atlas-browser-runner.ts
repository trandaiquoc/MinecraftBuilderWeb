import * as THREE from 'three';
import type { PlacedBlock } from '../../../domain/project.types';
import type { BlockVisualProvider } from '../../geometry/block-model-geometry';
import { TerrainTextureAtlas, sampleAtlasUv, type TerrainAtlasFace, type TerrainAtlasSprite } from './terrain-texture-atlas';
import { normalizeTerrainPixels, readTerrainTexturePixels, summarizeTerrainPixels, type TerrainPixelSource, type TerrainPixelSummary, type TerrainPixelExtractionRoute } from './terrain-atlas-pixels';
import type { TerrainAtlasGpuProbeDraw, TerrainAtlasGpuProbeResult } from './terrain-atlas-gpu-probe';

export interface TerrainAtlasBrowserProbeHost {
  runTerrainAtlasGpuProbe(source: TerrainAtlasGpuProbeDraw, atlas: TerrainAtlasGpuProbeDraw, size?: number): TerrainAtlasGpuProbeResult | undefined;
}

export interface TerrainAtlasBrowserTextureMetadata {
  readonly type: string;
  readonly sourceDataType: string;
  readonly width: number;
  readonly height: number;
  readonly flipY: boolean;
  readonly colorSpace: string;
  readonly magFilter: number;
  readonly minFilter: number;
  readonly generateMipmaps: boolean;
}

export interface TerrainAtlasBrowserMaterialMetadata {
  readonly type: string;
  readonly side: number;
  readonly alphaTest: number;
}

export interface TerrainAtlasBrowserUvProbe {
  readonly name: 'first-vertex' | 'center' | 'last-vertex';
  readonly u: number;
  readonly v: number;
  readonly texelX: number;
  readonly texelY: number;
  readonly insideSprite: boolean;
  readonly region: 'sprite' | 'gutter' | 'outside';
}

export interface TerrainAtlasBrowserProbeResult {
  readonly ok: boolean;
  readonly block: string;
  readonly state: Readonly<Record<string, string>>;
  readonly stage?: string;
  readonly reason?: string;
  readonly sourceTexture?: TerrainAtlasBrowserTextureMetadata;
  readonly sourceMaterial?: TerrainAtlasBrowserMaterialMetadata;
  readonly extractionRoute?: TerrainPixelExtractionRoute | 'unsupported';
  readonly sourcePixels?: TerrainPixelSummary;
  readonly normalizedPixels?: TerrainPixelSummary;
  readonly atlasSprite?: TerrainAtlasSprite;
  readonly atlasPageSpritePixels?: TerrainPixelSummary;
  readonly uvProbes?: readonly TerrainAtlasBrowserUvProbe[];
  readonly gpu?: TerrainAtlasGpuProbeResult;
}

declare global {
  interface Window {
    __minecraftBuilderDiagnostics?: {
      runTerrainAtlasProbe?: (blockId?: string, state?: Readonly<Record<string, string>>) => Promise<TerrainAtlasBrowserProbeResult>;
    };
  }
}

/**
 * Runs the existing source-vs-atlas probe against the provider currently used
 * by the editor. This is intentionally an explicit dev diagnostic and never
 * participates in normal scene hydration or production atlas eligibility.
 */
export async function runTerrainAtlasProbe(
  host: TerrainAtlasBrowserProbeHost,
  provider: Pick<BlockVisualProvider, 'create'> | undefined,
  blockId = 'minecraft:stone',
  state: Readonly<Record<string, string>> = {},
): Promise<TerrainAtlasBrowserProbeResult> {
  const base = { block: blockId, state: { ...state } };
  if (!provider) return { ...base, ok: false, stage: 'provider', reason: 'No active Vanilla visual provider is available.' };

  let atlas: TerrainTextureAtlas | undefined;
  let sourceGeometry: THREE.BufferGeometry | undefined;
  let atlasGeometry: THREE.BufferGeometry | undefined;
  let sourceMaterial: THREE.Material | undefined;
  let providerVisual: THREE.Object3D | undefined;
  try {
    const location = blockId.split(':', 2);
    const block: PlacedBlock = { kind: 'resolved', id: blockId, namespace: location.length === 2 ? location[0] : 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { ...state } };
    const visual = await provider.create(block);
    providerVisual = visual.object;
    const face = findProbeFace(providerVisual);
    if (!face) return { ...base, ok: false, stage: 'source-face', reason: 'The active provider did not produce a textured normal block face.' };
    const sourceMap = materialMap(face.material);
    if (!sourceMap) return { ...base, ok: false, stage: 'source-texture', reason: 'The provider face has no texture map.' };
    const uvAttribute = face.geometry.getAttribute('uv');
    if (!uvAttribute || uvAttribute.itemSize !== 2 || uvAttribute.count === 0) return { ...base, ok: false, stage: 'source-uv', reason: 'The provider face has no usable UV attribute.' };
    const uvs = Array.from(uvAttribute.array as ArrayLike<number>, Number);
    const rawPixels = readTerrainTexturePixels(sourceMap);
    const sourcePixels = rawPixels ? summarizeTerrainPixels(rawPixels) : undefined;
    const normalizedPixels = rawPixels ? summarizeTerrainPixels(normalizeTerrainPixels(rawPixels, sourceMap.flipY)) : undefined;
    atlas = new TerrainTextureAtlas({ width: 1024, height: 1024 }, 1, { allowDoubleSideForProbe: true });
    sourceGeometry = face.geometry.clone();
    // The existing probe camera looks down -Z from z=0. Keep the provider face
    // geometry intact semantically, but move this temporary draw in front of
    // that camera rather than changing the provider/world transform.
    sourceGeometry.translate(0, 0, -1.5);
    sourceMaterial = face.material.clone();
    const atlasFace = atlas.face(sourceMaterial, uvs);
    if (!atlasFace) return { ...base, ok: false, stage: 'atlas-conversion', reason: 'The source face was rejected by the probe-only atlas compatibility policy.', sourceTexture: textureMetadata(sourceMap), sourceMaterial: materialMetadata(sourceMaterial), extractionRoute: rawPixels?.route ?? 'unsupported', sourcePixels, normalizedPixels };
    atlasGeometry = sourceGeometry.clone();
    atlasGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(atlasFace.uvs, 2));
    const gpu = host.runTerrainAtlasGpuProbe({ geometry: sourceGeometry, material: sourceMaterial }, { geometry: atlasGeometry, material: atlasFace.material });
    if (!gpu) return { ...base, ok: false, stage: 'renderer', reason: 'The viewport WebGL renderer is not mounted.', sourceTexture: textureMetadata(sourceMap), sourceMaterial: materialMetadata(sourceMaterial), extractionRoute: rawPixels?.route ?? 'unsupported', sourcePixels, normalizedPixels, atlasSprite: atlasFace.sprite, atlasPageSpritePixels: atlasSpritePixels(atlas, atlasFace), uvProbes: atlasUvProbes(atlasFace.sprite, atlasFace.uvs, atlas.pageSize) };
    return { ...base, ok: true, sourceTexture: textureMetadata(sourceMap), sourceMaterial: materialMetadata(sourceMaterial), extractionRoute: rawPixels?.route ?? 'unsupported', sourcePixels, normalizedPixels, atlasSprite: atlasFace.sprite, atlasPageSpritePixels: atlasSpritePixels(atlas, atlasFace), uvProbes: atlasUvProbes(atlasFace.sprite, atlasFace.uvs, atlas.pageSize), gpu };
  } catch (error) {
    return { ...base, ok: false, stage: 'exception', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    atlas?.dispose();
    atlasGeometry?.dispose();
    sourceGeometry?.dispose();
    sourceMaterial?.dispose();
    // The visual and its texture/material cache belong to the active provider.
    // Deliberately do not dispose providerVisual or anything reachable from it.
    void providerVisual;
  }
}

interface ProbeFace { readonly geometry: THREE.BufferGeometry; readonly material: THREE.Material; readonly direction?: string; }

function findProbeFace(root: THREE.Object3D | undefined): ProbeFace | undefined {
  if (!root) return undefined;
  const meshes: ProbeFace[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const material = materials.find((candidate) => !!materialMap(candidate)) ?? materials[0];
    if (material) meshes.push({ geometry: object.geometry, material, direction: typeof object.userData['face'] === 'string' ? object.userData['face'] : undefined });
  });
  return meshes.find((face) => face.direction === 'south' && !!materialMap(face.material))
    ?? meshes.find((face) => !!materialMap(face.material))
    ?? meshes.find((face) => face.direction === 'south')
    ?? meshes[0];
}

function materialMap(material: THREE.Material): THREE.Texture | undefined {
  const map = (material as THREE.Material & { map?: THREE.Texture }).map;
  return map instanceof THREE.Texture ? map : undefined;
}

function textureMetadata(texture: THREE.Texture): TerrainAtlasBrowserTextureMetadata {
  const source = texture.source?.data as { readonly width?: number; readonly height?: number } | undefined;
  const image = texture.image as { readonly width?: number; readonly height?: number } | undefined;
  return { type: texture.constructor.name, sourceDataType: constructorName(texture.source?.data), width: Number(source?.width ?? image?.width ?? 0), height: Number(source?.height ?? image?.height ?? 0), flipY: texture.flipY, colorSpace: texture.colorSpace, magFilter: texture.magFilter, minFilter: texture.minFilter, generateMipmaps: texture.generateMipmaps };
}

function materialMetadata(material: THREE.Material): TerrainAtlasBrowserMaterialMetadata {
  return { type: material.constructor.name, side: material.side, alphaTest: material.alphaTest };
}

function constructorName(value: unknown): string {
  if (value === null || value === undefined) return 'undefined';
  if (typeof value === 'object' || typeof value === 'function') return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
  return typeof value;
}

function atlasSpritePixels(atlas: TerrainTextureAtlas, face: TerrainAtlasFace): TerrainPixelSummary | undefined {
  const pixels: TerrainPixelSource | undefined = atlas.spritePixels(face.sprite);
  return pixels ? summarizeTerrainPixels(pixels) : undefined;
}

function atlasUvProbes(sprite: TerrainAtlasSprite, uvs: readonly number[], pageSize: { readonly width: number; readonly height: number }): readonly TerrainAtlasBrowserUvProbe[] {
  const [centerU, centerV] = sampleAtlasUv(sprite, .5, .5);
  const values: readonly [string, number, number][] = [
    ['first-vertex', uvs[0] ?? 0, uvs[1] ?? 0],
    ['center', centerU, centerV],
    ['last-vertex', uvs.at(-2) ?? 0, uvs.at(-1) ?? 0],
  ];
  return values.map(([name, u, v]) => {
    const texelX = Math.floor(u * pageSize.width);
    const texelY = Math.floor(v * pageSize.height);
    const inSprite = texelX >= sprite.x && texelX < sprite.x + sprite.width && texelY >= sprite.y && texelY < sprite.y + sprite.height;
    const gutter = !inSprite && texelX >= sprite.x - 1 && texelX < sprite.x + sprite.width + 1 && texelY >= sprite.y - 1 && texelY < sprite.y + sprite.height + 1;
    return { name: name as TerrainAtlasBrowserUvProbe['name'], u, v, texelX, texelY, insideSprite: inSprite, region: inSprite ? 'sprite' : gutter ? 'gutter' : 'outside' };
  });
}

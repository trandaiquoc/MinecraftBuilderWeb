import * as THREE from 'three';
import type { PlacedBlock } from '../../../domain/project.types';
import type { BlockVisualProvider } from '../../geometry/vanilla-block-visual-provider';
import { TerrainTextureAtlas, sampleAtlasUv, type TerrainAtlasFace, type TerrainAtlasSprite } from './terrain-texture-atlas';
import { normalizeTerrainPixels, readTerrainTexturePixels, summarizeTerrainPixels, type TerrainPixelSource, type TerrainPixelSummary, type TerrainPixelExtractionRoute } from './terrain-atlas-pixels';
import type { TerrainAtlasFramebufferEvidence, TerrainAtlasGpuProbeDraw, TerrainAtlasGpuProbeResult, TerrainAtlasGpuProbeVariantsResult, TerrainAtlasGpuProbeVariantDraw } from './terrain-atlas-gpu-probe';
import type { ViewportRuntimeTraceApi } from '../../diagnostics/viewport-runtime-trace';

export interface TerrainAtlasBrowserProbeHost {
  runTerrainAtlasGpuProbeVariants?(source: TerrainAtlasGpuProbeDraw, variants: readonly TerrainAtlasGpuProbeVariantDraw[], size?: number, beforeVariant?: (name: string) => void): TerrainAtlasGpuProbeVariantsResult | undefined;
  runTerrainAtlasGpuProbe?(source: TerrainAtlasGpuProbeDraw, atlas: TerrainAtlasGpuProbeDraw, size?: number): TerrainAtlasGpuProbeResult | undefined;
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
  readonly transparent: boolean;
  readonly opacity: number;
  readonly depthWrite: boolean;
  readonly depthTest: boolean;
  readonly blending: number;
  readonly color: string;
  readonly mapFlipY?: boolean;
  readonly mapMatchesAtlasPage?: boolean;
}

export interface TerrainAtlasBrowserPageTextureMetadata extends TerrainAtlasBrowserTextureMetadata {
  readonly premultiplyAlpha: boolean;
  readonly unpackAlignment: number;
  readonly format: number;
  readonly typeValue: number;
  readonly wrapS: number;
  readonly wrapT: number;
  readonly versionBeforeGpu: number;
  readonly versionAfterProbe: number;
  readonly versionAfterRefresh?: number;
  readonly pageBufferMatchesTextureSource: boolean;
}

export interface TerrainAtlasBrowserPageByteProbes {
  readonly spriteCenter?: readonly [number, number, number, number];
  readonly topLeftContent?: readonly [number, number, number, number];
  readonly bottomRightContent?: readonly [number, number, number, number];
  readonly gutter?: readonly [number, number, number, number];
  readonly emptyPage?: readonly [number, number, number, number];
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
  readonly atlasTexture?: TerrainAtlasBrowserPageTextureMetadata;
  readonly atlasMaterial?: TerrainAtlasBrowserMaterialMetadata;
  readonly atlasPageByteProbes?: TerrainAtlasBrowserPageByteProbes;
  readonly extractionRoute?: TerrainPixelExtractionRoute | 'unsupported';
  readonly sourcePixels?: TerrainPixelSummary;
  readonly normalizedPixels?: TerrainPixelSummary;
  readonly atlasSprite?: TerrainAtlasSprite;
  readonly atlasPageSpritePixels?: TerrainPixelSummary;
  readonly uvProbes?: readonly TerrainAtlasBrowserUvProbe[];
  readonly uvProbesByVariant?: Readonly<Record<string, readonly TerrainAtlasBrowserUvProbe[]>>;
  readonly gpu?: TerrainAtlasBrowserGpuEvidence;
}

export interface TerrainAtlasBrowserGpuEvidence {
  readonly source?: TerrainAtlasFramebufferEvidence;
  readonly current?: TerrainAtlasFramebufferEvidence;
  readonly center?: TerrainAtlasFramebufferEvidence;
  readonly mirroredCenter?: TerrainAtlasFramebufferEvidence;
  readonly mirroredCurrent?: TerrainAtlasFramebufferEvidence;
  readonly noAlphaTest?: TerrainAtlasFramebufferEvidence;
  readonly geometryControl?: TerrainAtlasFramebufferEvidence;
  readonly currentBeforeRefresh?: TerrainAtlasFramebufferEvidence;
  readonly currentAfterRefresh?: TerrainAtlasFramebufferEvidence;
  readonly currentParity?: boolean;
  readonly sourceGlError: number;
  readonly diagnosis: TerrainAtlasGpuDiagnosis;
}

export type TerrainAtlasGpuDiagnosis = 'parity' | 'current-uv' | 'vertical-orientation' | 'atlas-upload-or-material' | 'inconclusive';

declare global {
  interface Window {
    __minecraftBuilderDiagnostics?: {
      runTerrainAtlasProbe?: (blockId?: string, state?: Readonly<Record<string, string>>) => Promise<TerrainAtlasBrowserProbeResult>;
      viewportTrace?: ViewportRuntimeTraceApi;
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
  let centerGeometry: THREE.BufferGeometry | undefined;
  let mirroredCenterGeometry: THREE.BufferGeometry | undefined;
  let mirroredCurrentGeometry: THREE.BufferGeometry | undefined;
  let refreshGeometry: THREE.BufferGeometry | undefined;
  let geometryControlGeometry: THREE.BufferGeometry | undefined;
  let sourceMaterial: THREE.Material | undefined;
  let noAlphaTestMaterial: THREE.Material | undefined;
  let geometryControlMaterial: THREE.Material | undefined;
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
    const centerUvs = centerUvArray(atlasFace.sprite, atlasFace.uvs);
    const mirroredCenterUvs = mirrorUvV(centerUvs);
    const mirroredCurrentUvs = mirrorUvV(atlasFace.uvs);
    centerGeometry = geometryWithUvs(atlasGeometry, centerUvs);
    mirroredCenterGeometry = geometryWithUvs(atlasGeometry, mirroredCenterUvs);
    mirroredCurrentGeometry = geometryWithUvs(atlasGeometry, mirroredCurrentUvs);
    refreshGeometry = atlasGeometry.clone();
    noAlphaTestMaterial = atlasFace.material.clone();
    noAlphaTestMaterial.alphaTest = 0;
    noAlphaTestMaterial.needsUpdate = true;
    geometryControlMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    geometryControlGeometry = atlasGeometry.clone();
    const variants: TerrainAtlasGpuProbeVariantDraw[] = [
      { name: 'current', geometry: atlasGeometry, material: atlasFace.material },
      { name: 'center', geometry: centerGeometry, material: atlasFace.material },
      { name: 'mirroredCenter', geometry: mirroredCenterGeometry, material: atlasFace.material },
      { name: 'mirroredCurrent', geometry: mirroredCurrentGeometry, material: atlasFace.material },
      { name: 'noAlphaTest', geometry: refreshGeometry, material: noAlphaTestMaterial },
      { name: 'geometryControl', geometry: geometryControlGeometry, material: geometryControlMaterial },
      { name: 'currentAfterRefresh', geometry: atlasGeometry, material: atlasFace.material },
    ];
    const pageTexture = atlas.pageTexture(atlasFace.sprite.page);
    const versionBeforeGpu = pageTexture?.version ?? -1;
    let versionAfterRefresh: number | undefined;
    const gpu = host.runTerrainAtlasGpuProbeVariants
      ? host.runTerrainAtlasGpuProbeVariants({ geometry: sourceGeometry, material: sourceMaterial }, variants, 32, (name) => { if (name === 'currentAfterRefresh') versionAfterRefresh = atlas!.refreshPage(atlasFace.sprite.page); })
      : legacyGpuResult(host, { geometry: sourceGeometry, material: sourceMaterial }, { geometry: atlasGeometry, material: atlasFace.material });
    if (!gpu) return { ...base, ok: false, stage: 'renderer', reason: 'The viewport WebGL renderer is not mounted.', sourceTexture: textureMetadata(sourceMap), sourceMaterial: materialMetadata(sourceMaterial), extractionRoute: rawPixels?.route ?? 'unsupported', sourcePixels, normalizedPixels, atlasSprite: atlasFace.sprite, atlasPageSpritePixels: atlasSpritePixels(atlas, atlasFace), uvProbes: atlasUvProbes(atlasFace.sprite, atlasFace.uvs, atlas.pageSize) };
    const pageTextureAfter = atlas.pageTexture(atlasFace.sprite.page);
    const atlasTexture = pageTextureAfter ? pageTextureMetadata(atlas, atlasFace.sprite.page, pageTextureAfter, versionBeforeGpu, versionAfterRefresh) : undefined;
    const atlasMaterial = materialMetadata(atlasFace.material, pageTextureAfter);
    const gpuEvidence = gpuVariantsToEvidence(gpu);
    const uvProbesByVariant = { current: atlasUvProbes(atlasFace.sprite, atlasFace.uvs, atlas.pageSize), center: atlasUvProbes(atlasFace.sprite, centerUvs, atlas.pageSize), mirroredCenter: atlasUvProbes(atlasFace.sprite, mirroredCenterUvs, atlas.pageSize), mirroredCurrent: atlasUvProbes(atlasFace.sprite, mirroredCurrentUvs, atlas.pageSize) };
    return { ...base, ok: true, sourceTexture: textureMetadata(sourceMap), sourceMaterial: materialMetadata(sourceMaterial), atlasTexture, atlasMaterial, atlasPageByteProbes: atlasPageByteProbes(atlas, atlasFace.sprite), extractionRoute: rawPixels?.route ?? 'unsupported', sourcePixels, normalizedPixels, atlasSprite: atlasFace.sprite, atlasPageSpritePixels: atlasSpritePixels(atlas, atlasFace), uvProbes: uvProbesByVariant.current, uvProbesByVariant, gpu: { ...gpuEvidence, diagnosis: classifyTerrainAtlasGpuResult(gpuEvidence) } };
  } catch (error) {
    return { ...base, ok: false, stage: 'exception', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    atlas?.dispose();
    atlasGeometry?.dispose();
    centerGeometry?.dispose();
    mirroredCenterGeometry?.dispose();
    mirroredCurrentGeometry?.dispose();
    refreshGeometry?.dispose();
    geometryControlGeometry?.dispose();
    sourceGeometry?.dispose();
    sourceMaterial?.dispose();
    noAlphaTestMaterial?.dispose();
    geometryControlMaterial?.dispose();
    // The visual and its texture/material cache belong to the active provider.
    // Deliberately do not dispose providerVisual or anything reachable from it.
    void providerVisual;
  }
}

function legacyGpuResult(host: TerrainAtlasBrowserProbeHost, source: TerrainAtlasGpuProbeDraw, atlas: TerrainAtlasGpuProbeDraw): TerrainAtlasGpuProbeVariantsResult | undefined {
  const result = host.runTerrainAtlasGpuProbe?.(source, atlas);
  if (!result) return undefined;
  return { source: result.source, variants: result.atlas ? { current: result.atlas } : {}, parityByVariant: { current: result.parity }, sourceGlError: result.sourceGlError, failureStage: result.failureStage === 'atlas-render' ? 'variant-render' : result.failureStage };
}

function gpuVariantsToEvidence(result: TerrainAtlasGpuProbeVariantsResult): Omit<TerrainAtlasBrowserGpuEvidence, 'diagnosis'> {
  return { source: result.source, current: result.variants['current'], center: result.variants['center'], mirroredCenter: result.variants['mirroredCenter'], mirroredCurrent: result.variants['mirroredCurrent'], noAlphaTest: result.variants['noAlphaTest'], geometryControl: result.variants['geometryControl'], currentBeforeRefresh: result.variants['current'], currentAfterRefresh: result.variants['currentAfterRefresh'], currentParity: result.parityByVariant['current'], sourceGlError: result.sourceGlError };
}

export function classifyTerrainAtlasGpuResult(gpu: Omit<TerrainAtlasBrowserGpuEvidence, 'diagnosis'>): TerrainAtlasGpuDiagnosis {
  const visible = (evidence: TerrainAtlasFramebufferEvidence | undefined): boolean => !!evidence && evidence.nonTransparentPixels > 0 && (evidence.glError ?? 0) === 0;
  const source = visible(gpu.source);
  const current = visible(gpu.current);
  const center = visible(gpu.center);
  const mirroredCenter = visible(gpu.mirroredCenter);
  const mirroredCurrent = visible(gpu.mirroredCurrent);
  if (source && current && (gpu.currentParity === true || (gpu.currentParity === undefined && gpu.source?.checksum === gpu.current?.checksum))) return 'parity';
  if (source && !current && center) return 'current-uv';
  if (source && !center && (mirroredCenter || mirroredCurrent)) return 'vertical-orientation';
  if (source && !current && !center && !mirroredCenter && !mirroredCurrent && visible(gpu.geometryControl)) return 'atlas-upload-or-material';
  return 'inconclusive';
}

function centerUvArray(sprite: TerrainAtlasSprite, uvs: readonly number[]): readonly number[] {
  const [u, v] = sampleAtlasUv(sprite, .5, .5);
  return uvs.map((_, index) => index % 2 === 0 ? u : v);
}

function mirrorUvV(uvs: readonly number[]): readonly number[] { return uvs.map((value, index) => index % 2 === 0 ? value : 1 - value); }

function geometryWithUvs(source: THREE.BufferGeometry, uvs: readonly number[]): THREE.BufferGeometry {
  const geometry = source.clone();
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function pageTextureMetadata(atlas: TerrainTextureAtlas, page: number, texture: THREE.DataTexture, versionBeforeGpu: number, versionAfterRefresh: number | undefined): TerrainAtlasBrowserPageTextureMetadata {
  const base = textureMetadata(texture);
  const result = { ...base, premultiplyAlpha: texture.premultiplyAlpha, unpackAlignment: texture.unpackAlignment, format: texture.format, typeValue: texture.type, wrapS: texture.wrapS, wrapT: texture.wrapT, versionBeforeGpu, versionAfterProbe: texture.version, pageBufferMatchesTextureSource: atlas.pageBufferMatchesTextureSource(page) };
  return versionAfterRefresh === undefined ? result : { ...result, versionAfterRefresh };
}

function atlasPageByteProbes(atlas: TerrainTextureAtlas, sprite: TerrainAtlasSprite): TerrainAtlasBrowserPageByteProbes {
  const center = atlas.pagePixel(sprite.page, sprite.x + Math.floor(sprite.width / 2), sprite.y + Math.floor(sprite.height / 2));
  const topLeft = atlas.pagePixel(sprite.page, sprite.x, sprite.y);
  const bottomRight = atlas.pagePixel(sprite.page, sprite.x + sprite.width - 1, sprite.y + sprite.height - 1);
  const gutter = atlas.gutter > 0 ? atlas.pagePixel(sprite.page, sprite.x - 1, sprite.y) : undefined;
  const empty = atlas.pagePixel(sprite.page, atlas.pageSize.width - 1, atlas.pageSize.height - 1);
  return { spriteCenter: center, topLeftContent: topLeft, bottomRightContent: bottomRight, gutter, emptyPage: empty };
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

function materialMetadata(material: THREE.Material, expectedMap?: THREE.Texture): TerrainAtlasBrowserMaterialMetadata {
  const map = materialMap(material);
  return { type: material.constructor.name, side: material.side, alphaTest: material.alphaTest, transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite, depthTest: material.depthTest, blending: material.blending, color: 'color' in material && material.color instanceof THREE.Color ? `#${material.color.getHexString()}` : '#ffffff', ...(map ? { mapFlipY: map.flipY, mapMatchesAtlasPage: expectedMap ? map === expectedMap : undefined } : {}) };
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
    // DataTexture uploads this page with flipY=true. Keep the public GPU UV
    // unchanged, but convert it back to CPU page coordinates for this probe.
    const texelY = Math.floor((1 - v) * pageSize.height);
    const inSprite = texelX >= sprite.x && texelX < sprite.x + sprite.width && texelY >= sprite.y && texelY < sprite.y + sprite.height;
    const gutter = !inSprite && texelX >= sprite.x - 1 && texelX < sprite.x + sprite.width + 1 && texelY >= sprite.y - 1 && texelY < sprite.y + sprite.height + 1;
    return { name: name as TerrainAtlasBrowserUvProbe['name'], u, v, texelX, texelY, insideSprite: inSprite, region: inSprite ? 'sprite' : gutter ? 'gutter' : 'outside' };
  });
}

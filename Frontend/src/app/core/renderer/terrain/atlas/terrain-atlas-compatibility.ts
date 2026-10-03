import * as THREE from 'three';

export interface TerrainAtlasMaterialSemantics {
  readonly key: string;
  readonly samplingKey: string;
}

export interface TerrainAtlasEligibility {
  readonly eligible: boolean;
  readonly semantics?: TerrainAtlasMaterialSemantics;
}

/**
 * Terrain-only material contract. The generic instance compatibility key is
 * intentionally left untouched: atlas merging is safe only for proven opaque
 * static terrain materials.
 */
export function terrainAtlasEligibility(material: THREE.Material): TerrainAtlasEligibility {
  const candidate = material as THREE.Material & {
    map?: THREE.Texture;
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    opacity?: number;
    alphaTest?: number;
    side?: number;
    vertexColors?: boolean;
    flatShading?: boolean;
    transparent?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
    blending?: number;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  };
  const map = candidate.map;
  const depthWrite = candidate.depthWrite !== false;
  const depthTest = candidate.depthTest !== false;
  if (!(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial)) return { eligible: false };
  if (!map || candidate.transparent || !depthWrite || !depthTest || candidate.blending !== THREE.NormalBlending || candidate.opacity !== undefined && candidate.opacity !== 1) return { eligible: false };
  if (candidate.side !== undefined && candidate.side !== THREE.FrontSide && candidate.side !== THREE.DoubleSide) return { eligible: false };
  const vertexColors = !!candidate.vertexColors;
  const flatShading = !!candidate.flatShading;
  const polygonOffset = !!candidate.polygonOffset;
  if (vertexColors || flatShading || polygonOffset) return { eligible: false };
  if (map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping || map.offset.x !== 0 || map.offset.y !== 0 || map.repeat.x !== 1 || map.repeat.y !== 1 || map.rotation !== 0 || map.center.x !== 0 || map.center.y !== 0 || map.anisotropy > 1) return { eligible: false };
  const samplingKey = [map.wrapS, map.wrapT, map.flipY ? 1 : 0, map.colorSpace, map.premultiplyAlpha ? 1 : 0, map.magFilter, map.minFilter, map.generateMipmaps ? 1 : 0, map.offset.x, map.offset.y, map.repeat.x, map.repeat.y, map.rotation, map.center.x, map.center.y].join('|');
  const key = [material.type, candidate.color?.getHexString() ?? 'ffffff', candidate.emissive?.getHexString() ?? '', candidate.emissiveIntensity ?? 0, candidate.opacity ?? 1, candidate.alphaTest ?? 0, candidate.side ?? THREE.FrontSide, depthWrite ? 1 : 0, depthTest ? 1 : 0, candidate.blending ?? THREE.NormalBlending, vertexColors ? 1 : 0, flatShading ? 1 : 0, polygonOffset ? 1 : 0, samplingKey].join('|');
  return { eligible: true, semantics: { key, samplingKey } };
}

export function terrainTextureSourceIdentity(texture: THREE.Texture): string {
  const source = texture.source;
  const image = source?.data as { readonly src?: string; readonly currentSrc?: string; readonly width?: number; readonly height?: number; readonly name?: string } | undefined;
  return [source?.uuid ?? '', image?.currentSrc ?? image?.src ?? image?.name ?? '', image?.width ?? 0, image?.height ?? 0].join('|');
}

export function supportedTerrainUv(uvs: readonly number[]): boolean {
  return uvs.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

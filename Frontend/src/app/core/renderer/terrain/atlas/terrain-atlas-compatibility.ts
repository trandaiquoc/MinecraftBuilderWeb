import * as THREE from 'three';

export interface TerrainAtlasMaterialSemantics { readonly key: string; readonly samplingKey: string; }
export interface TerrainAtlasEligibility { readonly eligible: boolean; readonly semantics?: TerrainAtlasMaterialSemantics; }

/** A deliberately narrower contract than the generic material compatibility key. */
export function terrainAtlasEligibility(material: THREE.Material): TerrainAtlasEligibility {
  const candidate = material as THREE.Material & { map?: THREE.Texture; color?: THREE.Color; opacity?: number; alphaTest?: number; side?: number; transparent?: boolean; depthWrite?: boolean; depthTest?: boolean; blending?: number; vertexColors?: boolean; flatShading?: boolean; polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number };
  const map = candidate.map;
  if (!(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial) || !map) return { eligible: false };
  const depthWrite = candidate.depthWrite !== false;
  const depthTest = candidate.depthTest !== false;
  const opacity = candidate.opacity ?? 1;
  const blending = candidate.blending ?? THREE.NormalBlending;
  if (candidate.transparent || !depthWrite || !depthTest || opacity !== 1 || blending !== THREE.NormalBlending) return { eligible: false };
  if (candidate.side !== undefined && candidate.side !== THREE.FrontSide) return { eligible: false };
  if (candidate.vertexColors || candidate.flatShading || candidate.polygonOffset) return { eligible: false };
  if (map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping || map.offset.x !== 0 || map.offset.y !== 0 || map.repeat.x !== 1 || map.repeat.y !== 1 || map.rotation !== 0 || map.center.x !== 0 || map.center.y !== 0 || map.anisotropy > 1) return { eligible: false };
  const samplingKey = [map.colorSpace, map.premultiplyAlpha ? 1 : 0, map.magFilter, map.minFilter, map.generateMipmaps ? 1 : 0].join('|');
  const key = [material.type, candidate.color?.getHexString() ?? 'ffffff', opacity, candidate.alphaTest ?? 0, candidate.side ?? THREE.FrontSide, depthWrite ? 1 : 0, depthTest ? 1 : 0, blending, samplingKey].join('|');
  return { eligible: true, semantics: { key, samplingKey } };
}

export function terrainTextureSourceIdentity(texture: THREE.Texture): string {
  const source = texture.source;
  const image = source?.data as { readonly src?: string; readonly currentSrc?: string; readonly width?: number; readonly height?: number; readonly name?: string } | undefined;
  return [source?.uuid ?? '', image?.currentSrc ?? image?.src ?? image?.name ?? '', image?.width ?? 0, image?.height ?? 0].join('|');
}

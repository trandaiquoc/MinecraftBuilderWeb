import * as THREE from 'three';

export type TerrainAtlasEligibilityReason =
  | 'compatible'
  | 'unsupported-material'
  | 'missing-map'
  | 'transparent'
  | 'depth-write'
  | 'depth-test'
  | 'opacity'
  | 'blending'
  | 'side'
  | 'vertex-colors'
  | 'flat-shading'
  | 'polygon-offset'
  | 'map-transform'
  | 'anisotropy';

export interface TerrainAtlasMaterialSemantics { readonly key: string; readonly samplingKey: string; }
export interface TerrainAtlasEligibility { readonly eligible: boolean; readonly reason: TerrainAtlasEligibilityReason; readonly semantics?: TerrainAtlasMaterialSemantics; }
export interface TerrainAtlasEligibilityOptions { readonly allowDoubleSide?: boolean; readonly allowDoubleSideForProbe?: boolean; }

/** A deliberately narrower contract than the generic material compatibility key. */
export function terrainAtlasEligibility(material: THREE.Material, options: TerrainAtlasEligibilityOptions = {}): TerrainAtlasEligibility {
  const candidate = material as THREE.Material & { map?: THREE.Texture; color?: THREE.Color; opacity?: number; alphaTest?: number; side?: number; transparent?: boolean; depthWrite?: boolean; depthTest?: boolean; blending?: number; vertexColors?: boolean; flatShading?: boolean; polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number };
  const map = candidate.map;
  if (!(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial)) return { eligible: false, reason: 'unsupported-material' };
  if (!map) return { eligible: false, reason: 'missing-map' };
  const depthWrite = candidate.depthWrite !== false;
  const depthTest = candidate.depthTest !== false;
  const opacity = candidate.opacity ?? 1;
  const blending = candidate.blending ?? THREE.NormalBlending;
  if (candidate.transparent) return { eligible: false, reason: 'transparent' };
  if (!depthWrite) return { eligible: false, reason: 'depth-write' };
  if (!depthTest) return { eligible: false, reason: 'depth-test' };
  if (opacity !== 1) return { eligible: false, reason: 'opacity' };
  if (blending !== THREE.NormalBlending) return { eligible: false, reason: 'blending' };
  const side = candidate.side ?? THREE.FrontSide;
  const doubleSideAllowed = options.allowDoubleSide === true || options.allowDoubleSideForProbe === true;
  if (side !== THREE.FrontSide && !(doubleSideAllowed && side === THREE.DoubleSide)) return { eligible: false, reason: 'side' };
  if (candidate.vertexColors) return { eligible: false, reason: 'vertex-colors' };
  if (candidate.flatShading) return { eligible: false, reason: 'flat-shading' };
  if (candidate.polygonOffset) return { eligible: false, reason: 'polygon-offset' };
  if (map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping || map.offset.x !== 0 || map.offset.y !== 0 || map.repeat.x !== 1 || map.repeat.y !== 1 || map.rotation !== 0 || map.center.x !== 0 || map.center.y !== 0) return { eligible: false, reason: 'map-transform' };
  if (map.anisotropy > 1) return { eligible: false, reason: 'anisotropy' };
  const samplingKey = [map.colorSpace, map.premultiplyAlpha ? 1 : 0, map.magFilter, map.minFilter, map.generateMipmaps ? 1 : 0].join('|');
  const key = [material.type, candidate.color?.getHexString() ?? 'ffffff', opacity, candidate.alphaTest ?? 0, candidate.side ?? THREE.FrontSide, depthWrite ? 1 : 0, depthTest ? 1 : 0, blending, samplingKey].join('|');
  return { eligible: true, reason: 'compatible', semantics: { key, samplingKey } };
}

export function terrainTextureSourceIdentity(texture: THREE.Texture): string {
  const source = texture.source;
  const image = source?.data as { readonly src?: string; readonly currentSrc?: string; readonly width?: number; readonly height?: number; readonly name?: string } | undefined;
  return [source?.uuid ?? '', image?.currentSrc ?? image?.src ?? image?.name ?? '', image?.width ?? 0, image?.height ?? 0].join('|');
}

import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { instanceGeometryCompatibilityKey, instanceMaterialCompatibilityKey } from '../batching/instance-template-cache';
import type { TerrainOccupancyLookup } from './chunk-occupancy';
import type { TerrainChunkCoordinate } from './chunk-coordinate';
import type { TerrainTextureAtlas } from './atlas/terrain-texture-atlas';
import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshJob, TerrainMeshTemplateData } from './terrain-mesh-protocol';

export interface TerrainMeshEntry {
  readonly key: string;
  readonly position: VoxelCoordinate;
  readonly templates: readonly SurfaceFaceTemplate[];
  readonly compiledTemplates?: readonly PrecompiledTerrainFace[];
  readonly role?: 'normal' | 'reference';
}

/** Immutable face data prepared once per reusable terrain signature. */
export interface PrecompiledTerrainFace {
  readonly direction: SurfaceFaceDirection;
  readonly material: THREE.Material;
  readonly bucketKey: string;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
}

const PRECOMPILED_TEMPLATE_CACHE = new WeakMap<readonly SurfaceFaceTemplate[], readonly PrecompiledTerrainFace[]>();
const PURE_FACE_CACHE = new WeakMap<readonly PrecompiledTerrainFace[], readonly { direction: SurfaceFaceDirection; bucketKey: string; positions: Float32Array; normals: Float32Array; uvs: Float32Array }[]>();

export function precompileTerrainTemplates(templates: readonly SurfaceFaceTemplate[], atlas?: TerrainTextureAtlas): readonly PrecompiledTerrainFace[] {
  const cached = atlas ? undefined : PRECOMPILED_TEMPLATE_CACHE.get(templates);
  if (cached) return cached;
  const compiled = templates.map((template) => {
    const positionAttribute = template.geometry.getAttribute('position');
    if (!positionAttribute) return { direction: template.direction, material: template.material, bucketKey: `${instanceMaterialCompatibilityKey(template.material)}|${instanceGeometryCompatibilityKey(template.geometry)}`, positions: [], normals: [], uvs: [] };
    const normalAttribute = template.geometry.getAttribute('normal');
    const uvAttribute = template.geometry.getAttribute('uv');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(template.matrix);
    const sourceIndices = template.geometry.index ? Array.from(template.geometry.index.array, Number) : Array.from({ length: positionAttribute.count }, (_, index) => index);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (const sourceIndex of sourceIndices) {
      const x = positionAttribute.getX(sourceIndex);
      const y = positionAttribute.getY(sourceIndex);
      const z = positionAttribute.getZ(sourceIndex);
      const transformed = new THREE.Vector3(x, y, z).applyMatrix4(template.matrix);
      positions.push(transformed.x, transformed.y, transformed.z);
      if (normalAttribute) {
        const normal = new THREE.Vector3(normalAttribute.getX(sourceIndex), normalAttribute.getY(sourceIndex), normalAttribute.getZ(sourceIndex)).applyMatrix3(normalMatrix).normalize();
        normals.push(normal.x, normal.y, normal.z);
      } else {
        const normal = directionNormalValues(template.direction);
        normals.push(normal[0], normal[1], normal[2]);
      }
      if (uvAttribute) uvs.push(uvAttribute.getX(sourceIndex), uvAttribute.getY(sourceIndex));
      else uvs.push(0, 0);
    }
    const atlasFace = atlas?.face(template.material, uvs);
    return { direction: template.direction, material: atlasFace?.material ?? template.material, bucketKey: atlasFace?.bucketKey ?? `${instanceMaterialCompatibilityKey(template.material)}|${instanceGeometryCompatibilityKey(template.geometry)}`, positions, normals, uvs: atlasFace?.uvs ?? uvs };
  });
  if (!atlas) PRECOMPILED_TEMPLATE_CACHE.set(templates, compiled);
  return compiled;
}

export interface CompiledTerrainBucket {
  readonly key: string;
  readonly material: THREE.Material;
  readonly geometry: THREE.BufferGeometry;
  readonly faceCount: number;
}

export interface CompiledTerrainChunk {
  readonly chunk: TerrainChunkCoordinate;
  readonly buckets: readonly CompiledTerrainBucket[];
  readonly blocksCompiled: number;
  readonly facesEmitted: number;
  readonly facesCulled: number;
  /** Keys with at least one emitted face in this chunk. */
  readonly emittedKeys: readonly string[];
  /** Keys with no emitted face because all six neighbours are opaque. */
  readonly fullyOccludedKeys: readonly string[];
  /** Exposed keys that produced no physical face and therefore cannot commit. */
  readonly unrepresentedExposedKeys: readonly string[];
}

/** CPU-only surface compiler. It emits one quad's triangles directly into chunk buffers. */
export function meshTerrainChunk(chunk: TerrainChunkCoordinate, entries: readonly TerrainMeshEntry[], occupancy: TerrainOccupancyLookup, atlas?: TerrainTextureAtlas): CompiledTerrainChunk {
  const materialByBucket = new Map<string, THREE.Material>();
  const templateIndexes = new WeakMap<readonly PrecompiledTerrainFace[], Map<'normal' | 'reference', number>>();
  const templates: TerrainMeshTemplateData[] = [];
  const prepared = entries.map((entry) => {
    const compiled = entry.compiledTemplates ?? precompileTerrainTemplates(entry.templates, atlas);
    const faces = pureFaces(compiled);
    const role = entry.role ?? 'normal';
    const roleIndexes = templateIndexes.get(compiled) ?? new Map<'normal' | 'reference', number>();
    templateIndexes.set(compiled, roleIndexes);
    let templateIndex = roleIndexes.get(role);
    if (templateIndex === undefined) {
      templateIndex = templates.length;
      roleIndexes.set(role, templateIndex);
      templates.push({ faces: faces.map((face) => ({ ...face, bucketKey: terrainPresentationBucketKey(face.bucketKey, role) })) });
      for (const template of compiled) {
        const bucketKey = terrainPresentationBucketKey(template.bucketKey, role);
        if (!materialByBucket.has(bucketKey)) materialByBucket.set(bucketKey, template.material);
      }
    }
    return { key: entry.key, position: [entry.position.x, entry.position.y, entry.position.z] as [number, number, number], templateIndex };
  });
  const origin: [number, number, number] = [chunk.x * 16 - 1, chunk.y * 16 - 1, chunk.z * 16 - 1];
  const opaque = new Uint8Array(18 * 18 * 18);
  for (let y = 0; y < 18; y += 1) for (let z = 0; z < 18; z += 1) for (let x = 0; x < 18; x += 1) if (occupancy.hasOpaque({ x: origin[0] + x, y: origin[1] + y, z: origin[2] + z })) opaque[(y * 18 + z) * 18 + x] = 1;
  const job: TerrainMeshJob = { jobId: 0, generation: 0, providerGeneration: 0, revision: 0, chunk, templates, entries: prepared, occupancy: { origin, size: 18, opaque } };
  const result = meshTerrainCore(job);
  return {
    chunk,
    buckets: result.buckets.map((bucket) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(bucket.indices, 1));
      return { key: bucket.key, material: materialByBucket.get(bucket.key) ?? new THREE.MeshBasicMaterial({ color: 0xffffff }), geometry, faceCount: bucket.faceCount };
    }),
    blocksCompiled: result.blocksCompiled,
    facesEmitted: result.facesEmitted,
    facesCulled: result.facesCulled,
    emittedKeys: result.emittedKeys,
    fullyOccludedKeys: result.fullyOccludedKeys,
    unrepresentedExposedKeys: result.unrepresentedExposedKeys,
  };
}

export function terrainPresentationBucketKey(bucketKey: string, role: 'normal' | 'reference' = 'normal'): string {
  return `${bucketKey}|render-role:${role}`;
}

export function terrainPresentationRole(bucketKey: string): 'normal' | 'reference' {
  return bucketKey.endsWith('|render-role:reference') ? 'reference' : 'normal';
}

function pureFaces(compiled: readonly PrecompiledTerrainFace[]): readonly { direction: SurfaceFaceDirection; bucketKey: string; positions: Float32Array; normals: Float32Array; uvs: Float32Array }[] {
  const cached = PURE_FACE_CACHE.get(compiled);
  if (cached) return cached;
  const faces = compiled.map((template) => ({ direction: template.direction, bucketKey: template.bucketKey, positions: new Float32Array(template.positions), normals: new Float32Array(template.normals), uvs: new Float32Array(template.uvs) }));
  PURE_FACE_CACHE.set(compiled, faces);
  return faces;
}

function directionNormalValues(direction: SurfaceFaceDirection): readonly [number, number, number] {
  switch (direction) {
    case 'north': return [0, 0, -1];
    case 'south': return [0, 0, 1];
    case 'east': return [1, 0, 0];
    case 'west': return [-1, 0, 0];
    case 'up': return [0, 1, 0];
    case 'down': return [0, -1, 0];
  }
  throw new Error(`Unknown terrain face direction: ${direction}`);
}

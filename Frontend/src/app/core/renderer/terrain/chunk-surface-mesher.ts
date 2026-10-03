import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { instanceGeometryCompatibilityKey, instanceMaterialCompatibilityKey } from '../batching/instance-template-cache';
import { TerrainOccupancy } from './chunk-occupancy';
import type { TerrainChunkCoordinate } from './chunk-coordinate';

export interface TerrainMeshEntry {
  readonly key: string;
  readonly position: VoxelCoordinate;
  readonly templates: readonly SurfaceFaceTemplate[];
  readonly compiledTemplates?: readonly PrecompiledTerrainFace[];
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
const PRECOMPILED_DIRECTION_CACHE = new WeakMap<readonly PrecompiledTerrainFace[], ReadonlyMap<SurfaceFaceDirection, PrecompiledTerrainFace>>();

export function precompileTerrainTemplates(templates: readonly SurfaceFaceTemplate[]): readonly PrecompiledTerrainFace[] {
  const cached = PRECOMPILED_TEMPLATE_CACHE.get(templates);
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
    return { direction: template.direction, material: template.material, bucketKey: `${instanceMaterialCompatibilityKey(template.material)}|${instanceGeometryCompatibilityKey(template.geometry)}`, positions, normals, uvs };
  });
  PRECOMPILED_TEMPLATE_CACHE.set(templates, compiled);
  return compiled;
}

function precompiledByDirection(templates: readonly PrecompiledTerrainFace[]): ReadonlyMap<SurfaceFaceDirection, PrecompiledTerrainFace> {
  const cached = PRECOMPILED_DIRECTION_CACHE.get(templates);
  if (cached) return cached;
  const map = new Map(templates.map((template) => [template.direction, template] as const));
  PRECOMPILED_DIRECTION_CACHE.set(templates, map);
  return map;
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
}

/** CPU-only surface compiler. It emits one quad's triangles directly into chunk buffers. */
export function meshTerrainChunk(chunk: TerrainChunkCoordinate, entries: readonly TerrainMeshEntry[], occupancy: TerrainOccupancy): CompiledTerrainChunk {
  const buckets = new Map<string, MutableBucket>();
  let blocksCompiled = 0;
  let facesEmitted = 0;
  let facesCulled = 0;
  for (const entry of entries) {
    blocksCompiled += 1;
    const templates = precompiledByDirection(entry.compiledTemplates ?? precompileTerrainTemplates(entry.templates));
    for (const direction of SURFACE_DIRECTIONS) {
      const template = templates.get(direction);
      if (!template) continue;
      if (occupancy.hasOpaque(neighborPosition(entry.position, direction))) { facesCulled += 1; continue; }
      const bucket = buckets.get(template.bucketKey) ?? createBucket(template.bucketKey, template.material);
      buckets.set(template.bucketKey, bucket);
      appendFace(bucket, template, entry.position);
      facesEmitted += 1;
    }
  }
  return {
    chunk,
    buckets: [...buckets.values()].map(finalizeBucket),
    blocksCompiled,
    facesEmitted,
    facesCulled,
  };
}

interface MutableBucket {
  readonly key: string;
  readonly material: THREE.Material;
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  faceCount: number;
}

function createBucket(key: string, material: THREE.Material): MutableBucket {
  return { key, material, positions: [], normals: [], uvs: [], faceCount: 0 };
}

function appendFace(bucket: MutableBucket, template: PrecompiledTerrainFace, position: VoxelCoordinate): void {
  for (let index = 0; index < template.positions.length; index += 3) {
    bucket.positions.push(template.positions[index] + position.x, template.positions[index + 1] + position.y, template.positions[index + 2] + position.z);
    bucket.normals.push(template.normals[index], template.normals[index + 1], template.normals[index + 2]);
    const uvIndex = (index / 3) * 2;
    bucket.uvs.push(template.uvs[uvIndex], template.uvs[uvIndex + 1]);
  }
  bucket.faceCount += 1;
}

function finalizeBucket(bucket: MutableBucket): CompiledTerrainBucket {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { key: bucket.key, material: bucket.material, geometry, faceCount: bucket.faceCount };
}

const SURFACE_DIRECTIONS: readonly SurfaceFaceDirection[] = ['north', 'south', 'east', 'west', 'up', 'down'];

function neighborPosition(position: VoxelCoordinate, direction: SurfaceFaceDirection): VoxelCoordinate {
  switch (direction) {
    case 'north': return { x: position.x, y: position.y, z: position.z - 1 };
    case 'south': return { x: position.x, y: position.y, z: position.z + 1 };
    case 'east': return { x: position.x + 1, y: position.y, z: position.z };
    case 'west': return { x: position.x - 1, y: position.y, z: position.z };
    case 'up': return { x: position.x, y: position.y + 1, z: position.z };
    case 'down': return { x: position.x, y: position.y - 1, z: position.z };
  }
  throw new Error(`Unknown terrain face direction: ${direction}`);
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

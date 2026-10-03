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
    const templates = new Map(entry.templates.map((template) => [template.direction, template] as const));
    for (const direction of SURFACE_DIRECTIONS) {
      const template = templates.get(direction);
      if (!template) continue;
      if (occupancy.hasOpaque(neighborPosition(entry.position, direction))) { facesCulled += 1; continue; }
      const bucketKey = `${instanceMaterialCompatibilityKey(template.material)}|${instanceGeometryCompatibilityKey(template.geometry)}`;
      const bucket = buckets.get(bucketKey) ?? createBucket(bucketKey, template.material);
      buckets.set(bucketKey, bucket);
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

function appendFace(bucket: MutableBucket, template: SurfaceFaceTemplate, position: VoxelCoordinate): void {
  const positionAttribute = template.geometry.getAttribute('position');
  if (!positionAttribute) return;
  const normalAttribute = template.geometry.getAttribute('normal');
  const uvAttribute = template.geometry.getAttribute('uv');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(template.matrix);
  const sourceIndices = template.geometry.index ? Array.from(template.geometry.index.array, Number) : Array.from({ length: positionAttribute.count }, (_, index) => index);
  for (const sourceIndex of sourceIndices) {
    const point = new THREE.Vector3(positionAttribute.getX(sourceIndex), positionAttribute.getY(sourceIndex), positionAttribute.getZ(sourceIndex)).applyMatrix4(template.matrix);
    bucket.positions.push(point.x + position.x, point.y + position.y, point.z + position.z);
    const normal = normalAttribute
      ? new THREE.Vector3(normalAttribute.getX(sourceIndex), normalAttribute.getY(sourceIndex), normalAttribute.getZ(sourceIndex)).applyMatrix3(normalMatrix).normalize()
      : directionNormal(template.direction);
    bucket.normals.push(normal.x, normal.y, normal.z);
    if (uvAttribute) bucket.uvs.push(uvAttribute.getX(sourceIndex), uvAttribute.getY(sourceIndex));
    else bucket.uvs.push(0, 0);
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

function directionNormal(direction: SurfaceFaceDirection): THREE.Vector3 {
  switch (direction) {
    case 'north': return new THREE.Vector3(0, 0, -1);
    case 'south': return new THREE.Vector3(0, 0, 1);
    case 'east': return new THREE.Vector3(1, 0, 0);
    case 'west': return new THREE.Vector3(-1, 0, 0);
    case 'up': return new THREE.Vector3(0, 1, 0);
    case 'down': return new THREE.Vector3(0, -1, 0);
  }
  throw new Error(`Unknown terrain face direction: ${direction}`);
}

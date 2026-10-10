import * as THREE from 'three';
import type { TerrainChunkCoordinate } from './chunk-coordinate';
import { terrainChunkBounds } from './chunk-coordinate';
import { terrainPresentationRole, type CompiledTerrainChunk } from './chunk-surface-mesher';

export interface TerrainOwnershipEvidence {
  readonly key: string;
  readonly chunkKey: string;
  readonly revision: number;
  readonly facesEmitted: number;
  readonly fullyOccluded: boolean;
}

export interface TerrainChunkObject {
  readonly key: string;
  readonly chunk: TerrainChunkCoordinate;
  readonly meshes: THREE.Mesh[];
  readonly signature: string;
  readonly emittedKeys: readonly string[];
  readonly fullyOccludedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly estimatedBytes: number;
}

export interface TerrainChunkInstallation {
  readonly removed: number;
  readonly inserted: number;
  readonly ownershipDurationMs: number;
}

export interface TerrainChunkResidencyEvidence {
  readonly chunks: number;
  readonly meshes: number;
  readonly rebuilds: number;
  readonly residentVariantHits: number;
  readonly residentVariantEvictions: number;
  readonly residentVariantCount: number;
  readonly residentVariantBytes: number;
  readonly blocksCompiled: number;
  readonly facesEmitted: number;
  readonly facesCulled: number;
}

export interface TerrainChunkResidencyOptions {
  readonly blocksGroup: THREE.Group;
  readonly record: (name: string, delta?: number) => void;
}

export const TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES = 96 * 1024 * 1024;

/** Owns attached terrain meshes, key-level ownership, retained variants, and GPU disposal. */
export class TerrainChunkResidencyOwner {
  private readonly chunks = new Map<string, TerrainChunkObject>();
  private readonly residentVariants = new Map<string, TerrainChunkObject>();
  private readonly ownership = new Map<string, TerrainOwnershipEvidence>();
  private readonly ownershipKeysByChunk = new Map<string, Set<string>>();
  private residentVariantBytesValue = 0;
  private residentVariantHitsValue = 0;
  private residentVariantEvictionsValue = 0;
  private rebuildCountValue = 0;
  private blocksCompiledValue = 0;
  private facesEmittedValue = 0;
  private facesCulledValue = 0;
  private referenceOpacity = .28;

  constructor(private readonly options: TerrainChunkResidencyOptions) {}

  get chunkCount(): number { return this.chunks.size; }
  get meshCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) count += chunk.meshes.length;
    return count;
  }
  get residentVariantCount(): number { return this.residentVariants.size; }
  get residentVariantBytes(): number { return this.residentVariantBytesValue; }
  get residentVariantHits(): number { return this.residentVariantHitsValue; }
  get residentVariantEvictions(): number { return this.residentVariantEvictionsValue; }
  get rebuildCount(): number { return this.rebuildCountValue; }
  get blocksCompiled(): number { return this.blocksCompiledValue; }
  get facesEmitted(): number { return this.facesEmittedValue; }
  get facesCulled(): number { return this.facesCulledValue; }
  get(key: string): TerrainChunkObject | undefined { return this.chunks.get(key); }
  values(): IterableIterator<TerrainChunkObject> { return this.chunks.values(); }
  ownershipFor(key: string): TerrainOwnershipEvidence | undefined { return this.ownership.get(key); }
  isRepresented(key: string): boolean { return this.ownership.has(key); }

  takeResidentVariant(chunkKey: string, signature: string): TerrainChunkObject | undefined {
    const variantKey = `${chunkKey}|${signature}`;
    const variant = this.residentVariants.get(variantKey);
    if (!variant) return undefined;
    this.residentVariants.delete(variantKey);
    this.residentVariantBytesValue -= variant.estimatedBytes;
    return variant;
  }

  installCompiled(key: string, compiled: CompiledTerrainChunk, revision: number, signature: string): TerrainChunkInstallation {
    this.rebuildCountValue += 1;
    this.blocksCompiledValue += compiled.blocksCompiled;
    this.facesEmittedValue += compiled.facesEmitted;
    this.facesCulledValue += compiled.facesCulled;
    this.options.record('terrainChunkRebuilds');
    this.options.record('terrainBlocksCompiled', compiled.blocksCompiled);
    this.options.record('terrainFacesEmitted', compiled.facesEmitted);
    this.options.record('terrainFacesCulled', compiled.facesCulled);

    const meshes: THREE.Mesh[] = [];
    const bounds = terrainChunkBounds(compiled.chunk);
    for (const bucket of compiled.buckets) {
      bucket.geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      );
      bucket.geometry.boundingSphere = bucket.geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(bucket.geometry, bucket.material.clone());
      const material = mesh.material as THREE.Material;
      const role = terrainPresentationRole(bucket.key);
      material.userData['terrainRole'] = role;
      if (role === 'reference') this.applyReferenceOpacity(material);
      mesh.frustumCulled = true;
      mesh.userData['terrainChunk'] = key;
      mesh.userData['terrainBucket'] = bucket.key;
      mesh.userData['terrainRole'] = role;
      mesh.userData['terrainFaces'] = bucket.faceCount;
      mesh.userData['realModel'] = true;
      this.options.blocksGroup.add(mesh);
      meshes.push(mesh);
    }

    const removed = this.ownershipKeysByChunk.get(key)?.size ?? 0;
    this.retainCurrent(key);
    if (meshes.length) {
      this.chunks.set(key, createTerrainChunkObject(key, compiled.chunk, meshes, signature, compiled.emittedKeys, compiled.fullyOccludedKeys, compiled.unrepresentedExposedKeys));
    } else {
      this.chunks.delete(key);
    }
    const ownershipDurationMs = this.replaceOwnership(key, revision, compiled.emittedKeys, compiled.fullyOccludedKeys);
    for (const failedKey of compiled.unrepresentedExposedKeys) this.ownership.delete(failedKey);
    const keys = this.ownershipKeysByChunk.get(key);
    if (keys) for (const failedKey of compiled.unrepresentedExposedKeys) keys.delete(failedKey);
    return { removed, inserted: this.ownershipKeysByChunk.get(key)?.size ?? 0, ownershipDurationMs };
  }

  installResidentVariant(key: string, cached: TerrainChunkObject, revision: number): void {
    this.retainCurrent(key);
    for (const mesh of cached.meshes) {
      mesh.userData['terrainChunk'] = key;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) if (material.userData['terrainRole'] === 'reference') this.applyReferenceOpacity(material);
      this.options.blocksGroup.add(mesh);
    }
    this.chunks.set(key, cached);
    this.replaceOwnership(key, revision, cached.emittedKeys, cached.fullyOccludedKeys);
    for (const failedKey of cached.failedKeys) this.ownership.delete(failedKey);
    const keys = this.ownershipKeysByChunk.get(key);
    if (keys) for (const failedKey of cached.failedKeys) keys.delete(failedKey);
    this.residentVariantHitsValue += 1;
  }

  retainCurrent(key: string): void {
    const current = this.chunks.get(key);
    if (!current) return;
    this.chunks.delete(key);
    this.clearOwnership(key);
    this.retainVariant(current);
  }

  clearOwnership(chunkKey: string): number {
    const keys = this.ownershipKeysByChunk.get(chunkKey);
    if (!keys) return 0;
    for (const key of keys) this.ownership.delete(key);
    this.ownershipKeysByChunk.delete(chunkKey);
    return keys.size;
  }

  setReferenceOpacity(opacity: number): void {
    this.referenceOpacity = Math.max(0, Math.min(1, opacity));
    this.applyMaterial((material) => {
      if (material.userData['terrainRole'] !== 'reference') return;
      this.applyReferenceOpacity(material);
    });
  }

  applyMaterial(callback: (material: THREE.Material) => void): void {
    for (const chunk of this.chunks.values()) for (const mesh of chunk.meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) callback(material);
    }
  }

  clear(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    for (const chunk of this.residentVariants.values()) this.disposeChunk(chunk);
    this.residentVariants.clear();
    this.ownership.clear();
    this.ownershipKeysByChunk.clear();
    this.residentVariantBytesValue = 0;
  }

  evidence(): TerrainChunkResidencyEvidence {
    return {
      chunks: this.chunks.size,
      meshes: this.meshCount,
      rebuilds: this.rebuildCountValue,
      residentVariantHits: this.residentVariantHitsValue,
      residentVariantEvictions: this.residentVariantEvictionsValue,
      residentVariantCount: this.residentVariants.size,
      residentVariantBytes: this.residentVariantBytesValue,
      blocksCompiled: this.blocksCompiledValue,
      facesEmitted: this.facesEmittedValue,
      facesCulled: this.facesCulledValue,
    };
  }

  private replaceOwnership(chunkKey: string, revision: number, emittedKeys: readonly string[], occludedKeys: readonly string[]): number {
    const started = performance.now();
    this.clearOwnership(chunkKey);
    const emitted = new Set(emittedKeys);
    const occluded = new Set(occludedKeys);
    const keys = new Set<string>();
    for (const key of [...emittedKeys, ...occludedKeys]) {
      this.ownership.set(key, { key, chunkKey, revision, facesEmitted: emitted.has(key) ? 1 : 0, fullyOccluded: occluded.has(key) });
      keys.add(key);
    }
    this.ownershipKeysByChunk.set(chunkKey, keys);
    return Math.max(0, performance.now() - started);
  }

  private retainVariant(chunk: TerrainChunkObject): void {
    for (const mesh of chunk.meshes) this.options.blocksGroup.remove(mesh);
    if (!chunk.meshes.length || chunk.estimatedBytes > TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES) {
      this.disposeChunk(chunk);
      return;
    }
    const variantKey = `${chunk.key}|${chunk.signature}`;
    const existing = this.residentVariants.get(variantKey);
    if (existing) {
      this.residentVariants.delete(variantKey);
      this.residentVariantBytesValue -= existing.estimatedBytes;
      this.disposeChunk(existing);
    }
    this.residentVariants.set(variantKey, chunk);
    this.residentVariantBytesValue += chunk.estimatedBytes;
    while (this.residentVariantBytesValue > TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES && this.residentVariants.size) {
      const oldestKey = this.residentVariants.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.residentVariants.get(oldestKey)!;
      this.residentVariants.delete(oldestKey);
      this.residentVariantBytesValue -= oldest.estimatedBytes;
      this.disposeChunk(oldest);
      this.residentVariantEvictionsValue += 1;
      this.options.record('terrainResidentVariantEvictions');
    }
  }

  private disposeChunk(chunk: TerrainChunkObject): void {
    for (const mesh of chunk.meshes) {
      this.options.blocksGroup.remove(mesh);
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }

  private applyReferenceOpacity(material: THREE.Material): void {
    material.transparent = true;
    material.opacity = this.referenceOpacity;
    material.needsUpdate = true;
  }
}

function createTerrainChunkObject(
  key: string,
  chunk: TerrainChunkCoordinate,
  meshes: THREE.Mesh[],
  signature: string,
  emittedKeys: readonly string[],
  fullyOccludedKeys: readonly string[],
  failedKeys: readonly string[],
): TerrainChunkObject {
  const geometryBytes = meshes.reduce((total, mesh) => total + geometryByteLength(mesh.geometry), 0);
  return { key, chunk, meshes, signature, emittedKeys: [...emittedKeys], fullyOccludedKeys: [...fullyOccludedKeys], failedKeys: [...failedKeys], estimatedBytes: geometryBytes + signature.length * 2 };
}

function geometryByteLength(geometry: THREE.BufferGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return bytes;
}

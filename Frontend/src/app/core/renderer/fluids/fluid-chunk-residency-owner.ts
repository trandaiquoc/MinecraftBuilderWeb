import * as THREE from 'three';
import type { FluidChunkVisualProvider, FluidLayerPresentation } from './fluid-render-contracts';
import { fluidMaterialCacheKey, fluidMaterialDescriptor } from './fluid-material-key';
import type { FluidMeshBuildResult } from './fluid-mesh-core';

export interface FluidResidentChunk {
  readonly key: string;
  readonly keys: Set<string>;
  readonly signatures: ReadonlyMap<string, string>;
  readonly meshes: THREE.Mesh[];
  readonly facesPotential: number;
  readonly facesCulled: number;
  readonly facesEmitted: number;
  readonly fallbackKeys: ReadonlySet<string>;
  readonly providerContractKey: string;
  readonly signature: string;
  readonly estimatedBytes: number;
}

export interface FluidChunkBuildResources {
  readonly meshes: readonly THREE.Mesh[];
  readonly fallbackKeys: ReadonlySet<string>;
  readonly createdMaterials: readonly THREE.Material[];
  readonly createdMaterialKeys: readonly string[];
}

export interface FluidChunkResidencyEvidence {
  readonly chunks: number;
  readonly meshes: number;
  readonly materialBuckets: number;
  readonly residentVariantHits: number;
  readonly residentVariantEvictions: number;
  readonly residentVariantCount: number;
  readonly residentVariantBytes: number;
  readonly materialCacheHits: number;
  readonly materialCacheMisses: number;
  readonly presentationUpdates: number;
  readonly meshVisibilityUpdates: number;
  readonly meshRoleUpdates: number;
}

export const FLUID_RESIDENT_VARIANT_BUDGET_BYTES = 48 * 1024 * 1024;

/** Owns fluid chunk meshes/materials, resident variants, presentation and GPU disposal. */
export class FluidChunkResidencyOwner {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, FluidResidentChunk>();
  private readonly residentVariants = new Map<string, FluidResidentChunk>();
  private readonly materialCache = new Map<string, THREE.Material>();
  private providerContractKey?: string;
  private layerPresentation?: FluidLayerPresentation;
  private residentVariantBytesValue = 0;
  private residentVariantHitsValue = 0;
  private residentVariantEvictionsValue = 0;
  private materialCacheHitsValue = 0;
  private materialCacheMissesValue = 0;
  private presentationUpdatesValue = 0;
  private meshVisibilityUpdatesValue = 0;
  private meshRoleUpdatesValue = 0;
  private referenceOpacity = 0.28;

  constructor(private readonly blocksGroup: THREE.Group) {
    this.group.name = 'fluidChunks';
    this.group.userData['fluidChunks'] = true;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }
  get residentVariantCount(): number {
    return this.residentVariants.size;
  }
  get residentVariantBytes(): number {
    return this.residentVariantBytesValue;
  }
  get materialBucketCount(): number {
    return this.materialCache.size;
  }
  get isLayered(): boolean {
    return !!this.layerPresentation;
  }
  get layeredPresentationReady(): boolean {
    return (
      !!this.layerPresentation &&
      [...this.chunks.values()].every((chunk) =>
        chunk.meshes.every(
          (mesh) =>
            Number.isInteger(mesh.userData['fluidLayer']) &&
            (mesh.userData['fluidLayer'] as number) >= 0 &&
            Array.isArray(mesh.userData['fluidGroupIds']),
        ),
      )
    );
  }
  currentChunks(): IterableIterator<FluidResidentChunk> {
    return this.chunks.values();
  }
  currentChunkKeys(): IterableIterator<string> {
    return this.chunks.keys();
  }
  currentChunk(key: string): FluidResidentChunk | undefined {
    return this.chunks.get(key);
  }

  setProviderContractKey(key: string | undefined): void {
    if (this.providerContractKey === key) return;
    this.providerContractKey = key;
    this.clearResidentVariants();
  }

  setLayerPresentation(presentation: FluidLayerPresentation | undefined): void {
    if (sameLayerPresentation(this.layerPresentation, presentation)) return;
    this.layerPresentation = presentation;
    if (presentation) this.referenceOpacity = presentation.referenceOpacity;
    this.presentationUpdatesValue += 1;
    for (const chunk of this.chunks.values())
      for (const mesh of chunk.meshes) this.applyLayerPresentation(mesh);
  }

  async createBuildResources(
    data: FluidMeshBuildResult,
    provider: FluidChunkVisualProvider,
    isCurrent: () => boolean,
  ): Promise<FluidChunkBuildResources | undefined> {
    const meshes: THREE.Mesh[] = [];
    const createdMaterials: THREE.Material[] = [];
    const createdMaterialKeys: string[] = [];
    const fallbackKeys = new Set<string>();
    const discard = (): undefined => {
      for (const mesh of meshes) this.disposeMesh(mesh);
      for (let index = 0; index < createdMaterials.length; index += 1) {
        const key = createdMaterialKeys[index];
        if (key && this.materialCache.get(key) === createdMaterials[index])
          this.materialCache.delete(key);
        createdMaterials[index].dispose();
      }
      this.disposeUnusedMaterials();
      return undefined;
    };

    for (const bucket of data.buckets) {
      const geometry = createGeometry(bucket.positions, bucket.normals, bucket.uvs, bucket.indices);
      const materialKey = fluidMaterialCacheKey(
        provider.contractKey ?? 'fluid-provider-default',
        fluidMaterialDescriptor(bucket, bucket.texture),
      );
      let material = this.materialCache.get(materialKey);
      if (!material) {
        this.materialCacheMissesValue += 1;
        let texture: THREE.Texture | undefined;
        try {
          texture = await provider.texture(bucket.texture);
        } catch {
          texture = undefined;
        }
        if (!isCurrent()) {
          geometry.dispose();
          return discard();
        }
        if (!texture) for (const key of bucket.voxelKeys) fallbackKeys.add(key);
        material = new THREE.MeshLambertMaterial({
          map: texture,
          color: bucket.tint ?? 0xffffff,
          transparent: bucket.renderLayer === 'translucent',
          opacity: bucket.opacity ?? (bucket.renderLayer === 'translucent' ? 0.8 : 1),
          depthWrite: bucket.depthWrite,
          side: bucket.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        });
        material.userData['fluidMaterialKey'] = materialKey;
        material.userData['fluidFallback'] = !texture;
        this.materialCache.set(materialKey, material);
        createdMaterials.push(material);
        createdMaterialKeys.push(materialKey);
      } else {
        this.materialCacheHitsValue += 1;
        if (material.userData['fluidFallback'])
          for (const key of bucket.voxelKeys) fallbackKeys.add(key);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData['fluidChunk'] = true;
      mesh.userData['fluidRenderLayer'] = bucket.renderLayer;
      mesh.userData['fluidMaterialKey'] = materialKey;
      mesh.userData['fluidBaseMaterial'] = material;
      mesh.userData['fluidLayer'] = bucket.layer;
      mesh.userData['fluidGroupIds'] = bucket.groupIds;
      mesh.frustumCulled = true;
      this.applyLayerPresentation(mesh);
      meshes.push(mesh);
    }
    if (!isCurrent()) return discard();
    return { meshes, fallbackKeys, createdMaterials, createdMaterialKeys };
  }

  discardBuildResources(resources: FluidChunkBuildResources): void {
    for (const mesh of resources.meshes) this.disposeMesh(mesh);
    for (let index = 0; index < resources.createdMaterials.length; index += 1) {
      const key = resources.createdMaterialKeys[index];
      if (key && this.materialCache.get(key) === resources.createdMaterials[index])
        this.materialCache.delete(key);
      resources.createdMaterials[index].dispose();
    }
    this.disposeUnusedMaterials();
  }

  install(chunk: FluidResidentChunk): void {
    const previous = this.chunks.get(chunk.key);
    for (const mesh of chunk.meshes) {
      mesh.userData['fluidVoxelKeys'] = [...chunk.keys];
      this.group.add(mesh);
    }
    if (previous) {
      if (previous.providerContractKey === this.providerContractKey) this.retainVariant(previous);
      else this.disposeChunk(previous);
    }
    this.chunks.set(chunk.key, chunk);
    if (this.group.parent !== this.blocksGroup) this.blocksGroup.add(this.group);
    this.disposeUnusedMaterials();
  }

  takeResidentVariant(chunkKey: string, signature: string): FluidResidentChunk | undefined {
    const variantKey = `${chunkKey}|${signature}`;
    const chunk = this.residentVariants.get(variantKey);
    if (!chunk) return undefined;
    this.residentVariants.delete(variantKey);
    this.residentVariantBytesValue -= chunk.estimatedBytes;
    return chunk;
  }

  installResidentVariant(chunk: FluidResidentChunk): void {
    this.retainCurrent(chunk.key);
    this.chunks.set(chunk.key, chunk);
    for (const mesh of chunk.meshes) {
      this.applyLayerPresentation(mesh);
      this.group.add(mesh);
    }
    if (this.group.parent !== this.blocksGroup) this.blocksGroup.add(this.group);
    this.residentVariantHitsValue += 1;
  }

  retainCurrent(key: string): void {
    const current = this.chunks.get(key);
    if (!current) return;
    this.chunks.delete(key);
    this.retainVariant(current);
  }

  removeCurrent(key: string): void {
    const current = this.chunks.get(key);
    if (!current) return;
    this.chunks.delete(key);
    this.disposeChunk(current);
    this.disposeUnusedMaterials();
  }

  detachGroupIfEmpty(): void {
    if (!this.chunks.size && !this.group.children.length && this.group.parent === this.blocksGroup)
      this.blocksGroup.remove(this.group);
  }

  clear(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.clearResidentVariants();
    for (const material of this.materialCache.values()) material.dispose();
    this.materialCache.clear();
    this.layerPresentation = undefined;
    this.residentVariantBytesValue = 0;
    this.blocksGroup.remove(this.group);
  }

  dispose(): void {
    this.clear();
  }

  evidence(): FluidChunkResidencyEvidence {
    return {
      chunks: this.chunks.size,
      meshes: [...this.chunks.values()].reduce((count, chunk) => count + chunk.meshes.length, 0),
      materialBuckets: this.materialCache.size,
      residentVariantHits: this.residentVariantHitsValue,
      residentVariantEvictions: this.residentVariantEvictionsValue,
      residentVariantCount: this.residentVariants.size,
      residentVariantBytes: this.residentVariantBytesValue,
      materialCacheHits: this.materialCacheHitsValue,
      materialCacheMisses: this.materialCacheMissesValue,
      presentationUpdates: this.presentationUpdatesValue,
      meshVisibilityUpdates: this.meshVisibilityUpdatesValue,
      meshRoleUpdates: this.meshRoleUpdatesValue,
    };
  }

  lightEvidence(): Readonly<Record<string, number>> {
    return {
      fluidChunks: this.chunks.size,
      fluidChunkMeshes: this.group.children.length,
      fluidMaterialBuckets: this.materialCache.size,
      fluidResidentVariantHits: this.residentVariantHitsValue,
      fluidResidentVariantEvictions: this.residentVariantEvictionsValue,
      fluidResidentVariantCount: this.residentVariants.size,
      fluidResidentVariantBytes: this.residentVariantBytesValue,
      fluidDescriptorCacheHits: this.materialCacheHitsValue,
      fluidDescriptorCacheMisses: this.materialCacheMissesValue,
      fluidPresentationUpdates: this.presentationUpdatesValue,
      fluidMeshVisibilityUpdates: this.meshVisibilityUpdatesValue,
      fluidMeshRoleUpdates: this.meshRoleUpdatesValue,
    };
  }

  private retainVariant(chunk: FluidResidentChunk): void {
    for (const mesh of chunk.meshes) this.group.remove(mesh);
    if (
      chunk.providerContractKey !== this.providerContractKey ||
      chunk.estimatedBytes > FLUID_RESIDENT_VARIANT_BUDGET_BYTES
    ) {
      this.disposeChunk(chunk);
      this.disposeUnusedMaterials();
      return;
    }
    const variantKey = `${chunk.key}|${chunk.signature}`;
    const duplicate = this.residentVariants.get(variantKey);
    if (duplicate) {
      this.residentVariants.delete(variantKey);
      this.residentVariantBytesValue -= duplicate.estimatedBytes;
      this.disposeChunk(duplicate);
    }
    this.residentVariants.set(variantKey, chunk);
    this.residentVariantBytesValue += chunk.estimatedBytes;
    while (
      this.residentVariantBytesValue > FLUID_RESIDENT_VARIANT_BUDGET_BYTES &&
      this.residentVariants.size
    ) {
      const oldestKey = this.residentVariants.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.residentVariants.get(oldestKey)!;
      this.residentVariants.delete(oldestKey);
      this.residentVariantBytesValue -= oldest.estimatedBytes;
      this.disposeChunk(oldest);
      this.residentVariantEvictionsValue += 1;
    }
  }

  private clearResidentVariants(): void {
    for (const chunk of this.residentVariants.values()) this.disposeChunk(chunk);
    this.residentVariants.clear();
    this.residentVariantBytesValue = 0;
    this.disposeUnusedMaterials();
  }

  private disposeUnusedMaterials(): void {
    const used = new Set<THREE.Material>();
    for (const chunk of this.chunks.values())
      for (const mesh of chunk.meshes)
        used.add(mesh.userData['fluidBaseMaterial'] as THREE.Material);
    for (const chunk of this.residentVariants.values())
      for (const mesh of chunk.meshes)
        used.add(mesh.userData['fluidBaseMaterial'] as THREE.Material);
    for (const [key, material] of this.materialCache)
      if (!used.has(material)) {
        material.dispose();
        this.materialCache.delete(key);
      }
  }

  private disposeChunk(chunk: FluidResidentChunk): void {
    for (const mesh of chunk.meshes) this.disposeMesh(mesh);
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    const roleMaterial = mesh.userData['fluidRoleMaterial'];
    if (roleMaterial instanceof THREE.Material) roleMaterial.dispose();
  }

  private applyLayerPresentation(mesh: THREE.Mesh): void {
    const presentation = this.layerPresentation;
    if (
      !presentation ||
      !Number.isInteger(mesh.userData['fluidLayer']) ||
      (mesh.userData['fluidLayer'] as number) < 0
    ) {
      this.setMeshVisibility(mesh, true);
      this.setMeshRole(mesh, 'normal', 1);
      return;
    }
    const layer = mesh.userData['fluidLayer'] as number;
    const groupIds = mesh.userData['fluidGroupIds'] as readonly string[];
    const visible =
      presentation.visibleLayers.has(layer) &&
      !groupIds.some((id) => presentation.hiddenGroupIds.has(id)) &&
      (presentation.isolatedGroupId === undefined ||
        groupIds.includes(presentation.isolatedGroupId));
    this.setMeshVisibility(mesh, visible);
    this.setMeshRole(
      mesh,
      layer === presentation.currentY ? 'normal' : 'reference',
      presentation.referenceOpacity,
    );
  }

  private setMeshVisibility(mesh: THREE.Mesh, visible: boolean): void {
    if (mesh.visible === visible) return;
    mesh.visible = visible;
    this.meshVisibilityUpdatesValue += 1;
  }

  private setMeshRole(mesh: THREE.Mesh, role: 'normal' | 'reference', opacity: number): void {
    const base = mesh.userData['fluidBaseMaterial'];
    if (!(base instanceof THREE.Material)) return;
    let presentationMaterial = mesh.userData['fluidRoleMaterial'] as THREE.Material | undefined;
    if (role === 'normal') {
      if (!presentationMaterial || mesh.material === base) return;
      mesh.material = base;
      this.meshRoleUpdatesValue += 1;
      return;
    }
    if (!presentationMaterial) {
      presentationMaterial = base.clone();
      mesh.userData['fluidRoleMaterial'] = presentationMaterial;
    }
    if (mesh.material !== presentationMaterial) {
      mesh.material = presentationMaterial;
      this.meshRoleUpdatesValue += 1;
    }
    if (
      !presentationMaterial.transparent ||
      presentationMaterial.opacity !== opacity ||
      presentationMaterial.depthWrite !== base.depthWrite
    ) {
      presentationMaterial.transparent = true;
      presentationMaterial.opacity = opacity;
      presentationMaterial.depthWrite = base.depthWrite;
      presentationMaterial.needsUpdate = true;
      this.meshRoleUpdatesValue += 1;
    }
  }
}

function createGeometry(
  positions: readonly number[],
  normals: readonly number[],
  uvs: readonly number[],
  indices: readonly number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...indices]);
  return geometry;
}

function sameLayerPresentation(
  left: FluidLayerPresentation | undefined,
  right: FluidLayerPresentation | undefined,
): boolean {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    left.currentY !== right.currentY ||
    left.isolatedGroupId !== right.isolatedGroupId ||
    left.referenceOpacity !== right.referenceOpacity
  )
    return false;
  return (
    sameSet(left.visibleLayers, right.visibleLayers) &&
    sameSet(left.hiddenGroupIds, right.hiddenGroupIds)
  );
}

function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

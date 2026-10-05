import * as THREE from 'three';

export interface ObjectMeshCost {
  readonly objects: number;
  readonly meshes: number;
  readonly transparentMeshes: number;
  readonly opaqueMeshes: number;
}

export interface BatchCost {
  readonly batchCount: number;
  readonly meshCount: number;
  readonly members: number;
  readonly materials: number;
  readonly geometries: number;
  readonly regions: number;
}

export interface SceneRenderCost {
  readonly object3dCount: number;
  readonly meshCount: number;
  readonly visibleMeshCount: number;
  readonly transparentMeshCount: number;
  readonly opaqueMeshCount: number;
  readonly regions: number;
  readonly instance: BatchCost;
  readonly surface: BatchCost;
  readonly placeholders: BatchCost;
  readonly standaloneBlockObjects: number;
  readonly standaloneBlockMeshes: number;
  readonly standaloneTransparentMeshes: number;
  readonly standaloneOpaqueMeshes: number;
  readonly fluidChunkMeshes: number;
  readonly fluidStandaloneMeshes: number;
  readonly decorationObjects: number;
  readonly decorationMeshes: number;
  readonly terrainTriangleCount: number;
}

export function countObjectMeshCost(root: THREE.Object3D, includeRoot = false): ObjectMeshCost {
  let objects = includeRoot ? 1 : 0;
  let meshes = 0;
  let transparentMeshes = 0;
  let opaqueMeshes = 0;
  root.traverse((object) => {
    if (object !== root) objects += 1;
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.transparent || material.opacity < 1)) transparentMeshes += 1;
    else opaqueMeshes += 1;
  });
  return { objects, meshes, transparentMeshes, opaqueMeshes };
}

export function countBatchCost(batches: Iterable<{ readonly regionKey?: string; readonly keys: readonly unknown[]; readonly mesh?: THREE.Mesh; readonly parts?: readonly THREE.Mesh[] }>): BatchCost {
  let batchCount = 0;
  let meshCount = 0;
  let members = 0;
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const regions = new Set<string>();
  for (const batch of batches) {
    batchCount += 1;
    members += batch.keys.length;
    if (batch.regionKey !== undefined) regions.add(batch.regionKey);
    const meshes = batch.parts ?? (batch.mesh ? [batch.mesh] : []);
    meshCount += meshes.length;
    for (const mesh of meshes) {
      geometries.add(mesh.geometry);
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materialList) materials.add(material);
    }
  }
  return { batchCount, meshCount, members, materials: materials.size, geometries: geometries.size, regions: regions.size };
}

export function collectSceneRenderCost(input: {
  readonly scene: THREE.Object3D;
  readonly blocksGroup: THREE.Group;
  readonly decorationsGroup: THREE.Group;
  readonly instanceBatches: Iterable<{ readonly regionKey?: string; readonly keys: readonly unknown[]; readonly mesh?: THREE.Mesh; readonly parts?: readonly THREE.Mesh[] }>;
  readonly surfaceBatches: Iterable<{ readonly regionKey?: string; readonly keys: readonly unknown[]; readonly mesh?: THREE.Mesh; readonly parts?: readonly THREE.Mesh[] }>;
  readonly placeholderBatches: Iterable<{ readonly regionKey?: string; readonly keys: readonly unknown[]; readonly mesh?: THREE.Mesh; readonly parts?: readonly THREE.Mesh[] }>;
  readonly renderedBlocks: Iterable<{ readonly object?: THREE.Object3D; readonly instanceBatchKey?: string; readonly surfaceFaceMemberships?: readonly unknown[]; readonly terrainChunkKey?: string; readonly fluidChunkKey?: string; readonly fluidFallback?: boolean }>;
  readonly renderedDecorations: Iterable<{ readonly object: THREE.Object3D }>;
}): SceneRenderCost {
  let object3dCount = 0;
  let meshCount = 0;
  let visibleMeshCount = 0;
  let transparentMeshCount = 0;
  let opaqueMeshCount = 0;
  input.scene.traverse((object) => {
    object3dCount += 1;
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    if (object.visible) visibleMeshCount += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.transparent || material.opacity < 1)) transparentMeshCount += 1;
    else opaqueMeshCount += 1;
  });
  const instance = countBatchCost(input.instanceBatches);
  const surface = countBatchCost(input.surfaceBatches);
  const placeholders = countBatchCost(input.placeholderBatches);
  const regions = new Set([...input.instanceBatches, ...input.surfaceBatches].map((batch) => batch.regionKey).filter((key): key is string => !!key)).size;
  let standaloneBlockObjects = 0;
  let standaloneBlockMeshes = 0;
  let standaloneTransparentMeshes = 0;
  let standaloneOpaqueMeshes = 0;
  let fluidStandaloneMeshes = 0;
  for (const entry of input.renderedBlocks) {
    if (entry.fluidChunkKey !== undefined) continue;
    if (entry.fluidFallback) continue;
    if (!entry.object || entry.instanceBatchKey || entry.surfaceFaceMemberships?.length || entry.terrainChunkKey !== undefined) continue;
    const cost = countObjectMeshCost(entry.object, true);
    if (entry.object.userData['fluidRenderLayer'] !== undefined || entry.object.userData['fluidKind'] !== undefined) { fluidStandaloneMeshes += cost.meshes; continue; }
    standaloneBlockObjects += 1;
    standaloneBlockMeshes += cost.meshes;
    standaloneTransparentMeshes += cost.transparentMeshes;
    standaloneOpaqueMeshes += cost.opaqueMeshes;
  }
  let decorationObjects = 0;
  let decorationMeshes = 0;
  for (const entry of input.renderedDecorations) {
    const cost = countObjectMeshCost(entry.object, true);
    decorationObjects += 1;
    decorationMeshes += cost.meshes;
  }
  let terrainTriangleCount = 0;
  let fluidChunkMeshes = 0;
  const fluidChunkRoot = input.blocksGroup.children.find((child) => child.userData['fluidChunks'] === true);
  fluidChunkRoot?.traverse((object) => { if (object instanceof THREE.Mesh) fluidChunkMeshes += 1; });
  for (const child of input.blocksGroup.children) if (child.userData['terrainChunk'] && child instanceof THREE.Mesh) terrainTriangleCount += (child.geometry.getIndex()?.count ?? child.geometry.getAttribute('position')?.count ?? 0) / 3;
  return { object3dCount, meshCount, visibleMeshCount, transparentMeshCount, opaqueMeshCount, regions, instance, surface, placeholders, standaloneBlockObjects, standaloneBlockMeshes, standaloneTransparentMeshes, standaloneOpaqueMeshes, fluidChunkMeshes, fluidStandaloneMeshes, decorationObjects, decorationMeshes, terrainTriangleCount };
}

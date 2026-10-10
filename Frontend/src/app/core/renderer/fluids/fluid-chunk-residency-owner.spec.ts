import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FluidChunkResidencyOwner, type FluidResidentChunk } from './fluid-chunk-residency-owner';
import { vanillaFluidRenderResolver } from './fluid-state';
import type { FluidMeshBuildResult } from './fluid-mesh-core';

function buildData(): FluidMeshBuildResult {
  return {
    fluidLogicalVoxels: 1,
    fluidFacesPotential: 1,
    fluidFacesCulled: 0,
    fluidFacesEmitted: 1,
    buckets: [
      {
        materialKey: 'water',
        fluidTypeId: 'minecraft:water',
        renderLayer: 'translucent',
        texture: 'minecraft:block/water_still',
        doubleSided: false,
        depthWrite: false,
        layer: 12,
        groupIds: [],
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        voxelKeys: ['0,12,0'],
        facesPotential: 1,
        facesCulled: 0,
        facesEmitted: 1,
      },
    ],
  };
}

describe('FluidChunkResidencyOwner', () => {
  it('retains layer presentation resources, reuses them, and disposes only on eviction/clear', async () => {
    const blocksGroup = new THREE.Group();
    const owner = new FluidChunkResidencyOwner(blocksGroup);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    const provider = {
      contractKey: 'fluid-v1',
      resolver: vanillaFluidRenderResolver,
      texture: async () => texture,
    };
    owner.setProviderContractKey('fluid-v1');
    owner.setLayerPresentation({
      visibleLayers: new Set([12]),
      currentY: 12,
      hiddenGroupIds: new Set(),
      referenceOpacity: 0.28,
    });
    const built = await owner.createBuildResources(buildData(), provider, () => true);
    expect(built).toBeDefined();
    const mesh = built!.meshes[0]!;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const baseMaterial = mesh.material as THREE.Material;
    const materialDispose = vi.spyOn(baseMaterial, 'dispose');
    const chunk: FluidResidentChunk = {
      key: '0,0,0',
      keys: new Set(['0,12,0']),
      signatures: new Map([['0,12,0', 'water']]),
      meshes: [...built!.meshes],
      facesPotential: 1,
      facesCulled: 0,
      facesEmitted: 1,
      fallbackKeys: new Set(),
      providerContractKey: 'fluid-v1',
      signature: 'chunk-signature',
      estimatedBytes: 128,
    };
    owner.install(chunk);
    owner.setLayerPresentation({
      visibleLayers: new Set([12]),
      currentY: 11,
      hiddenGroupIds: new Set(),
      referenceOpacity: 0.28,
    });
    expect(owner.currentChunk('0,0,0')?.meshes[0]).toBe(mesh);
    expect(mesh.visible).toBe(true);
    expect((mesh.material as THREE.Material).opacity).toBe(0.28);
    owner.retainCurrent('0,0,0');
    expect(geometryDispose).not.toHaveBeenCalled();
    const retained = owner.takeResidentVariant('0,0,0', 'chunk-signature');
    expect(retained).toBe(chunk);
    owner.installResidentVariant(retained!);
    expect(owner.currentChunk('0,0,0')?.meshes[0]).toBe(mesh);
    expect(owner.evidence().residentVariantHits).toBe(1);
    owner.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(blocksGroup.children).toHaveLength(0);
    texture.dispose();
  });

  it('discards stale asynchronous material work without retaining a resource', async () => {
    const owner = new FluidChunkResidencyOwner(new THREE.Group());
    owner.setProviderContractKey('provider-a');
    let resolveTexture!: (texture: THREE.Texture) => void;
    const textureReady = new Promise<THREE.Texture>((resolve) => {
      resolveTexture = resolve;
    });
    const provider = {
      contractKey: 'provider-a',
      resolver: vanillaFluidRenderResolver,
      texture: async () => textureReady,
    };
    let current = true;
    const pending = owner.createBuildResources(buildData(), provider, () => current);
    owner.setProviderContractKey('provider-b');
    current = false;
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    resolveTexture(texture);

    expect(await pending).toBeUndefined();
    expect(owner.evidence()).toMatchObject({
      chunks: 0,
      meshes: 0,
      materialBuckets: 0,
      residentVariantCount: 0,
    });
    owner.dispose();
    texture.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FluidChunkRenderer } from './fluid-chunk-renderer';
import { vanillaFluidRenderResolver, type FluidWorldLookup } from './fluid-state';
import { PlacedBlock } from '../../domain/project.types';

const block = (id: string, position: { x: number; y: number; z: number }): PlacedBlock => ({
  kind: 'resolved',
  id,
  namespace: id.split(':')[0],
  position,
  state: { level: '0' },
});
const worldFor = (blocks: readonly PlacedBlock[]): FluidWorldLookup => {
  const map = new Map(
    blocks.map((value) => [`${value.position.x},${value.position.y},${value.position.z}`, value]),
  );
  return { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) };
};

describe('FluidChunkRenderer', () => {
  it('uses bounded chunk meshes and keeps logical ownership', async () => {
    const group = new THREE.Group();
    const renderer = new FluidChunkRenderer(group);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    renderer.setProvider({ resolver: vanillaFluidRenderResolver, texture: async () => texture });
    const blocks = [
      block('minecraft:water', { x: 0, y: 0, z: 0 }),
      block('minecraft:water', { x: 1, y: 0, z: 0 }),
      block('minecraft:water', { x: 16, y: 0, z: 0 }),
    ];
    const records = blocks.map((value) => ({
      block: value,
      state: vanillaFluidRenderResolver.resolve(value)!,
    }));
    await renderer.sync(records, worldFor(blocks));
    expect(renderer.diagnostics()).toMatchObject({
      fluidLogicalVoxels: 3,
      fluidChunks: 2,
      fluidStandaloneMeshes: 0,
    });
    expect(renderer.objectsForVoxel('0,0,0').length).toBeGreaterThan(0);
    expect(group.children).toHaveLength(1);
    renderer.dispose();
    expect(group.children).toHaveLength(0);
  });

  it('rebuilds only the dirty chunk neighborhood for a local edit', async () => {
    const group = new THREE.Group();
    const renderer = new FluidChunkRenderer(group);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    renderer.setProvider({ resolver: vanillaFluidRenderResolver, texture: async () => texture });
    const first = block('minecraft:water', { x: 0, y: 0, z: 0 });
    await renderer.sync(
      [{ block: first, state: vanillaFluidRenderResolver.resolve(first)! }],
      worldFor([first]),
    );
    const second = block('minecraft:water', { x: 1, y: 0, z: 0 });
    await renderer.sync(
      [
        { block: first, state: vanillaFluidRenderResolver.resolve(first)! },
        { block: second, state: vanillaFluidRenderResolver.resolve(second)! },
      ],
      worldFor([first, second]),
      [second.position],
    );
    expect(renderer.diagnostics().fluidIncrementalRebuilds).toBe(1);
    expect(renderer.objectsForVoxel('1,0,0').length).toBeGreaterThan(0);
  });

  it('patches one logical fluid voxel without scanning/replacing unrelated records', async () => {
    const group = new THREE.Group();
    const renderer = new FluidChunkRenderer(group);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    renderer.setProvider({ resolver: vanillaFluidRenderResolver, texture: async () => texture });
    const first = block('minecraft:water', { x: 0, y: 0, z: 0 });
    const other = block('minecraft:water', { x: 32, y: 0, z: 0 });
    await renderer.sync(
      [first, other].map((value) => ({
        block: value,
        state: vanillaFluidRenderResolver.resolve(value)!,
      })),
      worldFor([first, other]),
    );
    const changed = { ...first, state: { level: '4' } };
    await renderer.syncDelta(
      [
        {
          position: first.position,
          before: { block: first, state: vanillaFluidRenderResolver.resolve(first)! },
          after: { block: changed, state: vanillaFluidRenderResolver.resolve(changed)! },
        },
      ],
      [first.position],
      worldFor([changed, other]),
    );
    expect(renderer.hasVoxel('0,0,0')).toBe(true);
    expect(renderer.hasVoxel('32,0,0')).toBe(true);
    expect(renderer.diagnostics().fluidIncrementalRebuilds).toBe(1);
    renderer.dispose();
    texture.dispose();
  });

  it('retains and reuses exact fluid chunk geometry for repeated Y projections', async () => {
    const group = new THREE.Group();
    const renderer = new FluidChunkRenderer(group);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    renderer.setProvider({
      contractKey: 'fluid-test-v1',
      resolver: vanillaFluidRenderResolver,
      texture: async () => texture,
    });
    const lower = block('minecraft:water', { x: 0, y: 10, z: 0 });
    const upper = block('minecraft:water', { x: 0, y: 11, z: 0 });
    const lowerRecord = { block: lower, state: vanillaFluidRenderResolver.resolve(lower)! };
    const upperRecord = { block: upper, state: vanillaFluidRenderResolver.resolve(upper)! };
    const world: FluidWorldLookup = { visualRevisionKey: 7, ...worldFor([lower, upper]) };
    await renderer.sync([lowerRecord], world);
    const originalMesh = renderer.objectsForVoxel('0,10,0')[0] as THREE.Mesh;
    const rebuildsBefore = renderer.diagnostics().fluidChunkRebuilds;

    await renderer.syncDelta(
      [
        { position: lower.position, before: lowerRecord },
        { position: upper.position, after: upperRecord },
      ],
      [lower.position, upper.position],
      world,
    );
    expect(renderer.objectsForVoxel('0,11,0')[0]).not.toBe(originalMesh);
    await renderer.syncDelta(
      [
        { position: upper.position, before: upperRecord },
        { position: lower.position, after: lowerRecord },
      ],
      [upper.position, lower.position],
      world,
    );

    expect(renderer.objectsForVoxel('0,10,0')[0]).toBe(originalMesh);
    expect(renderer.diagnostics().fluidChunkRebuilds - rebuildsBefore).toBe(1);
    expect(renderer.diagnostics().fluidResidentVariantHits).toBe(1);
    expect(renderer.diagnostics().fluidResidentVariantBytes).toBeGreaterThan(0);

    renderer.dispose();
    texture.dispose();
  });

  it('changes resident layer/group visibility and reference role without rebuilding fluid geometry', async () => {
    const root = new THREE.Group();
    const renderer = new FluidChunkRenderer(root);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    renderer.setProvider({
      contractKey: 'layer-fluid-v1',
      resolver: vanillaFluidRenderResolver,
      texture: async () => texture,
    });
    const lower = { ...block('minecraft:water', { x: 0, y: 10, z: 0 }), groupIds: ['lower-group'] };
    const upper = { ...block('minecraft:water', { x: 0, y: 11, z: 0 }), groupIds: ['upper-group'] };
    const records = [lower, upper].map((value) => ({
      block: value,
      state: vanillaFluidRenderResolver.resolve(value)!,
    }));
    renderer.setLayerPresentation({
      visibleLayers: new Set([10, 11]),
      currentY: 10,
      hiddenGroupIds: new Set(),
      referenceOpacity: 0.28,
    });
    await renderer.sync(records, { visualRevisionKey: 1, ...worldFor([lower, upper]) });

    const lowerMesh = renderer
      .objectsForVoxel('0,10,0')
      .find((object) => object.userData['fluidLayer'] === 10) as THREE.Mesh;
    const upperMesh = renderer
      .objectsForVoxel('0,11,0')
      .find((object) => object.userData['fluidLayer'] === 11) as THREE.Mesh;
    expect(lowerMesh).toBeDefined();
    expect(upperMesh).toBeDefined();
    expect(lowerMesh.visible).toBe(true);
    expect(upperMesh.visible).toBe(true);
    expect((upperMesh.material as THREE.Material).opacity).toBe(0.28);
    const rebuilds = renderer.diagnostics().fluidChunkRebuilds;

    renderer.setLayerPresentation({
      visibleLayers: new Set([10, 11]),
      currentY: 11,
      hiddenGroupIds: new Set(['lower-group']),
      referenceOpacity: 0.28,
    });
    expect(
      renderer.objectsForVoxel('0,10,0').find((object) => object.userData['fluidLayer'] === 10),
    ).toBe(lowerMesh);
    expect(
      renderer.objectsForVoxel('0,11,0').find((object) => object.userData['fluidLayer'] === 11),
    ).toBe(upperMesh);
    expect(lowerMesh.visible).toBe(false);
    expect(upperMesh.visible).toBe(true);
    expect((lowerMesh.material as THREE.Material).opacity).toBe(0.28);
    expect((upperMesh.material as THREE.Material).opacity).toBe(1);
    expect(renderer.diagnostics().fluidChunkRebuilds).toBe(rebuilds);
    expect(renderer.layeredPresentationReady).toBe(true);

    renderer.setLayerPresentation({
      visibleLayers: new Set([11]),
      currentY: 11,
      hiddenGroupIds: new Set(),
      isolatedGroupId: 'upper-group',
      referenceOpacity: 0.28,
    });
    expect(lowerMesh.visible).toBe(false);
    expect(upperMesh.visible).toBe(true);
    expect(renderer.diagnostics().fluidChunkRebuilds).toBe(rebuilds);

    renderer.dispose();
    texture.dispose();
    expect(root.children).toHaveLength(0);
  });
});

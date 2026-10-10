import { describe, expect, it } from 'vitest';
import { buildFluidMeshData } from './fluid-mesh-core';
import {
  RegistryFluidRenderResolver,
  vanillaFluidRenderResolver,
  type FluidWorldLookup,
  type ResolvedFluidRenderState,
} from './fluid-state';
import { PlacedBlock } from '../../domain/project.types';

const block = (id: string, position = { x: 0, y: 0, z: 0 }, level = '0'): PlacedBlock => ({
  kind: 'resolved',
  id,
  namespace: id.split(':')[0],
  position,
  state: { level },
});
const worldFor = (blocks: readonly PlacedBlock[]): FluidWorldLookup => {
  const map = new Map(
    blocks.map((value) => [`${value.position.x},${value.position.y},${value.position.z}`, value]),
  );
  return { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) };
};

describe('generic fluid mesh core', () => {
  it('resolves vanilla water and lava through adapter descriptors', () => {
    expect(vanillaFluidRenderResolver.resolve(block('minecraft:water'))).toMatchObject({
      fluidTypeId: 'minecraft:water',
      connectivityKey: 'minecraft:water',
      renderLayer: 'translucent',
    });
    expect(vanillaFluidRenderResolver.resolve(block('minecraft:lava'))).toMatchObject({
      fluidTypeId: 'minecraft:lava',
      connectivityKey: 'minecraft:lava',
      renderLayer: 'solid',
    });
  });

  it('keeps different connectivity identities at their boundary', () => {
    const water = block('minecraft:water');
    const lava = block('minecraft:lava', { x: 1, y: 0, z: 0 });
    const result = buildFluidMeshData(
      [
        { block: water, state: vanillaFluidRenderResolver.resolve(water)! },
        { block: lava, state: vanillaFluidRenderResolver.resolve(lava)! },
      ],
      worldFor([water, lava]),
      vanillaFluidRenderResolver,
    );
    expect(result.fluidFacesEmitted).toBe(12);
    expect(result.fluidFacesCulled).toBe(0);
  });

  it('culls a shared face when connectivity matches, including across chunk boundaries', () => {
    const left = block('minecraft:water', { x: 15, y: 0, z: 0 });
    const right = block('minecraft:water', { x: 16, y: 0, z: 0 });
    const result = buildFluidMeshData(
      [
        { block: left, state: vanillaFluidRenderResolver.resolve(left)! },
        { block: right, state: vanillaFluidRenderResolver.resolve(right)! },
      ],
      worldFor([left, right]),
      vanillaFluidRenderResolver,
    );
    expect(result.fluidFacesPotential).toBe(12);
    expect(result.fluidFacesCulled).toBe(2);
    expect(result.fluidFacesEmitted).toBe(10);
  });

  it('accepts a custom mod fluid without mesh-core changes', () => {
    const resolver = new RegistryFluidRenderResolver();
    resolver.register(
      'mod:test_fluid',
      (value) =>
        ({
          kind: 'water',
          blockLevel: 0,
          fluidLevel: 8,
          falling: false,
          still: true,
          height: 8 / 9,
          fluidTypeId: 'mod:test_fluid',
          connectivityKey: 'mod:test-fluid-connectivity',
          materialKey: 'mod:test-fluid-material',
          renderLayer: 'translucent',
          stillTexture: 'mod:block/test_still',
          flowTexture: 'mod:block/test_flow',
          tint: 0x22aa44,
          doubleSided: true,
          depthWrite: false,
        }) satisfies ResolvedFluidRenderState,
    );
    const value = block('mod:test_fluid');
    const result = buildFluidMeshData(
      [{ block: value, state: resolver.resolve(value)! }],
      worldFor([value]),
      resolver,
    );
    expect(result.fluidLogicalVoxels).toBe(1);
    expect(result.buckets[0].texture).toBe('mod:block/test_still');
  });

  it('culls a confirmed opaque full cube but keeps unknown or partial neighbors visible', () => {
    const water = block('minecraft:water');
    const stone = block('minecraft:stone', { x: 1, y: 0, z: 0 });
    const world: FluidWorldLookup = {
      getBlock: (position) =>
        `${position.x},${position.y},${position.z}` === '0,0,0'
          ? water
          : `${position.x},${position.y},${position.z}` === '1,0,0'
            ? stone
            : undefined,
      getOcclusionClass: (value) =>
        value.id === 'minecraft:stone' ? 'opaque-full-cube' : 'unknown',
    };
    const result = buildFluidMeshData(
      [{ block: water, state: vanillaFluidRenderResolver.resolve(water)! }],
      world,
      vanillaFluidRenderResolver,
    );
    expect(result.fluidFacesCulled).toBe(1);
    expect(result.fluidFacesEmitted).toBe(5);
    const partialResult = buildFluidMeshData(
      [{ block: water, state: vanillaFluidRenderResolver.resolve(water)! }],
      { ...world, getOcclusionClass: () => 'unknown' },
      vanillaFluidRenderResolver,
    );
    expect(partialResult.fluidFacesCulled).toBe(0);
  });

  it('applies the same conservative occlusion policy to top and bottom faces', () => {
    const water = block('minecraft:water');
    const above = block('minecraft:stone', { x: 0, y: 1, z: 0 });
    const below = block('minecraft:stone', { x: 0, y: -1, z: 0 });
    const world: FluidWorldLookup = {
      getBlock: (position) =>
        [water, above, below].find(
          (value) =>
            value.position.x === position.x &&
            value.position.y === position.y &&
            value.position.z === position.z,
        ),
      getOcclusionClass: (value) =>
        value.id === 'minecraft:stone' ? 'opaque-full-cube' : 'unknown',
    };
    const result = buildFluidMeshData(
      [{ block: water, state: vanillaFluidRenderResolver.resolve(water)! }],
      world,
      vanillaFluidRenderResolver,
    );
    expect(result.fluidFacesCulled).toBe(2);
  });

  it('restores the same semantic mesh after a neighboring edit is undone', () => {
    const water = block('minecraft:water');
    const support = block('minecraft:stone', { x: 1, y: 0, z: 0 });
    const resolver = vanillaFluidRenderResolver;
    const snapshot = (worldBlocks: readonly PlacedBlock[]) => {
      const result = buildFluidMeshData(
        [{ block: water, state: resolver.resolve(water)! }],
        worldFor(worldBlocks),
        resolver,
      );
      return result.buckets.map((bucket) => ({
        key: bucket.materialKey,
        texture: bucket.texture,
        tint: bucket.tint,
        opacity: bucket.opacity,
        depthWrite: bucket.depthWrite,
        doubleSided: bucket.doubleSided,
        positions: bucket.positions,
        normals: bucket.normals,
        uvs: bucket.uvs,
        indices: bucket.indices,
        faces: bucket.facesEmitted,
      }));
    };
    const initial = snapshot([water, support]);
    snapshot([water]);
    const restored = snapshot([water, support]);
    expect(restored).toEqual(initial);
  });
});

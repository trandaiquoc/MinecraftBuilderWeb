import { describe, expect, it } from 'vitest';
import { shouldCullFluidFace } from './fluid-face-occlusion';
import { vanillaFluidRenderResolver } from './fluid-state';
import type { FluidWorldLookup } from './fluid-state';

const block = (id: string, position = { x: 0, y: 0, z: 0 }) => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0], position, state: { level: '0' } });

describe('fluid face occlusion policy', () => {
  it('culls connected fluid and confirmed full cubes only', () => {
    const water = block('minecraft:water');
    const same = block('minecraft:water', { x: 1, y: 0, z: 0 });
    const stone = block('minecraft:stone', { x: 0, y: 1, z: 0 });
    const world: FluidWorldLookup = {
      getBlock: (position) => position.y === 1 ? stone : same,
      getOcclusionClass: (value) => value.id === 'minecraft:stone' ? 'opaque-full-cube' : 'unknown',
    };
    const state = vanillaFluidRenderResolver.resolve(water)!;
    expect(shouldCullFluidFace(water.position, 'east', state, world, vanillaFluidRenderResolver)).toBe(true);
    expect(shouldCullFluidFace(water.position, 'up', state, world, vanillaFluidRenderResolver)).toBe(true);
  });

  it('keeps different fluids and partial/unknown neighbors conservative', () => {
    const water = block('minecraft:water');
    const lava = block('minecraft:lava', { x: 1, y: 0, z: 0 });
    const partial = block('minecraft:oak_fence', { x: 0, y: 1, z: 0 });
    const world: FluidWorldLookup = {
      getBlock: (position) => position.y === 1 ? partial : lava,
      getOcclusionClass: () => 'unknown',
    };
    const state = vanillaFluidRenderResolver.resolve(water)!;
    expect(shouldCullFluidFace(water.position, 'east', state, world, vanillaFluidRenderResolver)).toBe(false);
    expect(shouldCullFluidFace(water.position, 'up', state, world, vanillaFluidRenderResolver)).toBe(false);
  });
});

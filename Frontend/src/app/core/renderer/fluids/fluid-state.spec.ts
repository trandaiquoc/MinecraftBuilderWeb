import { describe, expect, it } from 'vitest';
import { calculateFluidHeight, fluidCornerHeights, fluidCornerHeightsResolved, fluidStateForBlock, fluidVelocityResolved, RegistryFluidRenderResolver, vanillaFluidRenderResolver, type FluidWorldLookup } from './fluid-state';
import type { PlacedBlock } from '../../domain/project.types';

const block = (id: string, level: string, y = 0) => ({ kind: 'resolved' as const, id, namespace: 'minecraft', position: { x: 0, y, z: 0 }, state: { level } });

describe('static vanilla fluid state', () => {
  it('maps FluidBlock levels to source fluid levels and falling state', () => {
    expect(fluidStateForBlock(block('minecraft:water', '0'))).toMatchObject({ blockLevel: 0, fluidLevel: 8, still: true, falling: false, height: 8 / 9 });
    for (let level = 1; level <= 7; level++) expect(fluidStateForBlock(block('minecraft:water', String(level)))).toMatchObject({ fluidLevel: 8 - level, height: (8 - level) / 9, falling: false });
    for (const level of ['8', '9', '15']) expect(fluidStateForBlock(block('minecraft:lava', level))).toMatchObject({ fluidLevel: 8, falling: true, height: 8 / 9, still: false });
    expect(fluidStateForBlock(block('minecraft:water', 'invalid'))?.blockLevel).toBe(0);
  });
  it('uses source weighted corner averaging and full height above matching fluid', () => {
    expect(calculateFluidHeight([.9, 0, 0])).toBeCloseTo(.75);
    expect(calculateFluidHeight([.5, .2, -1])).toBeCloseTo(.35);
    const lower = block('minecraft:water', '0'); const upper = block('minecraft:water', '0', 1);
    const world = new Map([['0,0,0', lower], ['0,1,0', upper]]);
    const corners = fluidCornerHeights(lower.position, fluidStateForBlock(lower)!, { getBlock: (position) => world.get(`${position.x},${position.y},${position.z}`) });
    expect(corners.northWest).toBe(1); expect(corners.southEast).toBe(1);
  });

  it('applies an adjacent full column only to the corners that touch it', () => {
    const lower = block('minecraft:water', '1');
    const north = block('minecraft:water', '0', 0); const northAbove = block('minecraft:water', '0', 1);
    north.position = { x: 0, y: 0, z: -1 }; northAbove.position = { x: 0, y: 1, z: -1 };
    const world = new Map([['0,0,0', lower], ['0,0,-1', north], ['0,1,-1', northAbove]]);
    const corners = fluidCornerHeights(lower.position, fluidStateForBlock(lower)!, { getBlock: (position) => world.get(`${position.x},${position.y},${position.z}`) });
    expect(corners.northWest).toBeGreaterThan(corners.southWest);
    expect(corners.northEast).toBeGreaterThan(corners.southEast);
    expect(corners.southWest).toBeLessThan(1);
    expect(corners.southEast).toBeLessThan(1);
  });

  it('keeps east full-column and diagonal contributions local to their corners', () => {
    const current = block('minecraft:water', '1');
    const east = block('minecraft:water', '0'); east.position = { x: 1, y: 0, z: 0 };
    const eastAbove = block('minecraft:water', '0', 1); eastAbove.position = { x: 1, y: 1, z: 0 };
    const diagonal = block('minecraft:water', '0'); diagonal.position = { x: 1, y: 0, z: -1 };
    const diagonalAbove = block('minecraft:water', '0', 1); diagonalAbove.position = { x: 1, y: 1, z: -1 };
    const map = new Map([['0,0,0', current], ['1,0,0', east], ['1,1,0', eastAbove], ['1,0,-1', diagonal], ['1,1,-1', diagonalAbove]]);
    const corners = fluidCornerHeights(current.position, fluidStateForBlock(current)!, { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) });
    expect(corners.northEast).toBeGreaterThan(corners.northWest);
    expect(corners.southEast).toBeGreaterThan(corners.southWest);
    expect(corners.southEast).toBeLessThan(1);
  });

  it('keeps vanilla identity in the generic resolver and preserves waterlogged sampling', () => {
    const water = block('minecraft:water', '0');
    expect(vanillaFluidRenderResolver.resolve(water)).toMatchObject({ fluidTypeId: 'minecraft:water', connectivityKey: 'minecraft:water', stillTexture: 'minecraft:block/water_still' });
    const fake = new RegistryFluidRenderResolver().register('mod:fluid', (value) => ({ ...fluidStateForBlock(water)!, fluidTypeId: 'mod:fluid', connectivityKey: 'mod:fluid', materialKey: 'mod:fluid', renderLayer: 'translucent' as const, stillTexture: 'mod:block/still', flowTexture: 'mod:block/flow', doubleSided: true, depthWrite: false }));
    expect(fake.resolve({ ...water, id: 'mod:fluid', namespace: 'mod' })?.connectivityKey).toBe('mod:fluid');
  });

  it('delegates embedded-fluid height to the adapter instead of checking IDs in sampling', () => {
    const water = block('minecraft:water', '0');
    const embedded = { ...water, id: 'mod:waterlogged_container', namespace: 'mod', state: { level: '0', waterlogged: 'true' } };
    const resolver = new RegistryFluidRenderResolver()
      .register('minecraft:water', () => ({ ...fluidStateForBlock(water)!, fluidTypeId: 'mod:fluid', connectivityKey: 'mod:fluid', materialKey: 'mod:fluid', renderLayer: 'translucent' as const, stillTexture: 'mod:block/still', flowTexture: 'mod:block/flow', doubleSided: true, depthWrite: false }))
      .register('mod:fluid', () => ({ ...fluidStateForBlock(water)!, fluidTypeId: 'mod:fluid', connectivityKey: 'mod:fluid', materialKey: 'mod:fluid', renderLayer: 'translucent' as const, stillTexture: 'mod:block/still', flowTexture: 'mod:block/flow', doubleSided: true, depthWrite: false }))
      .registerEmbeddedFluidHeight((blockValue) => blockValue.state['waterlogged'] === 'true' ? 0.5 : undefined);
    const state = resolver.resolve(water)!;
    const world = { getBlock: (position: typeof water.position) => position.x === 0 && position.y === 0 && position.z === 0 ? embedded : undefined };
    expect(fluidCornerHeightsResolved(water.position, state, world, resolver).northWest).toBeCloseTo(0.5);
  });

  it('points toward an open lower fluid edge and ignores a blocked solid edge', () => {
    const current = block('minecraft:water', '0');
    const lower = block('minecraft:water', '7', 0); lower.position = { x: 1, y: 0, z: 0 };
    const west = block('minecraft:water', '0', 0); west.position = { x: -1, y: 0, z: 0 };
    const state = vanillaFluidRenderResolver.resolve(current)!;
    const lowerWorld = new Map([['0,0,0', current], ['1,0,0', lower], ['-1,0,0', west]]);
    expect(fluidVelocityResolved(current.position, state, { getBlock: (position) => lowerWorld.get(`${position.x},${position.y},${position.z}`) }, vanillaFluidRenderResolver).x).toBeGreaterThan(0);
    const solid = { ...lower, id: 'minecraft:stone', state: {} };
    expect(fluidVelocityResolved(current.position, state, { getBlock: (position) => position.x === 0 && position.y === 0 && position.z === 0 ? current : position.x < 0 && position.y === 0 && position.z === 0 ? west : solid, getDefinition: () => ({ behavior: { kind: 'solid' } } as never) }, vanillaFluidRenderResolver)).toEqual({ x: 0, z: 0 });
  });

  it('uses open falling edges for horizontal flow and excludes opaque blockers', () => {
    const falling = block('minecraft:water', '8');
    const west = { ...block('minecraft:stone', '0'), position: { x: -1, y: 0, z: 0 } };
    const world: FluidWorldLookup = {
      getBlock: (position: typeof falling.position) => position.x === 0 && position.y === 0 && position.z === 0 ? falling : position.x === -1 && position.y === 0 && position.z === 0 ? west : undefined,
      getOcclusionClass: (value: PlacedBlock) => value.id === 'minecraft:stone' ? 'opaque-full-cube' as const : 'unknown' as const,
    };
    expect(fluidVelocityResolved(falling.position, vanillaFluidRenderResolver.resolve(falling)!, world, vanillaFluidRenderResolver).x).toBeGreaterThan(0);
  });
});

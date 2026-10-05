import { describe, expect, it } from 'vitest';
import { calculateFluidHeight, fluidCornerHeights, fluidStateForBlock, RegistryFluidRenderResolver, vanillaFluidRenderResolver } from './fluid-state';

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

  it('keeps vanilla identity in the generic resolver and preserves waterlogged sampling', () => {
    const water = block('minecraft:water', '0');
    expect(vanillaFluidRenderResolver.resolve(water)).toMatchObject({ fluidTypeId: 'minecraft:water', connectivityKey: 'minecraft:water', stillTexture: 'minecraft:block/water_still' });
    const fake = new RegistryFluidRenderResolver().register('mod:fluid', (value) => ({ ...fluidStateForBlock(water)!, fluidTypeId: 'mod:fluid', connectivityKey: 'mod:fluid', materialKey: 'mod:fluid', renderLayer: 'translucent' as const, stillTexture: 'mod:block/still', flowTexture: 'mod:block/flow', doubleSided: true, depthWrite: false }));
    expect(fake.resolve({ ...water, id: 'mod:fluid', namespace: 'mod' })?.connectivityKey).toBe('mod:fluid');
  });
});

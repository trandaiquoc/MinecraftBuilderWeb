import { describe, expect, it } from 'vitest';
import { BlockModelResolver, createResolver } from './block-model-resolver';

const cube = {
  parent: 'minecraft:block/base',
  textures: { all: 'minecraft:block/stone' },
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all', uv: [0, 0, 16, 16], rotation: 90, cullface: 'north', tintindex: 2 } } }],
};

function resolver(resources: Readonly<Record<string, unknown>>): BlockModelResolver {
  return createResolver(resources);
}

describe('Minecraft block model resolver', () => {
  it('matches the most specific variant and preserves configured rotation/UV lock', () => {
    const result = resolver({
      'assets/minecraft/blockstates/test.json': { variants: { 'facing=north': { model: 'minecraft:block/test', x: 90, y: 180, uvlock: true } } },
      'assets/minecraft/models/block/test.json': cube,
      'assets/minecraft/models/block/base.json': { textures: { all: 'minecraft:block/stone' }, elements: cube.elements },
    }).resolve('minecraft:test', { facing: 'north' });

    expect(result.support).toBe('full');
    expect(result.parts[0].transform).toEqual({ x: 90, y: 180, uvlock: true });
    expect(result.parts[0].textures['all']).toBe('minecraft:block/stone');
    expect(result.parts[0].elements[0].faces['north']).toEqual({ texture: 'minecraft:block/stone', uv: [0, 0, 16, 16], rotation: 90, cullface: 'north', tintindex: 2 });
  });

  it('keeps variant subset matching and preserves raw element coordinates/reversed UV', () => {
    const result = resolver({
      'assets/minecraft/blockstates/test.json': { __comment: 'ignored metadata', variants: { 'facing=north,half=bottom': { model: 'minecraft:block/test' } } },
      'assets/minecraft/models/block/test.json': { __comment: 'ignored metadata', elements: [{ from: [-2, 1, 18], to: [20, 16, 3], faces: { north: { texture: 'minecraft:block/stone', uv: [16, 16, 0, 0] } } }] },
    }).resolve('minecraft:test', { facing: 'north', half: 'bottom', powered: 'true' });
    expect(result.support).toBe('full');
    expect(result.parts[0].elements[0].from).toEqual([-2, 1, 18]);
    expect(result.parts[0].elements[0].faces['north']?.uv).toEqual([16, 16, 0, 0]);
  });

  it('uses the empty default variant and chooses weighted models deterministically', () => {
    const resources = {
      'assets/minecraft/blockstates/test.json': { variants: { '': [{ model: 'minecraft:block/a', weight: 1 }, { model: 'minecraft:block/b', weight: 3 }] } },
      'assets/minecraft/models/block/a.json': { elements: [] },
      'assets/minecraft/models/block/b.json': { elements: [] },
    };
    const first = resolver(resources).resolve('minecraft:test', {}, 'voxel:1,2,3');
    const second = resolver(resources).resolve('minecraft:test', {}, 'voxel:1,2,3');
    expect(first.parts[0].model).toBe(second.parts[0].model);
    expect(first.parts[0].weight).toBeGreaterThan(0);
  });

  it('applies every matching multipart part with AND, OR, and pipe conditions', () => {
    const result = resolver({
      'assets/minecraft/blockstates/test.json': { multipart: [
        { when: { north: 'true', east: 'true' }, apply: { model: 'minecraft:block/north-east' } },
        { when: { OR: [{ south: 'true' }, { west: 'true' }] }, apply: { model: 'minecraft:block/side' } },
        { when: { facing: 'north|south' }, apply: { model: 'minecraft:block/facing' } },
      ] },
      'assets/minecraft/models/block/north-east.json': { elements: [] },
      'assets/minecraft/models/block/side.json': { elements: [] },
      'assets/minecraft/models/block/facing.json': { elements: [] },
    }).resolve('minecraft:test', { north: 'true', east: 'true', south: 'false', west: 'false', facing: 'north' });
    expect(result.parts.map((part) => part.model)).toEqual(['minecraft:block/north-east', 'minecraft:block/facing']);
  });

  it('inherits parent elements/textures and resolves multi-level texture indirection', () => {
    const result = resolver({
      'assets/minecraft/blockstates/test.json': { variants: { '': { model: 'minecraft:block/child' } } },
      'assets/minecraft/models/block/child.json': { parent: 'minecraft:block/parent', textures: { side: '#base' } },
      'assets/minecraft/models/block/parent.json': { parent: 'minecraft:block/template', textures: { base: '#stone' } },
      'assets/minecraft/models/block/template.json': { textures: { stone: 'minecraft:block/stone' }, elements: [{ from: [1, 2, 3], to: [4, 5, 6], faces: {} }] },
    }).resolve('minecraft:test');
    expect(result.support).toBe('full');
    expect(result.parts[0].textures['side']).toBe('minecraft:block/stone');
    expect(result.parts[0].elements[0].from).toEqual([1, 2, 3]);
  });

  it('returns controlled diagnostics for missing resources, parent cycles, and texture cycles', () => {
    const missing = resolver({ 'assets/minecraft/blockstates/test.json': { variants: { '': { model: 'minecraft:block/missing' } } } }).resolve('minecraft:test');
    expect(missing.support).toBe('fallback');
    expect(missing.diagnostics.some((item) => item.code === 'missing-model')).toBe(true);

    const cycle = resolver({
      'assets/minecraft/blockstates/test.json': { variants: { '': { model: 'minecraft:block/a' } } },
      'assets/minecraft/models/block/a.json': { parent: 'minecraft:block/b' },
      'assets/minecraft/models/block/b.json': { parent: 'minecraft:block/a' },
    }).resolve('minecraft:test');
    expect(cycle.diagnostics.some((item) => item.code === 'parent-cycle')).toBe(true);

    const textureCycle = resolver({
      'assets/minecraft/blockstates/test.json': { variants: { '': { model: 'minecraft:block/a' } } },
      'assets/minecraft/models/block/a.json': { textures: { a: '#b', b: '#a' }, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { up: { texture: '#a' } } }] },
    }).resolve('minecraft:test');
    expect(textureCycle.diagnostics.some((item) => item.code === 'texture-cycle')).toBe(true);

    const missingTexture = resolver({
      'assets/minecraft/blockstates/test.json': { variants: { '': { model: 'minecraft:block/a' } } },
      'assets/minecraft/models/block/a.json': { textures: {}, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { up: { texture: '#missing' } } }] },
    }).resolve('minecraft:test');
    expect(missingTexture.diagnostics.some((item) => item.code === 'missing-texture')).toBe(true);
  });

  it('rotates supported facing/axis BlockState values without changing unrelated properties', () => {
    const engine = resolver({});
    expect(engine.rotateState({ facing: 'north', waterlogged: 'false' }, [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }], 1)).toEqual({ state: { facing: 'east', waterlogged: 'false' }, supported: true, diagnostics: [] });
    expect(engine.rotateState({ axis: 'x' }, [{ name: 'axis', values: ['x', 'y', 'z'] }], 1).state?.['axis']).toBe('z');
    expect(engine.rotateState({ mode: 'custom' }, [{ name: 'mode', values: ['custom'] }], 1).supported).toBe(false);
  });
});

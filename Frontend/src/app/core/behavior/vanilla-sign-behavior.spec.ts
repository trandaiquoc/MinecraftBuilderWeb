import { describe, expect, it } from 'vitest';
import { VanillaBehaviorRegistry } from './vanilla-behavior-registry';

const base = (id: string) => ({
  id,
  displayName: id,
  defaultState: {},
  stateDefinitions: [],
  resources: { textures: [] },
});

describe('vanilla Java 1.21.1 sign behavior metadata', () => {
  const registry = new VanillaBehaviorRegistry();

  it('keeps four canonical registry forms while exposing two placement families', () => {
    expect(registry.enrich(base('minecraft:oak_sign')).behavior).toMatchObject({ kind: 'standing-sign', wallBlockId: 'minecraft:oak_wall_sign' });
    expect(registry.enrich(base('minecraft:oak_wall_sign')).behavior).toMatchObject({ kind: 'wall-sign' });
    expect(registry.enrich(base('minecraft:acacia_hanging_sign')).behavior).toMatchObject({ kind: 'hanging-sign', wallBlockId: 'minecraft:acacia_wall_hanging_sign' });
    expect(registry.enrich(base('minecraft:acacia_wall_hanging_sign')).behavior).toMatchObject({ kind: 'wall-hanging-sign' });
  });

  it('provides sixteen standing/hanging rotations and canonical attached state', () => {
    const sign = registry.enrich(base('minecraft:oak_sign'));
    const hanging = registry.enrich(base('minecraft:oak_hanging_sign'));
    expect(sign.stateDefinitions.find((entry) => entry.name === 'rotation')?.values).toHaveLength(16);
    expect(hanging.defaultState).toMatchObject({ rotation: '0', attached: 'false', waterlogged: 'false' });
  });
});

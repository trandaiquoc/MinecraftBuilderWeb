import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import {
  decoratedPotBaseModel,
  decoratedPotRootRotationRadians,
  decoratedPotSherdTextureResource,
  decoratedPotSideModels,
  DecoratedPotVisualProvider,
} from './decorated-pot-visual-provider';

const provider = new DecoratedPotVisualProvider();
const pot = (decorations?: Record<string, string>): PlacedBlock => ({
  kind: 'resolved',
  id: 'minecraft:decorated_pot',
  namespace: 'minecraft',
  position: { x: 0, y: 0, z: 0 },
  state: { facing: 'north' },
  blockEntityData: decorations ? { kind: 'decorated-pot', decorations } as PlacedBlock['blockEntityData'] : undefined,
});

describe('DecoratedPotVisualProvider', () => {
  it('claims only the exact vanilla pot and resolves independent side resources', () => {
    expect(provider.family).toBe('decorated-pots');
    expect(provider.overrideGeneric).toBe(true);
    expect(provider.matches(pot())).toBe(true);
    expect(provider.matches({ ...pot(), id: 'example:decorated_pot', namespace: 'example' })).toBe(false);

    const target = pot({
      back: 'minecraft:angler_pottery_sherd',
      left: 'minecraft:flow_pottery_sherd',
      right: 'minecraft:skull_pottery_sherd',
      front: 'minecraft:guster_pottery_sherd',
    });
    expect(provider.textureResource()).toBe('minecraft:entity/decorated_pot/decorated_pot_base');
    expect(provider.textureResources(target)).toEqual({
      base: 'minecraft:entity/decorated_pot/decorated_pot_base',
      back: 'minecraft:entity/decorated_pot/angler_pottery_pattern',
      left: 'minecraft:entity/decorated_pot/flow_pottery_pattern',
      right: 'minecraft:entity/decorated_pot/skull_pottery_pattern',
      front: 'minecraft:entity/decorated_pot/guster_pottery_pattern',
    });
    expect(decoratedPotSherdTextureResource('minecraft:angler_pottery_sherd')).toBe('minecraft:entity/decorated_pot/angler_pottery_pattern');
  });

  it('keeps exact ModelPart descriptors and side face masks', () => {
    expect(decoratedPotBaseModel.textureSize).toEqual([32, 32]);
    expect(decoratedPotBaseModel.parts[0]).toMatchObject({ id: 'neck', pivot: [0, 37, 16], rotation: [180, 0, 0] });
    expect(decoratedPotBaseModel.parts[0].cuboids).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: [4, 17, 4], size: [8, 3, 8], dilation: -.1 }),
      expect.objectContaining({ from: [5, 20, 5], size: [6, 1, 6], dilation: .2 }),
    ]));
    expect(decoratedPotBaseModel.parts[1].cuboids[0]).toMatchObject({ uv: [-14, 13], size: [14, 0, 14] });
    expect(decoratedPotSideModels.back.parts[0]).toMatchObject({ pivot: [15, 16, 1], rotation: [0, 0, 180] });
    expect(decoratedPotSideModels.front.parts[0]).toMatchObject({ pivot: [1, 16, 15], rotation: [180, 0, 0] });
    for (const model of Object.values(decoratedPotSideModels)) {
      expect(model.parts[0].cuboids[0]).toMatchObject({ uv: [1, 0], size: [14, 16, 0], faces: ['north'] });
    }
    const plane = createSpecialModel(decoratedPotSideModels.back);
    let meshes = 0;
    plane.traverse((object) => { if (object instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(1);
  });

  it.each([['north', 0], ['south', Math.PI], ['west', Math.PI / 2], ['east', -Math.PI / 2]])(
    'uses vanilla root rotation for %s', (facing, radians) => {
      expect(decoratedPotRootRotationRadians(facing)).toBeCloseTo(radians);
      const visual = provider.create({ ...pot(), state: { facing } });
      expect(visual.rotation.y).toBeCloseTo(radians);
    },
  );
});

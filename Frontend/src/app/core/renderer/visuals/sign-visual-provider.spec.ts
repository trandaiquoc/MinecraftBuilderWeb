import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { SignVisualProvider, signTextLayout } from './sign-visual-provider';

const provider = new SignVisualProvider();
const block = (id: string, state: Record<string, string> = {}): PlacedBlock => ({
  kind: 'resolved',
  id,
  namespace: id.split(':')[0] ?? 'minecraft',
  position: { x: 0, y: 0, z: 0 },
  state,
});
const signData = {
  kind: 'sign' as const,
  front: {
    lines: ['Front', '', '', ''] as [string, string, string, string],
    color: 'black',
    glowing: false,
  },
  back: {
    lines: ['Back', '', '', ''] as [string, string, string, string],
    color: 'black',
    glowing: false,
  },
  waxed: false,
};

describe('SignVisualProvider', () => {
  it('applies the Java wall-sign transform independently of wall-facing state', () => {
    const sign = block('minecraft:oak_wall_sign');
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = provider.create({ ...sign, state: { facing } });
      expect(visual.position.toArray()).toEqual([0.5, 0.5, 0.5]);
      expect(visual.children[0].position.toArray()).toEqual([0, -0.3125, -0.4375]);
    }
  });

  it('keeps the wall-sign back edge on the support plane for all facings', () => {
    for (const [facing, axis] of [
      ['north', 'z'],
      ['south', 'z'],
      ['east', 'x'],
      ['west', 'x'],
    ] as const) {
      const visual = provider.create({ ...block('minecraft:oak_wall_sign'), state: { facing } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const edge =
        axis === 'z'
          ? facing === 'north'
            ? bounds.max.z
            : bounds.min.z
          : facing === 'west'
            ? bounds.max.x
            : bounds.min.x;
      expect(edge, facing).toBeGreaterThan(facing === 'north' || facing === 'west' ? 0.97 : 0.0);
    }
  });

  it('uses a separate wall-hanging-sign hierarchy while retaining the shared facing transform for text', () => {
    const visual = provider.create({
      ...block('minecraft:oak_wall_hanging_sign'),
      state: { facing: 'east' },
    });
    expect(visual.children).toHaveLength(1);
    expect(visual.position.y).toBeCloseTo(0.9375);
    expect(visual.children[0].position.y).toBeCloseTo(-0.3125);
    expect(visual.rotation.y).toBeCloseTo(-Math.PI * 1.5);
  });

  it('uses the verified Java 1.21.1 normal Sign ModelPart dimensions and standing/wall visibility', () => {
    const standingBlock = block('minecraft:oak_sign', { rotation: '0', waterlogged: 'false' });
    const wallBlock = block('minecraft:oak_wall_sign', { facing: 'north', waterlogged: 'false' });
    const standing = provider.create(standingBlock);
    const wall = provider.create(wallBlock);
    expect(provider.textureResource(standingBlock)).toBe('minecraft:entity/signs/oak');
    expect(standing.userData['providerId']).toBe('minecraft-java-sign-1.21.1-modelpart');
    expect(standing.children[0].children).toHaveLength(2);
    expect(standing.children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children).toHaveLength(2);
    expect(wall.children[0].children[0].children[1].visible).toBe(false);
    expect(standing.children[0].children[0].scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
  });

  it('keeps sign text layout independent from the model branch scale', () => {
    expect(signTextLayout('standing')).toEqual({
      y: 0.33333334,
      z: 0.046666667,
      scale: 2 / 3,
      lineHeight: 10,
      maxWidth: 90,
    });
    expect(signTextLayout('hanging')).toEqual({
      y: -0.32,
      z: 0.073,
      scale: 0.9,
      lineHeight: 9,
      maxWidth: 60,
    });
    const visual = provider.create(block('minecraft:oak_sign'));
    expect(visual.children[0]?.children[0]?.scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
    expect(visual.children[0]?.children[1]?.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('places text offsets in world space before text scale for all sign variants', () => {
    const cases = [
      ['minecraft:oak_sign', { rotation: '0' }, 0.83333334],
      ['minecraft:oak_wall_sign', { facing: 'south' }, 0.52083334],
      ['minecraft:oak_hanging_sign', { rotation: '0' }, 0.305],
      ['minecraft:oak_wall_hanging_sign', { facing: 'south' }, 0.305],
    ] as const;
    for (const [id, state, expectedY] of cases) {
      const visual = provider.create({ ...block(id, state), blockEntityData: signData });
      visual.updateMatrixWorld(true);
      const placement = visual.children[0]!;
      const textBranch = placement.children[1]!;
      const frontOffset = textBranch.children[0]!.children[0]!;
      const backOffset = textBranch.children[1]!.children[0]!;
      const frontWorld = frontOffset.getWorldPosition(new THREE.Vector3());
      const backWorld = backOffset.getWorldPosition(new THREE.Vector3());
      expect(frontWorld.y, id).toBeCloseTo(expectedY, 4);
      expect(backWorld.y, id).toBeCloseTo(expectedY, 4);
      if (id === 'minecraft:oak_sign') {
        expect(frontWorld.z).toBeGreaterThan(0.54);
        expect(backWorld.z).toBeLessThan(0.46);
      }
      if (id === 'minecraft:oak_wall_sign') {
        expect(frontWorld.z).toBeGreaterThan(0.1);
        expect(backWorld.z).toBeLessThan(0.02);
      }
      const variant = id.includes('hanging_sign') ? 'hanging' : 'standing';
      const offset = signTextLayout(variant);
      expect((frontOffset as THREE.Group).userData['signTextOffset']).toEqual([
        0,
        offset.y,
        offset.z,
      ]);
      expect((frontOffset.children[0] as THREE.Group).scale.x).toBeCloseTo(
        offset.scale * 0.015625,
        8,
      );
    }
  });

  it('uses hanging-sign chain visibility and the separate wall-hanging plank state', () => {
    const hanging = provider.create({
      ...block('minecraft:acacia_hanging_sign'),
      state: { rotation: '4', attached: 'false' },
    });
    const attached = provider.create({
      ...block('minecraft:acacia_hanging_sign'),
      state: { rotation: '4', attached: 'true' },
    });
    const wall = provider.create({
      ...block('minecraft:acacia_wall_hanging_sign'),
      state: { facing: 'east' },
    });
    expect(hanging.children[0].children[0].children[1].visible).toBe(false);
    expect(hanging.children[0].children[0].children[2].visible).toBe(true);
    expect(attached.children[0].children[0].children[2].visible).toBe(false);
    expect(attached.children[0].children[0].children[3].visible).toBe(true);
    expect(wall.children[0].children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children[0].children[2].visible).toBe(true);
    expect(wall.children[0].children[0].children[3].visible).toBe(false);
    expect(wall.position.y).toBeCloseTo(0.9375);
  });
});

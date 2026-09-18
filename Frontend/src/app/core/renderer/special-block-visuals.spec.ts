import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SpecialBlockVisualRegistry } from './special-block-visuals';
import { modelPartCuboidUv } from './special-model-descriptor';

const registry = new SpecialBlockVisualRegistry();
const block = (id: string) => ({ kind: 'resolved' as const, id, namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });

describe('special block visuals', () => {
  it.each([['minecraft:red_bed', 'beds'], ['minecraft:chest', 'containers'], ['minecraft:oak_sign', 'signs'], ['minecraft:red_banner', 'banners'], ['minecraft:skeleton_skull', 'heads-skulls'], ['minecraft:blue_shulker_box', 'shulker-boxes']])('creates a static visual for %s', (id, family) => {
    const adapter = registry.resolve(block(id));
    expect(adapter?.family).toBe(family);
    expect(adapter?.create(block(id)).children.length).toBeGreaterThan(0);
  });
  it('does not claim generic JSON blocks as special', () => expect(registry.resolve(block('minecraft:stone'))).toBeUndefined());
  it('uses one data-driven vanilla descriptor for colors, parts, and facing', () => {
    const bed = registry.resolve(block('minecraft:red_bed'))!;
    expect(bed.textureResource?.(block('minecraft:red_bed'))).toBe('minecraft:entity/bed/red');
    expect(bed.textureResource?.(block('minecraft:blue_bed'))).toBe('minecraft:entity/bed/blue');
    const head = bed.create({ ...block('minecraft:red_bed'), state: { part: 'head', facing: 'north' } });
    const foot = bed.create({ ...block('minecraft:red_bed'), state: { part: 'foot', facing: 'north' } });
    expect(head.userData['bedGeometry']).toBe('minecraft-java-bed-1.21.1-modelpart');
    expect(head.userData['bedWorldFootOffset']).toBe(0);
    expect(head.children.length).toBe(1); expect(foot.children.length).toBe(1);
  });
  it.each(['head', 'foot'] as const)('keeps the exact Bed %s ModelPart vertices inside one local voxel for every facing', (part) => {
    const bed = registry.resolve(block('minecraft:red_bed'))!;
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = bed.create({ ...block('minecraft:red_bed'), state: { part, facing } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.x, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.min.y, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.min.z, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.max.x).toBeLessThanOrEqual(1.000001);
      expect(bounds.max.y).toBeCloseTo(.5625, 5);
      expect(bounds.max.z, `${part}/${facing} max=${bounds.max.toArray()}`).toBeLessThanOrEqual(1.000001);
      expect(bounds.min.y).toBeCloseTo(0, 5);
    }
  });
  it('does not select the 1.21.1 Bed provider for an unverified game version', () => {
    expect(new SpecialBlockVisualRegistry('1.22').resolve(block('minecraft:red_bed'))).toBeUndefined();
  });
  it('derives all six ModelPart cuboid UV regions without a cropped texture clone', () => {
    const uv = modelPartCuboidUv({ id: 'head', uv: [0, 0], from: [0, 0, 0], size: [16, 16, 6] });
    expect(uv.north).toEqual([6, 6, 22, 22]);
    expect(uv.up).toEqual([6, 0, 22, 6]);
    expect(uv.east).not.toEqual(uv.west);
  });
  it('applies the Java wall-sign transform independently of wall-facing state', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_sign'))!;
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing } });
      expect(visual.position.toArray()).toEqual([.5, .5, .5]);
      expect(visual.children[0].position.toArray()).toEqual([0, -.3125, -.4375]);
    }
  });
  it('uses a separate wall-hanging-sign hierarchy while retaining the shared facing transform for text', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_hanging_sign'))!;
    const visual = sign.create({ ...block('minecraft:oak_wall_hanging_sign'), state: { facing: 'east' } });
    expect(visual.children).toHaveLength(1);
    expect(visual.position.y).toBeCloseTo(.9375);
    expect(visual.children[0].position.y).toBeCloseTo(-.3125);
    expect(visual.rotation.y).toBeCloseTo(-Math.PI * 1.5);
  });
  it('uses the verified Java 1.21.1 normal Sign ModelPart dimensions and standing/wall visibility', () => {
    const sign = registry.resolve(block('minecraft:oak_sign'))!;
    const standing = sign.create({ ...block('minecraft:oak_sign'), state: { rotation: '0', waterlogged: 'false' } });
    const wall = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing: 'north', waterlogged: 'false' } });
    expect(sign.textureResource?.(block('minecraft:oak_sign'))).toBe('minecraft:entity/signs/oak');
    expect(standing.userData['providerId']).toBe('minecraft-java-sign-1.21.1-modelpart');
    expect(standing.children[0].children[0].children).toHaveLength(6);
    expect(standing.children[1].visible).toBe(true);
    expect(wall.children[0].children[1].visible).toBe(false);
    expect(standing.scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
  });
  it('uses hanging-sign chain visibility and the separate wall-hanging plank state', () => {
    const sign = registry.resolve(block('minecraft:acacia_hanging_sign'))!;
    const hanging = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'false' } });
    const attached = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'true' } });
    const wall = sign.create({ ...block('minecraft:acacia_wall_hanging_sign'), state: { facing: 'east' } });
    expect(sign.textureResource?.(block('minecraft:acacia_hanging_sign'))).toBe('minecraft:entity/signs/hanging/acacia');
    expect(hanging.children[0].children[1].visible).toBe(false);
    expect(hanging.children[0].children[2].visible).toBe(true);
    expect(attached.children[0].children[2].visible).toBe(false);
    expect(attached.children[0].children[3].visible).toBe(true);
    expect(wall.children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children[2].visible).toBe(true);
    expect(wall.children[0].children[3].visible).toBe(false);
    expect(wall.position.y).toBeCloseTo(.9375);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SpecialCuboidDescriptor } from './special-model-descriptor';
import { createSpecialModel, modelPartCuboidUv } from './special-model-geometry';

describe('special model geometry', () => {
  it('derives all six ModelPart cuboid UV regions', () => {
    const uv = modelPartCuboidUv({ id: 'head', uv: [0, 0], from: [0, 0, 0], size: [16, 16, 6] });
    expect(uv.down).toEqual([6, 0, 22, 6]);
    expect(uv.up).toEqual([22, 6, 38, 0]);
    expect(uv.west).toEqual([0, 6, 6, 22]);
    expect(uv.north).toEqual([6, 6, 22, 22]);
    expect(uv.east).toEqual([22, 6, 28, 22]);
    expect(uv.south).toEqual([28, 6, 44, 22]);
    expect(uv.east).not.toEqual(uv.west);
  });

  it('keeps UV dimensions tied to the base cuboid when dilation expands geometry', () => {
    const base = modelPartCuboidUv({
      id: 'head',
      uv: [32, 0],
      from: [-4, -8, -4],
      size: [8, 8, 8],
    });
    const dilated = modelPartCuboidUv({
      id: 'hat',
      uv: [32, 0],
      from: [-4, -8, -4],
      size: [8, 8, 8],
      dilation: 0.25,
    });
    expect(dilated).toEqual(base);
  });

  it('uses Java ModelPart top-to-bottom UV orientation for entity faces', () => {
    const visual = createSpecialModel({
      id: 'uv-test',
      textureSize: [32, 32],
      parts: [
        { id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }] },
      ],
    });
    const mesh = visual.children[0].children[0].children[0] as THREE.Mesh;
    const uv = Array.from(mesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    expect(uv[0]).toBeCloseTo(16 / 32);
    expect(uv[2]).toBeCloseTo(8 / 32);
    expect(uv[1]).toBeCloseTo(1 - 8 / 32);
    expect(uv[3]).toBeCloseTo(1 - 8 / 32);
    expect(uv[5]).toBeCloseTo(1 - 16 / 32);
    expect(uv[7]).toBeCloseTo(1 - 16 / 32);
  });

  it('keeps the ModelPart Quad vertex order for every cuboid face', () => {
    const cuboid: SpecialCuboidDescriptor = {
      id: 'head',
      uv: [0, 0],
      from: [0, 0, 0],
      size: [16, 16, 6],
    };
    const visual = createSpecialModel({
      id: 'uv-faces',
      textureSize: [64, 64],
      parts: [{ id: 'head', cuboids: [cuboid] }],
    });
    const faceNames = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
    const uv = modelPartCuboidUv(cuboid);
    const cuboidGroup = visual.children[0].children[0];
    for (const [index, face] of faceNames.entries()) {
      const attribute = (cuboidGroup.children[index] as THREE.Mesh).geometry.getAttribute('uv');
      const values = Array.from(attribute.array as ArrayLike<number>);
      const [u1, v1, u2, v2] = uv[face];
      expect(values.slice(0, 8), face).toEqual([
        u2 / 64,
        1 - v1 / 64,
        u1 / 64,
        1 - v1 / 64,
        u1 / 64,
        1 - v2 / 64,
        u2 / 64,
        1 - v2 / 64,
      ]);
    }
  });
});

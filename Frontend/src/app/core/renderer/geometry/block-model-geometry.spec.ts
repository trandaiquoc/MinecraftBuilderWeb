import { describe, expect, it } from 'vitest';
import { ResolvedElement, ResolvedFace } from '../../blocks/resolver';
import { faceGeometry, shadeDirectionFactor } from './block-model-geometry';

const face: ResolvedFace = { texture: 'minecraft:block/stone', uv: [16, 13, 0, 16] };

describe('block model geometry', () => {
  it('preserves out-of-range element coordinates and reversed UV ordering', () => {
    const element: ResolvedElement = { from: [-2, 0, 0], to: [20, 8, 16], faces: { north: face } };
    const geometry = faceGeometry(element, 'north', face);
    const position = [...geometry.getAttribute('position').array];
    const uv = [...geometry.getAttribute('uv').array];
    expect(Math.min(...position)).toBe(-0.125);
    expect(Math.max(...position)).toBe(1.25);
    expect(uv).toEqual([1, 0, 0, 0, 0, 0.1875, 1, 0.1875]);
  });

  it('applies face rotation without sorting UV coordinates', () => {
    const element: ResolvedElement = {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: { up: { ...face, rotation: 90 } },
    };
    expect([...faceGeometry(element, 'up', element.faces['up']).getAttribute('uv').array]).toEqual([
      0, 0, 0, 0.1875, 1, 0.1875, 1, 0,
    ]);
  });

  it('uses deterministic direction shading factors', () => {
    expect(shadeDirectionFactor('up')).toBe(1);
    expect(shadeDirectionFactor('down')).toBeLessThan(shadeDirectionFactor('north'));
    expect(shadeDirectionFactor('unknown')).toBe(1);
  });
});

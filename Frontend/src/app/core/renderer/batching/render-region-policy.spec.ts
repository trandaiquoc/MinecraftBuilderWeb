import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RenderRegionPolicy } from './render-region-policy';

describe('RenderRegionPolicy', () => {
  const policy = new RenderRegionPolicy(32);

  it('keeps deterministic region keys at positive and negative boundaries', () => {
    expect(policy.key({ x: 0, y: 0, z: 0 })).toBe('0,0,0');
    expect(policy.key({ x: 31, y: 31, z: 31 })).toBe('0,0,0');
    expect(policy.key({ x: 32, y: 0, z: 0 })).toBe('1,0,0');
    expect(policy.key({ x: -1, y: -32, z: -33 })).toBe('-1,-1,-2');
  });

  it('produces conservative bounds for the complete region envelope', () => {
    const bounds = policy.bounds(
      '2,-1,3',
      new THREE.Box3(new THREE.Vector3(-0.25, 0, 0), new THREE.Vector3(1, 1, 1)),
    );
    expect(bounds.min.toArray()).toEqual([63.75, -32, 96]);
    expect(bounds.max.toArray()).toEqual([96, 0, 128]);
  });
});

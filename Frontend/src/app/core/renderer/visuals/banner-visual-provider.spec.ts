import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BannerVisualProvider } from './banner-visual-provider';

const provider = new BannerVisualProvider();
const banner = (id: string, facing = 'north') => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0], position: { x: 0, y: 0, z: 0 }, state: { facing } });

describe('BannerVisualProvider', () => {
  it('matches only vanilla banner resources and builds a standing banner', () => {
    expect(provider.matches(banner('minecraft:red_banner'))).toBe(true);
    expect(provider.matches(banner('example:red_banner'))).toBe(false);
    expect(provider.create(banner('minecraft:red_banner')).children).toHaveLength(2);
  });

  it('anchors wall banners to the support plane for every facing', () => {
    for (const [facing, axis] of [['north', 'z'], ['south', 'z'], ['east', 'x'], ['west', 'x']] as const) {
      const visual = provider.create(banner('minecraft:red_wall_banner', facing));
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const edge = axis === 'z' ? (facing === 'north' ? bounds.max.z : bounds.min.z) : (facing === 'west' ? bounds.max.x : bounds.min.x);
      expect(edge, facing).toBeCloseTo(facing === 'north' || facing === 'west' ? 1 : 0, 5);
      expect(visual.userData['wallFacing']).toBe(facing);
    }
  });
});

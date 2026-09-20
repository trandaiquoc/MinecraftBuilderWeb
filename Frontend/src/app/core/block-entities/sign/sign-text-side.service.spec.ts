import { describe, expect, it } from 'vitest';
import { SignTextSideService } from './sign-text-side.service';

const wallSign = { kind: 'resolved' as const, id: 'minecraft:oak_wall_sign', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { facing: 'north' } };

describe('SignTextSideService', () => {
  it('maps a clicked physical sign face to its front or back text without changing canonical data', () => {
    const sides = new SignTextSideService();
    sides.setFromHit(wallSign, { x: 0, y: 0, z: -1 });
    expect(sides.side()).toBe('front');
    sides.setFromHit(wallSign, { x: 0, y: 0, z: 1 });
    expect(sides.side()).toBe('back');
    expect(wallSign.state).toEqual({ facing: 'north' });
  });
});

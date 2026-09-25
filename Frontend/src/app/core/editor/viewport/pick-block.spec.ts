import { describe, expect, it, vi } from 'vitest';
import { blockHitWinsOverDecoration, pickAndSelectBlockFromViewportHit } from './pick-block';

describe('viewport Pick + logical Selection interaction boundary', () => {
  it('forwards a normal mesh hit to pick and selection callbacks', () => {
    const pick = vi.fn();
    const select = vi.fn();
    const hit = { block: { x: 2, y: 3, z: 4 } };
    expect(pickAndSelectBlockFromViewportHit(hit, pick, select)).toBe(true);
    expect(pick).toHaveBeenCalledWith({ x: 2, y: 3, z: 4 });
    expect(select).toHaveBeenCalledWith(hit);
  });

  it('forwards placeholder/instanced voxel hits identically and ignores empty space', () => {
    const pick = vi.fn();
    const select = vi.fn();
    expect(pickAndSelectBlockFromViewportHit({ block: { x: 5, y: 0, z: 1 } }, pick, select)).toBe(true);
    expect(pickAndSelectBlockFromViewportHit({}, pick, select)).toBe(false);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('keeps a decoration that wins the distance comparison out of block Pick + Selection', () => {
    const hit = { block: { x: 1, y: 2, z: 3 }, decoration: {}, blockDistance: 2, decorationDistance: 1 };
    expect(blockHitWinsOverDecoration(hit)).toBe(false);
    const pick = vi.fn();
    const select = vi.fn();
    if (blockHitWinsOverDecoration(hit)) pickAndSelectBlockFromViewportHit(hit, pick, select);
    expect(pick).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('lets the block win when it is the nearer final or placeholder hit', () => {
    expect(blockHitWinsOverDecoration({ block: { x: 1, y: 2, z: 3 }, decoration: {}, blockDistance: 1, decorationDistance: 2 })).toBe(true);
    expect(blockHitWinsOverDecoration({ block: { x: 1, y: 2, z: 3 } })).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { pickBlockFromViewportHit } from './pick-block';

describe('viewport pick-block interaction boundary', () => {
  it('forwards a normal mesh hit to StructureEditorService.pick without changing selection', () => {
    const pick = vi.fn();
    expect(pickBlockFromViewportHit({ block: { x: 2, y: 3, z: 4 } }, pick)).toBe(true);
    expect(pick).toHaveBeenCalledWith({ x: 2, y: 3, z: 4 });
  });

  it('forwards placeholder/instanced voxel hits identically and ignores empty space', () => {
    const pick = vi.fn();
    expect(pickBlockFromViewportHit({ block: { x: 5, y: 0, z: 1 } }, pick)).toBe(true);
    expect(pickBlockFromViewportHit({}, pick)).toBe(false);
    expect(pick).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { blockRenderSignature, canonicalRenderOptions, isolateKey, renderFilterKey } from './viewport-render-signatures';

describe('viewport render signatures', () => {
  it('includes block state, position, and block entity data', () => {
    const block = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: { axis: 'x' }, blockEntityData: { z: 1, a: 2 } };
    expect(blockRenderSignature(block)).toContain('axis=x');
    expect(blockRenderSignature(block)).toContain('{"a":2,"z":1}');
  });

  it('canonicalizes the render filter and separates isolate-only state', () => {
    const options = { layerY: 3, visibility: 'whole-structure' as const, isolatedGroupId: 'roof', isolatedGroupPositions: [{ x: 1, y: 2, z: 3 }] };
    expect(renderFilterKey(options)).toBe(renderFilterKey({ ...options, layerY: 8 }));
    expect(isolateKey(options)).not.toBe(isolateKey({ ...options, isolatedGroupId: 'entry' }));
    expect(canonicalRenderOptions(options)).not.toHaveProperty('isolatedGroupId');
    const canonical = { layerY: 3 };
    expect(canonicalRenderOptions(canonical)).toBe(canonical);
  });
});

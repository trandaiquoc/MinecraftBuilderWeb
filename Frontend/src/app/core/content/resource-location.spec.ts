import { describe, expect, it } from 'vitest';
import { parseResourceLocation, resourcePath, resolveResourceLocation } from './resource-location';

describe('resource locations', () => {
  it('normalizes namespaced and bare locations to the default namespace', () => {
    expect(resolveResourceLocation('example:block/widget')).toBe('example:block/widget');
    expect(resolveResourceLocation('block/cube_all')).toBe('minecraft:block/cube_all');
    expect(resourcePath('block/cube_all', 'models')).toBe('assets/minecraft/models/block/cube_all.json');
  });
  it('keeps texture variables distinct from resource IDs and rejects unsafe paths', () => {
    expect(parseResourceLocation('#all')).toMatchObject({ kind: 'variable', path: 'all' });
    expect(resolveResourceLocation('#all')).toBeUndefined();
    expect(resolveResourceLocation('../block/stone')).toBeUndefined();
    expect(resolveResourceLocation('example:bad path')).toBeUndefined();
  });
});

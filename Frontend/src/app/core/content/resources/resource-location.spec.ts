import { describe, expect, it } from 'vitest';
import {
  isValidNamespacedResourceLocation,
  parseResourceLocation,
  resourcePath,
  resolveResourceLocation,
  textureResourcePath,
} from './resource-location';

describe('resource locations', () => {
  it('normalizes namespaced and bare locations to the default namespace', () => {
    expect(resolveResourceLocation('example:block/widget')).toBe('example:block/widget');
    expect(resolveResourceLocation('block/cube_all')).toBe('minecraft:block/cube_all');
    expect(resourcePath('block/cube_all', 'models')).toBe(
      'assets/minecraft/models/block/cube_all.json',
    );
  });
  it('keeps texture variables distinct from resource IDs and rejects unsafe paths', () => {
    expect(parseResourceLocation('#all')).toMatchObject({ kind: 'variable', path: 'all' });
    expect(resolveResourceLocation('#all')).toBeUndefined();
    expect(resolveResourceLocation('../block/stone')).toBeUndefined();
    expect(resolveResourceLocation('example:bad path')).toBeUndefined();
  });
  it('validates namespaced IDs with Minecraft namespace/path character rules', () => {
    expect(isValidNamespacedResourceLocation('minecraft:oak_stairs')).toBe(true);
    expect(isValidNamespacedResourceLocation('example:blocks/stone')).toBe(true);
    expect(isValidNamespacedResourceLocation('Example:stone')).toBe(false);
    expect(isValidNamespacedResourceLocation('example:bad path')).toBe(false);
    expect(isValidNamespacedResourceLocation('example:')).toBe(false);
  });
  it('resolves generic texture resources independently of the Vanilla provider', () => {
    expect(textureResourcePath('minecraft:block/stone')).toBe(
      'assets/minecraft/textures/block/stone.png',
    );
    expect(textureResourcePath('example:textures/entity/sign.png')).toBe(
      'assets/example/textures/entity/sign.png',
    );
    expect(textureResourcePath('assets/example/textures/entity/sign.png')).toBe(
      'assets/example/textures/entity/sign.png',
    );
    expect(textureResourcePath('example:bad path')).toBe('example:bad path');
  });
});

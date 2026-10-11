import { describe, expect, it } from 'vitest';
import { isSignId } from './sign-id';

describe('vanilla sign identity', () => {
  it('recognizes the four canonical sign variants only in the Minecraft namespace', () => {
    expect(isSignId('minecraft:oak_sign')).toBe(true);
    expect(isSignId('minecraft:oak_wall_sign')).toBe(true);
    expect(isSignId('minecraft:oak_hanging_sign')).toBe(true);
    expect(isSignId('minecraft:oak_wall_hanging_sign')).toBe(true);
    expect(isSignId('example:oak_sign')).toBe(false);
    expect(isSignId('minecraft:oak_sign_block')).toBe(false);
  });
});

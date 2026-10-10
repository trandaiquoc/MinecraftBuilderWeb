import { describe, expect, it } from 'vitest';
import { fluidMaterialCacheKey, fluidMaterialIdentityKey } from './fluid-material-key';

const base = {
  materialKey: 'water',
  renderLayer: 'translucent',
  texture: 'water_still',
  depthWrite: false,
  doubleSided: true,
} as const;

describe('fluid material identity', () => {
  it('includes every material-affecting descriptor field', () => {
    const key = fluidMaterialCacheKey('provider', base);
    expect(key).not.toBe(fluidMaterialCacheKey('provider', { ...base, tint: 0x123456 }));
    expect(key).not.toBe(fluidMaterialCacheKey('provider', { ...base, opacity: 0.5 }));
    expect(key).not.toBe(fluidMaterialCacheKey('provider', { ...base, depthWrite: true }));
    expect(key).not.toBe(fluidMaterialCacheKey('provider', { ...base, doubleSided: false }));
  });

  it('shares identical complete descriptors and separates providers', () => {
    expect(fluidMaterialIdentityKey(base)).toBe(fluidMaterialIdentityKey({ ...base }));
    expect(fluidMaterialCacheKey('provider-a', base)).not.toBe(
      fluidMaterialCacheKey('provider-b', base),
    );
  });
});

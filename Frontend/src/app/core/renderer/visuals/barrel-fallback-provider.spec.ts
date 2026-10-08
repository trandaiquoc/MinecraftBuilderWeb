import { describe, expect, it } from 'vitest';
import { BarrelFallbackVisualProvider } from './barrel-fallback-provider';

const provider = new BarrelFallbackVisualProvider();
const barrel = (id: string) => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0], position: { x: 0, y: 0, z: 0 }, state: {} });

describe('BarrelFallbackVisualProvider', () => {
  it('keeps the diagnostic fallback limited to vanilla barrel blocks', () => {
    expect(provider.matches(barrel('minecraft:barrel'))).toBe(true);
    expect(provider.matches(barrel('minecraft:oak_barrel'))).toBe(true);
    expect(provider.matches(barrel('mod:barrel'))).toBe(false);
    const visual = provider.create();
    expect(visual.userData).toMatchObject({ visualFallback: 'diagnostic', fallbackReason: 'BARREL_GENERIC_RESOURCE_UNAVAILABLE' });
    expect(visual.children).toHaveLength(2);
  });
});

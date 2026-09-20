import { describe, expect, it } from 'vitest';
import { viewportThemePalette } from './viewport-theme';

describe('viewport theme palette', () => {
  it('provides readable light and dark palettes', () => {
    const dark = viewportThemePalette('dark');
    const light = viewportThemePalette('light');
    expect(dark.background).not.toBe(light.background);
    expect(light.background).toBeGreaterThan(0xe00000);
    expect(light.grid).not.toBe(light.background);
    expect(light.bounds).not.toBe(light.grid);
  });

  it('keeps interaction states distinct in both themes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = viewportThemePalette(mode);
      expect(new Set([palette.selection, palette.group, palette.lockedGroup, palette.valid, palette.invalid]).size).toBe(5);
    }
  });
});

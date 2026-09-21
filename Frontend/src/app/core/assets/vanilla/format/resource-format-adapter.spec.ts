import { describe, expect, it } from 'vitest';
import { selectVanillaResourceFormatAdapter } from './resource-format-adapter';

describe('vanilla resource format adapters', () => {
  it('selects modern JSON by resource evidence', () => {
    const adapter = selectVanillaResourceFormatAdapter({ 'assets/minecraft/blockstates/stone.json': {}, 'assets/minecraft/models/block/stone.json': {} }, new Map());
    expect(adapter.id).toBe('modern-json');
    expect(adapter.canNormalizeModels).toBe(true);
    expect(adapter.blockstatePaths({ 'assets/minecraft/blockstates/stone.json': {} })).toEqual(['assets/minecraft/blockstates/stone.json']);
  });
  it('keeps a legacy resource pack usable without inventing modern models', () => {
    const adapter = selectVanillaResourceFormatAdapter({ 'assets/minecraft/lang/en_us.json': {} }, new Map([['assets/minecraft/textures/stone.png', new Uint8Array([1])]]));
    expect(adapter.id).toBe('legacy');
    expect(adapter.canNormalizeModels).toBe(false);
    expect(adapter.languagePath({ 'assets/minecraft/lang/en_us.json': {} })).toBe('assets/minecraft/lang/en_us.json');
  });
});

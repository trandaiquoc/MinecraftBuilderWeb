import { describe, expect, it } from 'vitest';
import { detectVanillaResourceFormat } from './vanilla-resource-format';

describe('vanilla resource format detection', () => {
  it('recognizes modern JSON resources without claiming verified behavior', () => {
    const profile = detectVanillaResourceFormat({ 'assets/minecraft/blockstates/stone.json': {}, 'assets/minecraft/models/block/stone.json': {}, 'assets/minecraft/lang/en_us.json': {} }, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1])]]));
    expect(profile.support).toBe('resource-compatible');
    expect(profile.id).toBe('modern-json');
  });

  it('keeps legacy resources usable but explicitly limited', () => {
    const profile = detectVanillaResourceFormat({ 'assets/minecraft/lang/en_us.json': {} }, new Map([['assets/minecraft/textures/stone.png', new Uint8Array([1])]]));
    expect(profile.support).toBe('legacy-limited');
  });

  it('reports empty archives as unsupported rather than a network failure', () => {
    expect(detectVanillaResourceFormat({}, new Map()).support).toBe('unsupported-resource-format');
  });
});

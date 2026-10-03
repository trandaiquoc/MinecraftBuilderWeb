import { describe, expect, it } from 'vitest';
import { isCompiledTerrainEntry } from './terrain-classifier';

const block = (namespace = 'minecraft') => ({ kind: 'resolved' as const, id: `${namespace}:stone`, namespace, position: { x: 0, y: 0, z: 0 }, state: {} });

describe('compiled terrain eligibility', () => {
  it('requires the existing positive normal opaque-full-cube proof', () => {
    expect(isCompiledTerrainEntry({ block: block(), role: 'normal', occlusionClass: 'opaque-full-cube' })).toBe(true);
    expect(isCompiledTerrainEntry({ block: block(), role: 'reference', occlusionClass: 'opaque-full-cube' })).toBe(false);
    expect(isCompiledTerrainEntry({ block: block(), role: 'normal', occlusionClass: 'unknown' })).toBe(false);
    expect(isCompiledTerrainEntry({ block: { ...block(), kind: 'missing' }, role: 'missing', occlusionClass: 'non-occluding' })).toBe(false);
  });

  it('does not turn unresolved mod content into terrain evidence', () => {
    expect(isCompiledTerrainEntry({ block: block('example'), role: 'normal', occlusionClass: 'unknown' })).toBe(false);
  });
});

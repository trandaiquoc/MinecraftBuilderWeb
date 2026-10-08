import { describe, expect, it } from 'vitest';
import { assessFabricCompatibility, detectLoader, normalizeFabricMetadata, parseFabricModMetadata } from './mod-loader';

describe('mod loader adapters', () => {
  it('detects supported and unsupported loader metadata without executing it', () => {
    expect(detectLoader(['fabric.mod.json'])).toBe('fabric');
    expect(detectLoader(['quilt.mod.json'])).toBe('quilt');
    expect(detectLoader(['META-INF/mods.toml'])).toBe('forge');
    expect(detectLoader(['META-INF/neoforge.mods.toml'])).toBe('neoforge');
    expect(detectLoader(['assets/example/blockstates/marble.json'])).toBe('unknown');
  });

  it('normalizes Fabric metadata and keeps dependency predicates generic', () => {
    const normalized = normalizeFabricMetadata({
      schemaVersion: 1,
      id: 'example',
      name: 'Example Mod',
      version: '1.2.3',
      description: 'Static resources',
      depends: { minecraft: ['1.20.x', '1.21.x'], fabricloader: '>=0.15' },
      recommends: { 'example-library': '>=1.0' },
      environment: '*',
      icon: 'assets/example/icon.png',
      jars: [{ file: 'nested.jar' }],
    });
    expect(normalized).toMatchObject({
      loader: 'fabric', modId: 'example', displayName: 'Example Mod', modVersion: '1.2.3',
      minecraftRequirement: ['1.20.x', '1.21.x'], environment: '*', icon: 'assets/example/icon.png',
    });
    expect(normalized.runtimeDependencies['fabricloader']).toBe('>=0.15');
    expect(normalized.optionalDependencies['example-library']).toBe('>=1.0');
    expect(normalized.nestedJars).toHaveLength(1);
  });

  it('parses Fabric metadata for legacy provider consumers and validates compatibility', () => {
    expect(parseFabricModMetadata({ id: 'example', name: 'Example', version: '1.0' })).toMatchObject({
      id: 'example', displayName: 'Example', version: '1.0',
    });
    expect(() => parseFabricModMetadata({ version: '1.0.0' })).toThrow(/mod id/);
    expect(() => parseFabricModMetadata({ id: 'bad id', version: '1.0.0' })).toThrow(/invalid mod id/);
    expect(() => parseFabricModMetadata({ id: 'valid', version: '' })).toThrow(/version/);
    expect(assessFabricCompatibility('1.21.x', '1.21.1')).toBe('compatible');
    expect(assessFabricCompatibility('1.20.6', '1.21.1')).toBe('incompatible');
    expect(assessFabricCompatibility('[1.20,1.22)', '1.21.1')).toBe('compatible');
  });
});

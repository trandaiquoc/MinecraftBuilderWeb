import { describe, expect, it } from 'vitest';
import { inspectJvmClass, StaticJvmSemanticEvidenceProvider } from './jvm-semantic-evidence';

describe('static JVM semantic evidence boundary', () => {
  it('fails closed for malformed bytes without executing anything', () => {
    const result = inspectJvmClass(new Uint8Array([0, 1, 2]), 'bad.class');
    expect(result.structure).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('unsupported-resource-format');
  });
  it('accepts a structurally valid minimal class header and emits no unproven semantics', () => {
    const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 55, 0, 1, 0, 33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = inspectJvmClass(bytes);
    expect(result.structure).toMatchObject({ majorVersion: 55, constantPoolCount: 1 });
    const provider = new StaticJvmSemanticEvidenceProvider({ minecraftVersion: '1.21.1', classFileMajor: 55 }, new Map([['x.class', bytes]]));
    expect(provider.supplementsFor('example:display')).toEqual([]);
  });
});

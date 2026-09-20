import { describe, expect, it } from 'vitest';
import { largeProjectPackageFixture } from './project-package-import-fixture';
import { parseProjectPackage } from './project-package';

describe('opt-in project package import benchmark', () => {
  it('parses a deterministic repeated-block package when explicitly requested', () => {
    const enabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['IMPORT_BENCHMARK'] === '1';
    if (!enabled) return;
    const serialized = largeProjectPackageFixture(); const started = Date.now(); const project = parseProjectPackage(serialized);
    expect(project.blocks).toHaveLength(4096);
    console.info(`[project import benchmark] bytes=${serialized.length} blocks=${project.blocks.length} parseValidateMs=${Date.now() - started}`);
  });
});

import { describe, expect, it } from 'vitest';
import { validateParsedStructureJsonPreviewAsync } from './structure-json-import';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';

const enabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['CLEAN_CODE_STEP1_BENCHMARK'] === '1';
const stone: BlockDefinition = {
  id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [],
  resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real',
  visualClassification: 'standard-json', defaultStateSource: 'authoritative-report',
};

describe.skipIf(!enabled)('Clean Code Step 1 before/after benchmark', () => {
  it('records cooperative Structure JSON validation cost at 110K blocks', async () => {
    const blocks = Array.from({ length: 110_000 }, (_, index) => ({ id: stone.id, x: index % 1000, y: Math.floor(index / 1000), z: 0 }));
    const document = { format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks, decorations: [] } as const;
    const durations: number[] = [];
    let result: Awaited<ReturnType<typeof validateParsedStructureJsonPreviewAsync>>;
    for (let sample = 0; sample < 5; sample += 1) {
      const start = performance.now();
      result = await validateParsedStructureJsonPreviewAsync(document, { x: 1000, y: 110, z: 1 }, () => stone);
      durations.push(performance.now() - start);
    }
    const elapsedMs = median(durations);
    const output = `[step1-benchmark] Structure JSON: ${blocks.length} blocks, ${result?.validBlocks ?? 'cancelled'} valid, median/5 ${elapsedMs.toFixed(2)} ms\n`;
    (globalThis as { process?: { stdout?: { write(value: string): void } } }).process?.stdout?.write(output);
    expect(result?.validBlocks).toBe(110_000);
    expect(result?.duplicateCoordinates).toBe(0);
  }, 60_000);
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

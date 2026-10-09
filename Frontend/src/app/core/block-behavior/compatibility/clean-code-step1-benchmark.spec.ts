import { describe, expect, it } from 'vitest';
import vanillaRegistry from '../../../../../public/assets/vanilla-block-registry-1.21.1.json';
import { evaluateCommonBehavior } from './common-behavior';
import { extractBehaviorFingerprint } from './behavior-fingerprint';
import { matchVanillaBehaviorCandidates } from './behavior-classifier';
import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';

const enabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['CLEAN_CODE_STEP1_BENCHMARK'] === '1';

describe.skipIf(!enabled)('Clean Code Step 1 before/after benchmark', () => {
  it('records vanilla catalog behavior classification cost', () => {
    const records = vanillaRegistry.blocks as unknown as readonly (AssetBlockRecord & { readonly properties?: AssetBlockRecord['stateDefinitions'] })[];
    const durations: number[] = [];
    let classified = 0;
    const fallbackIds = new Set<string>();
    const normalizedRecords = records.map((source): AssetBlockRecord => ({
      ...source,
      stateDefinitions: source.stateDefinitions ?? source.properties ?? [],
      resources: source.resources ?? { textures: [] },
    }));
    for (const record of normalizedRecords) {
      const result = evaluateCommonBehavior(record);
      if (!matchVanillaBehaviorCandidates(extractBehaviorFingerprint(record)).behavior && result.behavior) fallbackIds.add(record.id);
    }
    for (let sample = 0; sample < 5; sample += 1) {
      const start = performance.now();
      classified = 0;
      for (const record of normalizedRecords) {
        const result = evaluateCommonBehavior(record);
        if (result.behavior) classified += 1;
      }
      durations.push(performance.now() - start);
    }
    const elapsedMs = median(durations);
    const output = `[step1-benchmark] vanilla classifier: ${records.length} registry blocks, ${classified} behaviors, trusted fallback-only ${fallbackIds.size} (${[...fallbackIds].slice(0, 12).join(', ')}), median/5 ${elapsedMs.toFixed(2)} ms\n`;
    (globalThis as { process?: { stdout?: { write(value: string): void } } }).process?.stdout?.write(output);
    expect(records.length).toBeGreaterThan(1000);
  });
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

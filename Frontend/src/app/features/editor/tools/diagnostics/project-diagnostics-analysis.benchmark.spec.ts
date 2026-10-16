import { describe, expect, it } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../../../core/domain/project.types';
import {
  collectProjectIssues,
  filterProjectIssues,
  localizeProjectIssues,
} from './project-diagnostics-analysis';

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'CLEAN_CODE_STEP1_BENCHMARK'
  ] === '1';

const text = {
  missingContent: 'Missing content',
  missingText: 'Block content is missing.',
  unresolvedText: 'Block content cannot be resolved.',
  partialVisualTitle: 'Partial visual support',
  partialVisualText: 'Partial visual support is available.',
  fallbackVisualTitle: 'Fallback visual support',
  fallbackVisualText: 'Fallback visual support is in use.',
  partialBehaviorTitle: 'Partial editor behavior',
  partialBehaviorText: 'Some editor behavior is not modeled.',
  unknownBehaviorTitle: 'Unverified editor behavior',
  unknownBehaviorText: 'The editor has no verified behavior profile.',
  assetProblem: 'Asset problem',
  assetUnavailableText: 'Vanilla assets are unavailable.',
} as const;

describe.skipIf(!enabled)('Project diagnostics analysis benchmark', () => {
  it('compares repeated query scans with collect-once filtering at 110K blocks', () => {
    const blocks: PlacedBlock[] = Array.from({ length: 110_000 }, (_, index) => ({
      kind: 'missing',
      id: index % 2 === 0 ? 'example:missing_stone' : 'example:missing_dirt',
      namespace: 'example',
      position: { x: index % 1000, y: Math.floor(index / 1000), z: 0 },
      state: {},
    }));
    const project: ProjectDocument = {
      schemaVersion: 3,
      id: 'diagnostics-benchmark',
      metadata: {
        name: 'Diagnostics benchmark',
        minecraftVersion: '1.21.1',
        createdAt: '',
        updatedAt: '',
      },
      size: { x: 1000, y: 110, z: 1 },
      structureMode: 'vanilla-structure-block',
      blocks,
      groups: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    const queries = ['missing_stone', 'missing_dirt', 'no-match'] as const;
    const samples = 5;
    const beforeDurations: number[] = [];
    const afterDurations: number[] = [];
    let beforeCounts: number[] = [];
    let afterCounts: number[] = [];

    for (let sample = 0; sample < samples; sample += 1) {
      let start = performance.now();
      beforeCounts = queries.map((query) =>
        filterProjectIssues(
          localizeProjectIssues(
            collectProjectIssues(project, () => undefined, true),
            text,
          ),
          query,
        ).reduce((total, issue) => total + issue.affectedBlocks, 0),
      );
      beforeDurations.push(performance.now() - start);

      start = performance.now();
      const collected = localizeProjectIssues(
        collectProjectIssues(project, () => undefined, true),
        text,
      );
      afterCounts = queries.map((query) =>
        filterProjectIssues(collected, query).reduce(
          (total, issue) => total + issue.affectedBlocks,
          0,
        ),
      );
      afterDurations.push(performance.now() - start);
    }

    const beforeMs = median(beforeDurations);
    const afterMs = median(afterDurations);
    const output = `[step1-benchmark] diagnostics: ${blocks.length} blocks, ${queries.length} queries, median/5 repeated-collection=${beforeMs.toFixed(2)} ms collect-once=${afterMs.toFixed(2)} ms speedup=${(beforeMs / Math.max(afterMs, 0.001)).toFixed(2)}x\n`;
    (
      globalThis as { process?: { stdout?: { write(value: string): void } } }
    ).process?.stdout?.write(output);
    expect(afterCounts).toEqual(beforeCounts);
    expect(afterCounts).toEqual([55_000, 55_000, 0]);
  }, 120_000);
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

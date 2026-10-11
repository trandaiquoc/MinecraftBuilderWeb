import { describe, expect, it } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { ProjectBlockRuntimeIndex } from '../runtime/project-block-runtime-index';
import type { VoxelBox } from './selection';

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'CLEAN_CODE_STEP1_BENCHMARK'
  ] === '1';

describe.skipIf(!enabled)('Selection box count benchmark', () => {
  it('compares array filtering with indexed layer counting at 110K blocks', () => {
    const blocks: PlacedBlock[] = Array.from({ length: 110_000 }, (_, index) => ({
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: index % 1000, y: Math.floor(index / 1000), z: 0 },
      state: {},
    }));
    const project: ProjectDocument = {
      schemaVersion: 3,
      id: 'selection-count-benchmark',
      metadata: {
        name: 'Selection count benchmark',
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
    const box: VoxelBox = {
      min: { x: 0, y: 40, z: 0 },
      max: { x: 999, y: 49, z: 0 },
    };
    const index = new ProjectBlockRuntimeIndex();
    index.ensure(project);
    const rebuilds = index.rebuildCount;
    const samples = 5;
    const countsPerSample = 20;
    const beforeQueryDurations: number[] = [];
    const afterQueryDurations: number[] = [];
    const beforeDurations: number[] = [];
    const afterDurations: number[] = [];
    let beforeQueryCount = 0;
    let afterQueryCount = 0;
    let beforeCount = 0;
    let afterCount = 0;

    for (let sample = 0; sample < samples; sample += 1) {
      let start = performance.now();
      for (let query = 0; query < countsPerSample; query += 1)
        beforeQueryCount = project.blocks.filter(
          (block) =>
            block.position.x >= box.min.x &&
            block.position.x <= box.max.x &&
            block.position.y >= box.min.y &&
            block.position.y <= box.max.y &&
            block.position.z >= box.min.z &&
            block.position.z <= box.max.z,
        ).length;
      beforeQueryDurations.push(performance.now() - start);

      start = performance.now();
      for (let query = 0; query < countsPerSample; query += 1)
        afterQueryCount = index.blocksInBox(box).length;
      afterQueryDurations.push(performance.now() - start);

      start = performance.now();
      for (let count = 0; count < countsPerSample; count += 1)
        beforeCount = project.blocks.filter(
          (block) =>
            block.position.x >= box.min.x &&
            block.position.x <= box.max.x &&
            block.position.y >= box.min.y &&
            block.position.y <= box.max.y &&
            block.position.z >= box.min.z &&
            block.position.z <= box.max.z,
        ).length;
      beforeDurations.push(performance.now() - start);

      start = performance.now();
      for (let count = 0; count < countsPerSample; count += 1)
        afterCount = index.countBlocksInBox(box);
      afterDurations.push(performance.now() - start);
    }

    const beforeMs = median(beforeDurations);
    const afterMs = median(afterDurations);
    const beforeQueryMs = median(beforeQueryDurations);
    const afterQueryMs = median(afterQueryDurations);
    const output = `[step1-benchmark] selection box: ${blocks.length} blocks, ${countsPerSample} queries, median/5 seed-query array-filter=${beforeQueryMs.toFixed(2)} ms indexed-layers=${afterQueryMs.toFixed(2)} ms speedup=${(beforeQueryMs / Math.max(afterQueryMs, 0.001)).toFixed(2)}x; count array-filter=${beforeMs.toFixed(2)} ms indexed-layers=${afterMs.toFixed(2)} ms speedup=${(beforeMs / Math.max(afterMs, 0.001)).toFixed(2)}x rebuilds=${index.rebuildCount}\n`;
    (
      globalThis as { process?: { stdout?: { write(value: string): void } } }
    ).process?.stdout?.write(output);
    expect(afterQueryCount).toBe(10_000);
    expect(beforeQueryCount).toBe(afterQueryCount);
    expect(beforeCount).toBe(10_000);
    expect(afterCount).toBe(beforeCount);
    expect(index.rebuildCount).toBe(rebuilds);
  }, 120_000);
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

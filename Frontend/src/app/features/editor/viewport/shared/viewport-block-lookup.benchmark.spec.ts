import { describe, expect, it } from 'vitest';
import { coordinateKey } from '../../../../core/domain/coordinates';
import type { PlacedBlock, ProjectDocument } from '../../../../core/domain/project.types';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'CLEAN_CODE_STEP1_BENCHMARK'
  ] === '1';

describe.skipIf(!enabled)('Viewport block lookup benchmark', () => {
  it('compares the former linear sign lookup with the current indexed lookup at 110K blocks', () => {
    const blocks: PlacedBlock[] = Array.from({ length: 110_000 }, (_, index) => ({
      kind: 'resolved',
      id: 'minecraft:oak_sign',
      namespace: 'minecraft',
      position: { x: index, y: 0, z: 0 },
      state: {},
    }));
    const document: ProjectDocument = {
      schemaVersion: 3,
      id: 'lookup-benchmark',
      metadata: {
        name: 'Lookup benchmark',
        minecraftVersion: '1.21.1',
        createdAt: '',
        updatedAt: '',
      },
      size: { x: blocks.length, y: 1, z: 1 },
      structureMode: 'vanilla-structure-block',
      blocks,
      groups: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    const target = blocks.at(-1)!;
    const targetKey = coordinateKey(target.position);
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    runtimeIndex.ensure(document);
    const indexRebuilds = runtimeIndex.rebuildCount;
    const samples = 5;
    const lookupsPerSample = 20;
    const linearDurations: number[] = [];
    const indexedDurations: number[] = [];
    let linearResult: PlacedBlock | undefined;
    let indexedResult: PlacedBlock | undefined;

    for (let sample = 0; sample < samples; sample += 1) {
      let start = performance.now();
      for (let lookup = 0; lookup < lookupsPerSample; lookup += 1)
        linearResult = document.blocks.find((block) => coordinateKey(block.position) === targetKey);
      linearDurations.push(performance.now() - start);

      start = performance.now();
      for (let lookup = 0; lookup < lookupsPerSample; lookup += 1) {
        runtimeIndex.ensure(document);
        indexedResult = runtimeIndex.get(target.position);
      }
      indexedDurations.push(performance.now() - start);
    }

    const beforeMs = median(linearDurations);
    const afterMs = median(indexedDurations);
    const output = `[step1-benchmark] viewport sign lookup: ${blocks.length} blocks, ${lookupsPerSample} last-block lookups, median/5 linear=${beforeMs.toFixed(2)} ms indexed+ensure=${afterMs.toFixed(3)} ms speedup=${(beforeMs / Math.max(afterMs, 0.001)).toFixed(1)}x rebuilds=${runtimeIndex.rebuildCount}\n`;
    (
      globalThis as { process?: { stdout?: { write(value: string): void } } }
    ).process?.stdout?.write(output);
    expect(linearResult).toBe(target);
    expect(indexedResult).toBe(target);
    expect(runtimeIndex.rebuildCount).toBe(indexRebuilds);
  }, 60_000);
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

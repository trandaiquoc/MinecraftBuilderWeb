import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SelectionService } from '../../editor/selection/selection.service';
import { ProjectBlockRuntimeIndex } from '../../editor/runtime/project-block-runtime-index';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import {
  createScreenSpaceMarqueeQuery,
  screenSpaceMarqueeRect,
} from './screen-space-marquee-selection';

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'SCREEN_MARQUEE_BENCHMARK'
  ] === '1';

describe.skipIf(!enabled)('screen-space marquee benchmark', () => {
  it('measures pointer preview and exact selection commit on 110,592 blocks', () => {
    const project = rendererBenchmarkProject('mega');
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    runtimeIndex.ensure(project);
    const selection = new SelectionService(runtimeIndex);
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 300);
    camera.position.set(24, 96, 24);
    camera.up.set(0, 0, -1);
    camera.lookAt(24, 24, 24);
    camera.updateMatrixWorld(true);
    const viewport = { width: 800, height: 600 };
    const rect = { left: 275, top: 190, width: 250, height: 220 };
    const query = createScreenSpaceMarqueeQuery(camera, viewport, rect, project.size);
    expect(query).toBeDefined();
    const rebuilds = runtimeIndex.rebuildCount;

    const pointerStarted = performance.now();
    for (let move = 0; move < 5000; move += 1)
      screenSpaceMarqueeRect(
        { x: 400, y: 300 },
        { x: 275 + (move % 250), y: 190 + (move % 220) },
        { left: 0, top: 0, ...viewport },
      );
    const pointerPreviewMs = performance.now() - pointerStarted;

    selection.selectBoxLogical(query!.candidateBounds, project, () => undefined);
    const candidateBoxCount = selection.renderState(project).count;
    const baselineSamples: number[] = [];
    const screenSamples: number[] = [];
    let selectedCount = 0;
    for (let sample = 0; sample < 5; sample += 1) {
      let started = performance.now();
      selection.selectBoxLogical(query!.candidateBounds, project, () => undefined);
      selection.renderState(project);
      baselineSamples.push(performance.now() - started);

      started = performance.now();
      selection.selectMarqueeLogical(query, project, () => undefined);
      const state = selection.renderState(project);
      selectedCount = state.count;
      screenSamples.push(performance.now() - started);
      expect(state.count).toBeLessThanOrEqual(candidateBoxCount);
    }

    expect(runtimeIndex.rebuildCount).toBe(rebuilds);
    const report = `[screen-marquee benchmark] blocks=${project.blocks.length} pointerMoves=5000 preview=${pointerPreviewMs.toFixed(2)}ms candidates=${candidateBoxCount} selected=${selectedCount} candidate-box+state-median=${median(baselineSamples).toFixed(2)}ms screen-frustum+state-median=${median(screenSamples).toFixed(2)}ms indexRebuilds=${runtimeIndex.rebuildCount - rebuilds}\n`;
    (
      globalThis as { process?: { stdout?: { write(value: string): void } } }
    ).process?.stdout?.write(report);
  }, 120_000);
});

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

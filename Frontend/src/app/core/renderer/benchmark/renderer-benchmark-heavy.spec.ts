import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from '../engine/three-viewport-engine';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { benchmarkBlock, rendererBenchmarkProject } from './renderer-benchmark-fixtures';

describe('explicit renderer benchmark', () => {
  it('measures medium and large incremental updates only when explicitly requested', () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RENDERER_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    for (const size of ['medium', 'large'] as const) {
      const project = rendererBenchmarkProject(size);
      const diagnostics = new RendererDiagnostics();
      const engine = new ThreeViewportEngine(diagnostics);
      const started = Date.now();
      engine.update(project, undefined);
      const initial = diagnostics.snapshot();
      const position = { x: project.size.x - 1, y: project.size.y - 1, z: project.size.z - 1 };
      const afterAdd = { ...project, blocks: [...project.blocks, benchmarkBlock(project.blocks.length + 1, position)] };
      engine.update(afterAdd, undefined);
      const afterAddCounters = diagnostics.snapshot();
      const edited = { ...afterAdd, blocks: afterAdd.blocks.map((block, index) => index === 1 ? { ...block, state: { ...block.state, shape: 'inner_left' } } : block) };
      engine.update(edited, undefined);
      const afterStateCounters = diagnostics.snapshot();
      engine.update(edited, undefined, { selected: position });
      const afterSelectionCounters = diagnostics.snapshot();
      const firstDecoration = edited.decorations?.[0];
      const afterDecoration = firstDecoration ? { ...edited, decorations: edited.decorations?.map((decoration, index) => index === 0 ? { ...decoration, anchor: { x: decoration.anchor.x + 1, y: decoration.anchor.y, z: decoration.anchor.z } } : decoration) } : edited;
      engine.update(afterDecoration, undefined);
      const counters = diagnostics.snapshot();
      expect(counters.fullSceneRebuilds).toBe(1);
      expect(afterAddCounters.blockAdds - initial.blockAdds).toBe(1);
      expect(afterStateCounters.blockVisualCreations - afterAddCounters.blockVisualCreations).toBeLessThanOrEqual(7);
      expect(afterSelectionCounters.blockVisualCreations).toBe(afterStateCounters.blockVisualCreations);
      expect(counters.decorationUpdates - afterSelectionCounters.decorationUpdates).toBe(firstDecoration ? 1 : 0);
      console.info(`[renderer benchmark] ${size} initial=${initial.blockVisualCreations} addDelta=${afterAddCounters.blockVisualCreations - initial.blockVisualCreations} stateDelta=${afterStateCounters.blockVisualCreations - afterAddCounters.blockVisualCreations} selectionDelta=${afterSelectionCounters.blockVisualCreations - afterStateCounters.blockVisualCreations} decorationDelta=${counters.decorationVisualCreations - afterSelectionCounters.decorationVisualCreations} fullRebuilds=${counters.fullSceneRebuilds} elapsedMs=${Date.now() - started}`);
    }
  });
});

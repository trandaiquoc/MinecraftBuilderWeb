import { describe, expect, it, vi } from 'vitest';
import {
  rendererBenchmarkProject,
  rendererBenchmarkVisualProvider,
} from '../../../../core/renderer/benchmark/renderer-benchmark-fixtures';
import { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import type { ViewportPreparationAttempt } from '../../../../core/renderer/engine/viewport-engine-contracts';
import {
  ViewportPreparationScheduler,
  type ViewportPreparationScope,
} from './viewport-preparation-scheduler';

describe('Y-layer prewarm scheduler integration', () => {
  it('reevaluates accepted empty-project prewarm at its terminal event without hydration or projection transitions', async () => {
    const engine = new ThreeViewportEngine();
    const scheduler = new ViewportPreparationScheduler();
    const project = { ...rendererBenchmarkProject('small'), blocks: [], decorations: [] };
    const provider = rendererBenchmarkVisualProvider();
    const options = {
      layerY: 0,
      visibility: 'current-only' as const,
      exposedFaceRendering: true,
    };
    engine.setVisualProvider(provider);
    engine.update(project, undefined, options);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const scope: ViewportPreparationScope = {
      projectId: project.id,
      project,
      blocks: project.blocks,
      decorations: project.decorations,
      provider,
      providerGeneration: 1,
      visualRevision: 1,
    };
    const attempts = vi.fn<() => ViewportPreparationAttempt>(() =>
      engine.prepareYLayerVisualResources(project),
    );
    const notifications: string[] = [];
    const hydrationTransitions: string[] = [];
    const projectionTransitions: string[] = [];
    const unsubscribeTerminal = engine.onYLayerPrewarmTerminal((notification) => {
      notifications.push(notification.outcome);
      if (
        notification.outcome !== 'cancelled' &&
        notification.projectId === project.id &&
        notification.blocks === project.blocks &&
        notification.provider === provider
      )
        scheduler.retry('y-layer');
    });
    const unsubscribeHydration = engine.onHydrationProgress((progress) => {
      if (progress.status !== 'idle') hydrationTransitions.push(progress.status);
    });
    const unsubscribeProjection = engine.onProjectionActivity((state) => {
      if (state.activity !== 'idle') projectionTransitions.push(state.activity);
    });

    scheduler.update('y-layer', scope, true, 0, attempts);
    for (let index = 0; index < 100 && attempts.mock.calls.length < 2; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));

    expect(attempts).toHaveBeenCalledTimes(2);
    expect(notifications).toEqual(['ready']);
    expect(hydrationTransitions).toEqual([]);
    expect(projectionTransitions).toEqual([]);
    expect(engine.yLayerVisualPreloadEvidence()).toMatchObject({
      state: 'templates-ready',
      blocksTotal: 0,
      blocksVisited: 0,
    });

    scheduler.update('y-layer', scope, true, 0, attempts);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(attempts).toHaveBeenCalledTimes(2);

    unsubscribeTerminal();
    unsubscribeHydration();
    unsubscribeProjection();
    scheduler.dispose();
    engine.dispose();
  });
});

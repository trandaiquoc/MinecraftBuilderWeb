import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { HydrationWorkOwnerToken } from '../scheduling/hydration-work-coordinator';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import { YLayerRepresentationPrewarmOwner } from './y-layer-representation-prewarm-owner';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { coordinateKey } from '../../domain/coordinates';

interface PrewarmFixtureOptions {
  readonly blocks?: readonly PlacedBlock[];
  readonly exposedFaceRendering?: boolean;
  readonly hasTerrainTemplate?: boolean | (() => boolean);
  readonly reusableKey?: (block: PlacedBlock) => string | undefined;
  readonly visibleEntry?: (block: PlacedBlock) => never;
  readonly createVisual?: (
    block: PlacedBlock,
  ) => Promise<{ readonly object: THREE.Object3D } | undefined>;
  readonly resolveTerrainTemplates?: () => Promise<readonly never[] | undefined>;
}

function createFixture(options: PrewarmFixtureOptions = {}) {
  const project: ProjectDocument = {
    ...rendererBenchmarkProject('small'),
    blocks: [...(options.blocks ?? [])],
    decorations: [],
  };
  const provider = {} as BlockVisualProvider;
  const renderOptions: ViewportRenderOptions = {
    layerY: 0,
    ...(options.exposedFaceRendering ? { exposedFaceRendering: true } : {}),
  };
  const terminal = vi.fn();
  const queuedJobs: BlockHydrationJob[] = [];
  const runningJobs: BlockHydrationJob[] = [];
  const pendingSignatures = new Map<
    string,
    { signature: string; ownerToken?: HydrationWorkOwnerToken }
  >();
  const hydration = {
    regularJobs: vi.fn(() => queuedJobs),
    removePendingKeys: vi.fn((keys: ReadonlySet<string>) => {
      for (let index = queuedJobs.length - 1; index >= 0; index -= 1)
        if (keys.has(queuedJobs[index].key)) queuedJobs.splice(index, 1);
    }),
    removePendingForKey: vi.fn((key: string, matches: (job: BlockHydrationJob) => boolean) => {
      let removed = 0;
      for (let index = queuedJobs.length - 1; index >= 0; index -= 1) {
        if (queuedJobs[index].key === key && matches(queuedJobs[index])) {
          queuedJobs.splice(index, 1);
          removed += 1;
        }
      }
      return removed;
    }),
    clearPendingSignature: vi.fn((key: string) => pendingSignatures.delete(key)),
    clearPendingSignatureIfOwned: vi.fn(
      (key: string, signature: string, ownerToken: HydrationWorkOwnerToken) => {
        const pending = pendingSignatures.get(key);
        if (pending?.signature !== signature || !sameOwnerToken(pending.ownerToken, ownerToken))
          return false;
        return pendingSignatures.delete(key);
      },
    ),
    hasPendingSignature: vi.fn((key: string) => pendingSignatures.has(key)),
    setPendingSignature: vi.fn(
      (key: string, signature: string, ownerToken?: HydrationWorkOwnerToken) => {
        pendingSignatures.set(key, { signature, ownerToken });
      },
    ),
    enqueueRegular: vi.fn((job: BlockHydrationJob) => queuedJobs.push(job)),
  };
  const createVisual = vi.fn(async (block: PlacedBlock) =>
    options.createVisual ? options.createVisual(block) : { object: new THREE.Group() },
  );
  const resources = {
    blockIndex: { visualRevision: 1, get: vi.fn() },
    representations: { get: vi.fn() },
    hydration,
    projection: { revisionForKey: () => 0, visibleEntriesByKey: new Map() },
    fluids: { isClaimed: () => false, isTerminal: () => false },
    instances: {
      hasTemplate: () => false,
      cachePreparedTemplate: () => true,
      prepareReusableTemplate: () => undefined,
      disposePreparedTemplate: vi.fn(),
    },
    terrain: {
      hasTemplates: () =>
        typeof options.hasTerrainTemplate === 'function'
          ? options.hasTerrainTemplate()
          : (options.hasTerrainTemplate ?? false),
    },
    terrainWorkflow: {
      resolveTemplatesFor: vi.fn(() => options.resolveTerrainTemplates?.() ?? Promise.resolve([])),
    },
    representationHydration: { acquireProviderReference: () => vi.fn() },
  };
  const callbacks = {
    createVisual: (currentProvider: BlockVisualProvider, block: PlacedBlock) =>
      createVisual(block) as never,
    reusableKey: (_provider: BlockVisualProvider, block: PlacedBlock) =>
      options.reusableKey ? options.reusableKey(block) : block.id,
    visibleEntry: (block: PlacedBlock) =>
      options.visibleEntry
        ? options.visibleEntry(block)
        : ({ signature: 'signature', role: 'normal' } as never),
    scheduleHydration: vi.fn(),
    activatePresentation: vi.fn(),
    record: vi.fn(),
    recordProviderCacheStats: vi.fn(),
    invalidateDiagnostics: vi.fn(),
    removeRepresentation: vi.fn(),
    onTerminal: terminal,
  };
  let currentProject: ProjectDocument | undefined = project;
  let currentProviderGeneration = 1;
  let currentHydrationGeneration = 1;
  const owner = new YLayerRepresentationPrewarmOwner(
    {
      project: () => currentProject,
      options: () => renderOptions,
      provider: () => provider,
      providerGeneration: () => currentProviderGeneration,
      hydrationGeneration: () => currentHydrationGeneration,
      isDisposed: () => false,
    },
    resources as never,
    callbacks as never,
  );

  return {
    owner,
    project,
    provider,
    terminal,
    createVisual,
    callbacks,
    hydration,
    resources,
    queuedJobs,
    runningJobs,
    pendingSignatures,
    setProject: (value: ProjectDocument | undefined) => {
      currentProject = value;
    },
    setProviderGeneration: (value: number) => {
      currentProviderGeneration = value;
    },
    setHydrationGeneration: (value: number) => {
      currentHydrationGeneration = value;
    },
  };
}

async function waitForScheduledHydration(
  callbacks: ReturnType<typeof createFixture>['callbacks'],
): Promise<void> {
  for (
    let attempt = 0;
    attempt < 100 && !callbacks.scheduleHydration.mock.calls.length;
    attempt += 1
  )
    await new Promise((resolve) => setTimeout(resolve, 1));
}

async function waitForTerminal(terminal: ReturnType<typeof vi.fn>, expected = 1): Promise<void> {
  for (let attempt = 0; attempt < 100 && terminal.mock.calls.length < expected; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 1));
}

function placedBlock(y = 0): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'example:block',
    namespace: 'example',
    position: { x: 0, y, z: 0 },
    state: {},
  };
}

function sameOwnerToken(
  left: HydrationWorkOwnerToken | undefined,
  right: HydrationWorkOwnerToken,
): boolean {
  return (
    left?.owner === right.owner &&
    left.attempt === right.attempt &&
    left.generation === right.generation
  );
}

describe('YLayerRepresentationPrewarmOwner terminal lifecycle', () => {
  it('notifies terminal readiness for an empty project without hydration or projection work', async () => {
    const fixture = createFixture();

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: fixture.project.id,
        blocks: fixture.project.blocks,
        provider: fixture.provider,
        phase: 'representations',
        outcome: 'ready',
      }),
    );
    expect(fixture.createVisual).not.toHaveBeenCalled();
    expect(fixture.callbacks.scheduleHydration).toHaveBeenCalledWith(false);
    expect(fixture.owner.representationEvidence).toMatchObject({
      state: 'ready',
      blocksTotal: 0,
      representationsResident: 0,
    });
    fixture.owner.dispose();
  });

  it('notifies terminal readiness when all visual templates are already cached', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      hasTerrainTemplate: true,
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'visual-templates',
        outcome: 'ready',
      }),
    );
    expect(fixture.createVisual).not.toHaveBeenCalled();
    expect(fixture.owner.visualEvidence).toMatchObject({
      state: 'templates-ready',
      reusableVariantsReused: 1,
    });
    fixture.owner.dispose();
  });

  it('reports partial template preparation as a terminal outcome', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      reusableKey: () => undefined,
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'visual-templates',
        outcome: 'partial',
      }),
    );
    expect(fixture.owner.visualEvidence).toMatchObject({
      state: 'partial',
      reusableVariantsSkipped: 1,
    });
    fixture.owner.dispose();
  });

  it('reports unexpected preload failure once without leaving preparation pending', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      reusableKey: () => {
        throw new Error('template resolver failed');
      },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'visual-templates',
        outcome: 'failed',
      }),
    );
    expect(fixture.owner.visualEvidence).toMatchObject({
      state: 'failed',
      templateState: 'failed',
    });
    expect(fixture.owner.representationEvidence.state).toBe('failed');
    fixture.owner.dispose();
  });

  it('reports representation-stage failure as one terminal outcome', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      visibleEntry: () => {
        throw new Error('projection entry unavailable');
      },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'representations',
        outcome: 'failed',
      }),
    );
    expect(fixture.owner.representationEvidence).toMatchObject({ state: 'failed', jobsPending: 0 });
    fixture.owner.dispose();
  });

  it('cleans partial enqueue and owned signature after failure before scheduling, preserving another owner', async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
      visibleEntry: (block) => {
        if (block.position.x === 1) throw new Error('second projection entry failed');
        return { signature: 'prewarm-signature', role: 'normal' } as never;
      },
    });
    const unrelatedJob: BlockHydrationJob = {
      key: 'unrelated-key',
      token: 1,
      projectionRevision: 0,
      block: placedBlock(),
      signature: 'unrelated-signature',
      role: 'normal',
      worldContext: { getBlock: () => undefined },
      options: {},
      allowInstancing: false,
      surfaceFastPathEligible: false,
      surfaceVisibleEntries: new Map(),
      layerPrewarm: false,
    };
    fixture.hydration.setPendingSignature(unrelatedJob.key, unrelatedJob.signature);
    fixture.hydration.enqueueRegular(unrelatedJob);

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.callbacks.scheduleHydration).not.toHaveBeenCalled();
    expect(fixture.queuedJobs).toEqual([unrelatedJob]);
    expect(fixture.pendingSignatures.has(coordinateKey(placedBlock().position))).toBe(false);
    expect(fixture.pendingSignatures.get(unrelatedJob.key)?.signature).toBe('unrelated-signature');
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'representations',
        outcome: 'failed',
      }),
    );
    fixture.owner.dispose();
  });

  it('preserves replacement work and signature for the same key during failed cleanup', async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
      visibleEntry: (block) => {
        if (block.position.x === 1) {
          const oldJob = fixture.queuedJobs[0];
          const replacement: BlockHydrationJob = {
            ...oldJob,
            layerPrewarm: false,
            layerPrewarmAttemptId: undefined,
            ownerToken: undefined,
            signature: 'replacement-signature',
          };
          fixture.hydration.setPendingSignature(oldJob.key, replacement.signature);
          fixture.hydration.enqueueRegular(replacement);
          throw new Error('next representation failed');
        }
        return { signature: 'prewarm-signature', role: 'normal' } as never;
      },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.queuedJobs).toHaveLength(1);
    expect(fixture.queuedJobs[0]).toMatchObject({
      layerPrewarm: false,
      signature: 'replacement-signature',
    });
    expect(fixture.pendingSignatures.get(fixture.queuedJobs[0].key)?.signature).toBe(
      'replacement-signature',
    );
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    fixture.owner.dispose();
  });

  it('cleans a job inserted by an enqueue callback that then throws', async () => {
    const fixture = createFixture({ blocks: [placedBlock()] });
    fixture.hydration.enqueueRegular.mockImplementationOnce((job) => {
      fixture.queuedJobs.push(job);
      throw new Error('enqueue observer failed after insertion');
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.queuedJobs).toHaveLength(0);
    expect(fixture.pendingSignatures.size).toBe(0);
    expect(fixture.callbacks.scheduleHydration).not.toHaveBeenCalled();
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    fixture.owner.dispose();
  });

  it('does not cancel an already-running attempt job when a later block fails', async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
      visibleEntry: (block) => {
        if (block.position.x === 1) {
          const running = fixture.queuedJobs.shift()!;
          fixture.runningJobs.push(running);
          fixture.hydration.clearPendingSignatureIfOwned(
            running.key,
            running.signature,
            running.ownerToken!,
          );
          throw new Error('next representation failed');
        }
        return { signature: 'prewarm-signature', role: 'normal' } as never;
      },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);
    fixture.owner.onHydrationCompleted(fixture.runningJobs[0], false);

    expect(fixture.runningJobs).toHaveLength(1);
    expect(fixture.queuedJobs).toHaveLength(0);
    expect(fixture.pendingSignatures.size).toBe(0);
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.owner.representationEvidence.state).toBe('failed');
    fixture.owner.dispose();
  });

  it('cleans remaining queued work when representation completion processing throws', async () => {
    const fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
    });
    fixture.owner.prepare(fixture.project);
    await waitForScheduledHydration(fixture.callbacks);

    const running = fixture.queuedJobs.shift()!;
    fixture.hydration.clearPendingSignatureIfOwned(
      running.key,
      running.signature,
      running.ownerToken!,
    );
    fixture.runningJobs.push(running);
    fixture.resources.blockIndex.get.mockReturnValue(running.block);
    fixture.resources.representations.get.mockReturnValue({ signature: running.signature });
    fixture.callbacks.record.mockImplementation((metric) => {
      if (metric === 'yLayerRepresentationJobsCompleted')
        throw new Error('completion observer failed');
    });

    fixture.owner.onHydrationCompleted(running, true);

    expect(fixture.queuedJobs).toHaveLength(0);
    expect(fixture.pendingSignatures.size).toBe(0);
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    expect(fixture.owner.representationEvidence).toMatchObject({ state: 'failed', jobsPending: 0 });
    fixture.owner.dispose();
  });

  it('cleans queued work and scope even when a cancellation terminal callback throws', async () => {
    const fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
    });
    fixture.owner.prepare(fixture.project);
    await waitForScheduledHydration(fixture.callbacks);
    fixture.terminal.mockImplementationOnce(() => {
      throw new Error('terminal observer failed');
    });

    expect(() => fixture.owner.cancel()).toThrow('terminal observer failed');
    expect(fixture.queuedJobs).toHaveLength(0);
    expect(fixture.pendingSignatures.size).toBe(0);
    expect(fixture.terminal).toHaveBeenCalledTimes(1);

    fixture.terminal.mockImplementation(() => undefined);
    fixture.owner.prepare(fixture.project);
    for (
      let attempt = 0;
      attempt < 100 && !fixture.queuedJobs.some((job) => job.layerPrewarm);
      attempt += 1
    )
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(fixture.queuedJobs.some((job) => job.layerPrewarm)).toBe(true);
    expect(fixture.callbacks.scheduleHydration.mock.calls.length).toBeGreaterThan(1);
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    fixture.owner.dispose();
  });

  it('ignores a running completion after generation cancellation without retaining queued work', async () => {
    const fixture = createFixture({
      blocks: [placedBlock(0), { ...placedBlock(0), position: { x: 1, y: 0, z: 0 } }],
    });
    fixture.owner.prepare(fixture.project);
    await waitForScheduledHydration(fixture.callbacks);

    const staleRunning = fixture.queuedJobs.shift()!;
    fixture.hydration.clearPendingSignatureIfOwned(
      staleRunning.key,
      staleRunning.signature,
      staleRunning.ownerToken!,
    );
    fixture.runningJobs.push(staleRunning);
    fixture.owner.cancel();
    fixture.setHydrationGeneration(2);
    fixture.owner.onHydrationCompleted(staleRunning, true);

    expect(fixture.queuedJobs).toHaveLength(0);
    expect(fixture.pendingSignatures.size).toBe(0);
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'cancelled' }),
    );
    expect(fixture.owner.representationEvidence.state).toBe('cancelled');
    fixture.owner.dispose();
  });

  it('disposes queued prewarm work without affecting unrelated queued jobs', async () => {
    const fixture = createFixture({ blocks: [placedBlock()] });
    const unrelatedJob: BlockHydrationJob = {
      key: 'unrelated-key',
      token: 1,
      projectionRevision: 0,
      block: placedBlock(),
      signature: 'unrelated-signature',
      role: 'normal',
      worldContext: { getBlock: () => undefined },
      options: {},
      allowInstancing: false,
      surfaceFastPathEligible: false,
      surfaceVisibleEntries: new Map(),
      layerPrewarm: false,
    };
    fixture.hydration.setPendingSignature(unrelatedJob.key, unrelatedJob.signature);
    fixture.hydration.enqueueRegular(unrelatedJob);
    fixture.owner.prepare(fixture.project);
    await waitForScheduledHydration(fixture.callbacks);

    fixture.owner.dispose();

    expect(fixture.queuedJobs).toEqual([unrelatedJob]);
    expect(fixture.pendingSignatures.get(unrelatedJob.key)?.signature).toBe(unrelatedJob.signature);
    expect(fixture.pendingSignatures.has(coordinateKey(placedBlock().position))).toBe(false);
    expect(fixture.terminal).not.toHaveBeenCalled();
  });

  it('turns a thrown final scheduling callback into one failure terminal', async () => {
    const fixture = createFixture();
    fixture.callbacks.scheduleHydration.mockImplementation((delay) => {
      if (delay === false) throw new Error('final schedule callback failed');
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.owner.representationEvidence.state).toBe('failed');
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    fixture.owner.dispose();
  });

  it('notifies cancellation once and ignores the stale async completion', async () => {
    let resolveVisual!: (visual: { readonly object: THREE.Object3D }) => void;
    const fixture = createFixture({
      blocks: [placedBlock()],
      createVisual: () =>
        new Promise((resolve) => {
          resolveVisual = resolve;
        }),
    });

    fixture.owner.prepare(fixture.project);
    for (let attempt = 0; attempt < 100 && !resolveVisual; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(resolveVisual).toBeTypeOf('function');

    fixture.owner.cancel();
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'cancelled' }),
    );
    resolveVisual({ object: new THREE.Group() });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.owner.representationEvidence.state).toBe('cancelled');
    fixture.owner.dispose();
  });

  it('ignores completion from an old project after rapid scope replacement', async () => {
    let resolveVisual!: (visual: { readonly object: THREE.Object3D }) => void;
    const fixture = createFixture({
      blocks: [placedBlock()],
      createVisual: () =>
        new Promise((resolve) => {
          resolveVisual = resolve;
        }),
    });
    const nextProject: ProjectDocument = { ...fixture.project, id: 'next-project', blocks: [] };

    fixture.owner.prepare(fixture.project);
    for (let attempt = 0; attempt < 100 && !resolveVisual; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    fixture.setProject(nextProject);
    fixture.owner.prepare(nextProject);
    resolveVisual({ object: new THREE.Group() });
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: nextProject.id,
        blocks: nextProject.blocks,
        outcome: 'ready',
      }),
    );
    fixture.owner.dispose();
  });

  it('rejects a stale provider-generation completion and emits only for the replacement scope', async () => {
    let resolveOldTemplates!: (templates: undefined) => void;
    let cacheReady = false;
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      hasTerrainTemplate: () => cacheReady,
      resolveTerrainTemplates: () =>
        new Promise((resolve) => {
          resolveOldTemplates = resolve;
        }),
    });

    fixture.owner.prepare(fixture.project);
    for (let attempt = 0; attempt < 100 && !resolveOldTemplates; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(resolveOldTemplates).toBeTypeOf('function');

    fixture.setProviderGeneration(2);
    cacheReady = true;
    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);
    resolveOldTemplates(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        providerGeneration: 2,
        outcome: 'ready',
      }),
    );
    expect(fixture.owner.visualEvidence.state).toBe('templates-ready');
    fixture.owner.dispose();
  });

  it('suppresses late completion after disposal', async () => {
    let resolveVisual!: (visual: { readonly object: THREE.Object3D }) => void;
    const fixture = createFixture({
      blocks: [placedBlock()],
      createVisual: () =>
        new Promise((resolve) => {
          resolveVisual = resolve;
        }),
    });

    fixture.owner.prepare(fixture.project);
    for (let attempt = 0; attempt < 100 && !resolveVisual; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(resolveVisual).toBeTypeOf('function');

    fixture.owner.dispose();
    resolveVisual({ object: new THREE.Group() });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.terminal).not.toHaveBeenCalled();
    expect(fixture.owner.representationEvidence.state).toBe('idle');
  });
});

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import { YLayerRepresentationPrewarmOwner } from './y-layer-representation-prewarm-owner';
import type { ViewportRenderOptions } from './viewport-engine-contracts';

interface PrewarmFixtureOptions {
  readonly blocks?: readonly PlacedBlock[];
  readonly exposedFaceRendering?: boolean;
  readonly hasTerrainTemplate?: boolean | (() => boolean);
  readonly reusableKey?: (block: PlacedBlock) => string | undefined;
  readonly visibleEntry?: () => never;
  readonly createVisual?: (block: PlacedBlock) => Promise<{ readonly object: THREE.Object3D } | undefined>;
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
  const createVisual = vi.fn(async (block: PlacedBlock) =>
    options.createVisual
      ? options.createVisual(block)
      : { object: new THREE.Group() },
  );
  const resources = {
    blockIndex: { visualRevision: 1, get: vi.fn() },
    representations: { get: vi.fn() },
    hydration: {
      regularJobs: () => [],
      removePendingKeys: vi.fn(),
      clearPendingSignature: vi.fn(),
      hasPendingSignature: () => false,
      setPendingSignature: vi.fn(),
      enqueueRegular: vi.fn(),
    },
    projection: { revisionForKey: () => 0, visibleEntriesByKey: new Map() },
    fluids: { isClaimed: () => false, isTerminal: () => false },
    instances: {
      hasTemplate: () => false,
      cachePreparedTemplate: () => true,
      prepareReusableTemplate: () => undefined,
      disposePreparedTemplate: vi.fn(),
    },
    terrain: {
      hasTemplates: () => typeof options.hasTerrainTemplate === 'function'
        ? options.hasTerrainTemplate()
        : options.hasTerrainTemplate ?? false,
    },
    terrainWorkflow: {
      resolveTemplatesFor: vi.fn(() => options.resolveTerrainTemplates?.() ?? Promise.resolve([])),
    },
    representationHydration: { acquireProviderReference: () => vi.fn() },
  };
  const callbacks = {
    createVisual: (currentProvider: BlockVisualProvider, block: PlacedBlock) => createVisual(block) as never,
    reusableKey: (_provider: BlockVisualProvider, block: PlacedBlock) =>
      options.reusableKey ? options.reusableKey(block) : block.id,
    visibleEntry: options.visibleEntry ?? (() => ({ signature: 'signature', role: 'normal' }) as never),
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
  const owner = new YLayerRepresentationPrewarmOwner(
    {
      project: () => currentProject,
      options: () => renderOptions,
      provider: () => provider,
      providerGeneration: () => currentProviderGeneration,
      hydrationGeneration: () => 1,
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
    setProject: (value: ProjectDocument | undefined) => { currentProject = value; },
    setProviderGeneration: (value: number) => { currentProviderGeneration = value; },
  };
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

describe('YLayerRepresentationPrewarmOwner terminal lifecycle', () => {
  it('notifies terminal readiness for an empty project without hydration or projection work', async () => {
    const fixture = createFixture();

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      projectId: fixture.project.id,
      blocks: fixture.project.blocks,
      provider: fixture.provider,
      phase: 'representations',
      outcome: 'ready',
    }));
    expect(fixture.createVisual).not.toHaveBeenCalled();
    expect(fixture.callbacks.scheduleHydration).toHaveBeenCalledWith(false);
    expect(fixture.owner.representationEvidence).toMatchObject({ state: 'ready', blocksTotal: 0, representationsResident: 0 });
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
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'visual-templates',
      outcome: 'ready',
    }));
    expect(fixture.createVisual).not.toHaveBeenCalled();
    expect(fixture.owner.visualEvidence).toMatchObject({ state: 'templates-ready', reusableVariantsReused: 1 });
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
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'visual-templates',
      outcome: 'partial',
    }));
    expect(fixture.owner.visualEvidence).toMatchObject({ state: 'partial', reusableVariantsSkipped: 1 });
    fixture.owner.dispose();
  });

  it('reports unexpected preload failure once without leaving preparation pending', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      reusableKey: () => { throw new Error('template resolver failed'); },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'visual-templates',
      outcome: 'failed',
    }));
    expect(fixture.owner.visualEvidence).toMatchObject({ state: 'failed', templateState: 'failed' });
    expect(fixture.owner.representationEvidence.state).toBe('failed');
    fixture.owner.dispose();
  });

  it('reports representation-stage failure as one terminal outcome', async () => {
    const fixture = createFixture({
      blocks: [placedBlock()],
      visibleEntry: () => { throw new Error('projection entry unavailable'); },
    });

    fixture.owner.prepare(fixture.project);
    await waitForTerminal(fixture.terminal);

    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'representations',
      outcome: 'failed',
    }));
    expect(fixture.owner.representationEvidence).toMatchObject({ state: 'failed', jobsPending: 0 });
    fixture.owner.dispose();
  });

  it('notifies cancellation once and ignores the stale async completion', async () => {
    let resolveVisual!: (visual: { readonly object: THREE.Object3D }) => void;
    const fixture = createFixture({
      blocks: [placedBlock()],
      createVisual: () => new Promise((resolve) => { resolveVisual = resolve; }),
    });

    fixture.owner.prepare(fixture.project);
    for (let attempt = 0; attempt < 100 && !resolveVisual; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(resolveVisual).toBeTypeOf('function');

    fixture.owner.cancel();
    expect(fixture.terminal).toHaveBeenCalledTimes(1);
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled' }));
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
      createVisual: () => new Promise((resolve) => { resolveVisual = resolve; }),
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
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      projectId: nextProject.id,
      blocks: nextProject.blocks,
      outcome: 'ready',
    }));
    fixture.owner.dispose();
  });

  it('rejects a stale provider-generation completion and emits only for the replacement scope', async () => {
    let resolveOldTemplates!: (templates: undefined) => void;
    let cacheReady = false;
    const fixture = createFixture({
      blocks: [placedBlock()],
      exposedFaceRendering: true,
      hasTerrainTemplate: () => cacheReady,
      resolveTerrainTemplates: () => new Promise((resolve) => { resolveOldTemplates = resolve; }),
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
    expect(fixture.terminal).toHaveBeenCalledWith(expect.objectContaining({
      providerGeneration: 2,
      outcome: 'ready',
    }));
    expect(fixture.owner.visualEvidence.state).toBe('templates-ready');
    fixture.owner.dispose();
  });

  it('suppresses late completion after disposal', async () => {
    let resolveVisual!: (visual: { readonly object: THREE.Object3D }) => void;
    const fixture = createFixture({
      blocks: [placedBlock()],
      createVisual: () => new Promise((resolve) => { resolveVisual = resolve; }),
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

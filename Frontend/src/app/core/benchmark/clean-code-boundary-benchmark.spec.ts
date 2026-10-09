import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VanillaAssetProvider } from '../assets/vanilla/vanilla-asset-provider';
import { auditVanillaAssets } from '../assets/vanilla/vanilla-asset-audit';
import { GroupService } from '../editor/groups/group.service';
import { HistoryService } from '../editor/history/history.service';
import { SelectionService } from '../editor/selection/selection.service';
import { ActiveBlockService } from '../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../blocks/catalog/block-library.service';
import type { ProjectDocument } from '../domain/project.types';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import {
  ViewportRuntimeTrace,
  type ViewportTraceSample,
} from '../renderer/diagnostics/viewport-runtime-trace';
import { ThreeViewportEngine } from '../renderer/engine/three-viewport-engine';
import { rendererBenchmarkProject } from '../renderer/benchmark/renderer-benchmark-fixtures';
import {
  RendererDiagnostics,
  type RendererCounters,
} from '../renderer/engine/renderer-diagnostics';
import { DialogService } from '../ui/dialog/dialog.service';
import { I18nService } from '../ui/localization/i18n.service';
import { UiPreferencesService } from '../ui/preferences/ui-preferences.service';
import { SettingsDialogComponent } from '../../features/editor/settings/settings-dialog/settings-dialog.component';

const enabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'CLEAN_CODE_BOUNDARY_BENCHMARK'
  ] === '1';

describe.skipIf(!enabled)('Clean Code boundary before/after performance benchmark', () => {
  it('measures a real 4K-block group move transaction', () => {
    const samples: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const { groups } = createGroupMoveFixture(4096);
      groups.select('benchmark-group');
      groups.setMoveOffset('x', 64);
      const start = performance.now();
      const committed = groups.saveMove();
      samples.push(performance.now() - start);
      expect(committed).toBe(true);
    }
    report('group-move transaction', '4096 blocks, 5 independent commits', samples);
  });

  it('measures runtime trace recording plus report construction', () => {
    const samples: number[] = [];
    let eventCount = 0;
    for (let run = 0; run < 5; run += 1) {
      const trace = new ViewportRuntimeTrace({
        metadata: () => ({ projectBlocks: 110_592, minecraftVersion: '1.21.1' }),
        sample: traceSample,
      });
      const start = performance.now();
      trace.start('clean-code-boundary-benchmark');
      for (let event = 0; event < 10_000; event += 1)
        trace.record('render-request', { request: event });
      const reportDocument = trace.stop();
      samples.push(performance.now() - start);
      eventCount = reportDocument?.summary.recorder['renderRequestCount'] as number;
      expect(eventCount).toBe(10_000);
    }
    report('viewport trace report', '10,000 recorded events plus finalized summary', samples);
  });

  it('measures the production vanilla asset audit pipeline over 512 catalog entries', async () => {
    const provider = auditFixture(512);
    const samples: number[] = [];
    let totalEntries = 0;
    try {
      for (let run = 0; run < 5; run += 1) {
        const start = performance.now();
        const result = await auditVanillaAssets(provider, {
          decodeTexture: async () => true,
          batchSize: 32,
        });
        samples.push(performance.now() - start);
        totalEntries = result.summary.totalEntries;
        expect(totalEntries).toBe(512);
      }
    } finally {
      provider.dispose();
    }
    report(
      'vanilla asset audit',
      `${totalEntries} catalog entries, full resolver/geometry audit`,
      samples,
    );
  }, 120_000);

  it('measures Settings dialog draft edits and Apply through the component boundary', async () => {
    TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [
        UiPreferencesService,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: DialogService, useValue: { confirm: async () => false } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SettingsDialogComponent);
    const component = fixture.componentInstance as unknown as {
      setLocale(locale: 'en' | 'vi'): void;
      apply(): void | Promise<void>;
    };
    const samples: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      for (let edit = 0; edit < 250; edit += 1) {
        component.setLocale(edit % 2 === 0 ? 'vi' : 'en');
        await component.apply();
      }
      samples.push(performance.now() - start);
    }
    fixture.destroy();
    TestBed.resetTestingModule();
    report('settings session', '250 locale draft/apply cycles, 5 samples', samples);
  }, 60_000);

  it(
    'measures 110K Y-layer prewarm, activation, visibility switching and scrubbing',
    { timeout: 180_000 },
    async () => {
      const stageSamples = {
        startup: [] as number[],
        yInitialization: [] as number[],
        prewarm: [] as number[],
        activation: [] as number[],
        visibility: [] as number[],
        scrub: [] as number[],
      };
      let resources: Readonly<Record<string, unknown>> = {};
      let primaryResources: Readonly<Record<string, unknown>> = {};
      for (let run = 0; run < 3; run += 1) {
        const project = rendererBenchmarkProject('mega');
        const byY = new Map<number, (typeof project.blocks)[number][]>();
        for (const block of project.blocks) {
          let layer = byY.get(block.position.y);
          if (!layer) byY.set(block.position.y, (layer = []));
          layer.push(block);
        }
        const layerIndex = {
          blocksAtY: (y: number) => byY.get(y) ?? [],
          occupiedLayers: () => [...byY.keys()].sort((a, b) => a - b),
          allBlocks: () => project.blocks,
        };
        const primaryEngine = new ThreeViewportEngine();
        primaryEngine.setLayerIndex(layerIndex);
        let started = performance.now();
        primaryEngine.update(project, undefined, { exposedFaceRendering: true });
        stageSamples.startup.push(performance.now() - started);
        const primaryEvidence = primaryEngine.performanceEvidence();
        primaryResources = {
          visibleBlocks: primaryEvidence.renderedBlocks,
          hydrationQueue: primaryEvidence.hydrationQueue,
          meshCount: primaryEvidence.meshCount,
          instanceBatches: primaryEvidence.instanceBatches,
        };
        primaryEngine.dispose();

        const diagnostics = new RendererDiagnostics();
        const engine = new ThreeViewportEngine(diagnostics);
        engine.setLayerIndex(layerIndex);
        const initialOptions = { layerY: 47, visibility: 'current-only' as const, layerIndex };
        started = performance.now();
        engine.suspend();
        engine.update(project, undefined, { exposedFaceRendering: true });
        engine.update(project, undefined, initialOptions);

        const prewarm = (
          engine as unknown as {
            prewarmYLayerProjection?: (
              document: typeof project,
              options: typeof initialOptions,
            ) => number;
          }
        ).prewarmYLayerProjection;
        const prewarmStarted = performance.now();
        const preparedCount = prewarm?.call(engine, project, initialOptions) ?? 0;
        stageSamples.prewarm.push(performance.now() - prewarmStarted);
        stageSamples.yInitialization.push(performance.now() - started);
        engine.resume();
        started = performance.now();
        engine.update(project, undefined, initialOptions);
        stageSamples.activation.push(performance.now() - started);
        await waitProjectionIdle(engine);

        started = performance.now();
        engine.update(project, undefined, { ...initialOptions, visibility: 'all-below' });
        await waitProjectionIdle(engine);
        stageSamples.visibility.push(performance.now() - started);
        started = performance.now();
        engine.update(project, undefined, {
          ...initialOptions,
          visibility: 'all-below',
          layerY: 24,
        });
        await waitProjectionIdle(engine);
        stageSamples.scrub.push(performance.now() - started);

        const evidence = engine.performanceEvidence();
        resources = {
          preparedProjectionBlocks: preparedCount,
          renderedBlocks: evidence.renderedBlocks,
          meshCount: evidence.meshCount,
          instanceBatches: evidence.instanceBatches,
          terrainChunkMeshes: evidence.terrainChunkMeshes,
          hydrationQueue: evidence.hydrationQueue,
          projection: engine.projectionActivity(),
          counters: selectProjectionCounters(diagnostics.snapshot()),
        };
        engine.dispose();
      }
      for (const [stage, samples] of Object.entries(stageSamples)) {
        const label =
          stage === 'startup'
            ? '3D initial reconciliation 110K'
            : stage === 'yInitialization'
              ? 'Y-layer initialization/prewarm 110K'
              : `Y-layer 110K ${stage}`;
        report(label, '3 independent engine sessions', samples);
      }
      (
        globalThis as { process?: { stdout?: { write(value: string): void } } }
      ).process?.stdout?.write(
        `[clean-code-boundary-benchmark] Y-layer resources=${JSON.stringify({ primary: primaryResources, yLayer: resources })}\n`,
      );
      expect((resources['projection'] as { activity: string }).activity).toBe('idle');
    },
  );
});

function createGroupMoveFixture(count: number): { readonly groups: GroupService } {
  const blocks = Array.from({ length: count }, (_, index) => ({
    kind: 'resolved' as const,
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x: index % 32, y: Math.floor(index / 32) % 32, z: Math.floor(index / 1024) },
    state: {},
    groupIds: ['benchmark-group'],
  }));
  const project: ProjectDocument = {
    schemaVersion: 2,
    id: 'group-move-benchmark',
    metadata: {
      name: 'Group Move Benchmark',
      minecraftVersion: '1.21.1',
      createdAt: '',
      updatedAt: '',
    },
    size: { x: 128, y: 64, z: 16 },
    structureMode: 'vanilla-structure-block',
    blocks,
    groups: [{ id: 'benchmark-group', name: 'Benchmark', visible: true, locked: false }],
    editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
  };
  const workspace = new WorkspaceStateService();
  workspace.project.set(project);
  const selection = new SelectionService();
  const history = new HistoryService(workspace);
  const library = new BlockLibraryService(new ActiveBlockService());
  return { groups: new GroupService(workspace, selection, history, library) };
}

function auditFixture(count: number): VanillaAssetProvider {
  const json: Record<string, unknown> = {};
  const binary = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    const name = `benchmark_block_${index}`;
    json[`assets/minecraft/blockstates/${name}.json`] = {
      variants: { '': { model: `minecraft:block/${name}` } },
    };
    json[`assets/minecraft/models/block/${name}.json`] = {
      textures: { all: `minecraft:block/${name}` },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: Object.fromEntries(
            ['down', 'up', 'north', 'south', 'west', 'east'].map((face) => [
              face,
              { texture: '#all' },
            ]),
          ),
        },
      ],
    };
    binary.set(`assets/minecraft/textures/block/${name}.png`, new Uint8Array([137, 80, 78, 71]));
  }
  return new VanillaAssetProvider('clean-code-benchmark', 'benchmark', json, binary);
}

function traceSample(): ViewportTraceSample {
  return {
    camera: {
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 5 },
      distance: 5,
      direction: { x: 0, y: 0, z: -1 },
      quaternion: [0, 0, 0, 1],
      up: { x: 0, y: 1, z: 0 },
      fov: 45,
      aspect: 1,
    },
    hydration: { completed: 110_592, generation: 1 },
    counters: {
      actualSceneRenders: 1,
      cameraRenderRequests: 1,
      cameraRenderRequestsCoalesced: 0,
      structuralReconciles: 1,
      fullSceneRebuilds: 0,
      terrainBulkBatches: 0,
    },
    render: { frameDurationMs: 16, renderCpuMs: 1, drawCalls: 2, triangles: 12 },
    generations: { providerGeneration: 1 },
  };
}

function report(name: string, workload: string, samples: readonly number[]): void {
  const medianMs = [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
  (globalThis as { process?: { stdout?: { write(value: string): void } } }).process?.stdout?.write(
    `[clean-code-boundary-benchmark] ${name}: ${workload}; median/${samples.length}=${medianMs.toFixed(2)} ms; samples=${samples.map((value) => value.toFixed(2)).join(',')}\n`,
  );
}

function selectProjectionCounters(counters: RendererCounters): Readonly<Record<string, number>> {
  const names = [
    'fullSceneRebuilds',
    'blockAdds',
    'blockRemovals',
    'yLayerProjectionChangedBlocks',
    'yLayerProjectionSlices',
    'yLayerProjectionYields',
    'yLayerProjectionCancellations',
    'yLayerProjectionMaxSliceMs',
    'fullVisibleScans',
    'occupancyFullRebuilds',
    'occupancyDeltaUpdates',
  ];
  return Object.fromEntries(
    names.map((name) => [name, counters[name as keyof RendererCounters] ?? 0]),
  );
}

async function waitProjectionIdle(engine: ThreeViewportEngine): Promise<void> {
  for (let attempt = 0; attempt < 30_000; attempt += 1) {
    if (engine.projectionActivity().activity === 'idle') return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(
    `Y-layer projection did not settle: ${JSON.stringify(engine.projectionActivity())}`,
  );
}

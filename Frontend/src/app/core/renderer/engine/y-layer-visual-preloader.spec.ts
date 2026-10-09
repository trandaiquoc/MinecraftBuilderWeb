import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { Y_LAYER_PRELOAD_MAX_TEMPLATE_BYTES, YLayerVisualPreloader, type YLayerVisualPreloaderPorts } from './y-layer-visual-preloader';

function blocksByLayer(): PlacedBlock[] {
  return [0, 0, 1, 2].map((y, index) => ({ kind: 'resolved', id: `test:block_${index % 2}`, namespace: 'test', position: { x: index, y, z: 0 }, state: {} }));
}

function fixture(overrides: Partial<YLayerVisualPreloaderPorts<string>> = {}) {
  let currentBlocks: readonly PlacedBlock[] | undefined;
  let providerGeneration = 1;
  const cache = new Set<string>();
  const create = vi.fn(async (block: PlacedBlock) => ({ value: `${block.id}`, estimatedBytes: 8 }));
  const dispose = vi.fn();
  const preloader = new YLayerVisualPreloader<string>({
    hasCached: (key) => cache.has(key),
    reusableKey: (block) => block.id,
    create,
    commit: (key) => { cache.add(key); },
    dispose,
    isCurrent: (blocks, generation) => blocks === currentBlocks && generation === providerGeneration,
    providerGeneration: () => providerGeneration,
    yieldToBrowser: async () => undefined,
    ...overrides,
  });
  return { preloader, create, dispose, cache, setCurrent: (blocks: readonly PlacedBlock[]) => { currentBlocks = blocks; }, setProviderGeneration: (value: number) => { providerGeneration = value; } };
}

describe('YLayerVisualPreloader', () => {
  it('prepares reusable resources for all occupied layers independent of visibility/group filtering', async () => {
    const subject = fixture();
    const blocks = blocksByLayer();
    subject.setCurrent(blocks);

    const evidence = await subject.preloader.start(blocks, 1);

    expect(evidence).toMatchObject({ state: 'complete', blocksVisited: 4, layersTotal: 3, layersReady: 3, reusableVariantsPrepared: 2 });
    expect(subject.create).toHaveBeenCalledTimes(2);
  });

  it('reuses already prepared resources without creating them again', async () => {
    const subject = fixture();
    const blocks = blocksByLayer();
    subject.setCurrent(blocks);
    await subject.preloader.start(blocks, 1);
    subject.preloader.cancel();

    const repeated = await subject.preloader.start(blocks, 1);

    expect(repeated.reusableVariantsReused).toBe(2);
    expect(subject.create).toHaveBeenCalledTimes(2);
  });

  it('discards resources completed after the project/provider generation changes', async () => {
    const blocks = blocksByLayer();
    let resolveResource!: (resource: { value: string; estimatedBytes: number }) => void;
    const create = vi.fn(() => new Promise<{ value: string; estimatedBytes: number }>((resolve) => { resolveResource = resolve; }));
    const subject = fixture({ create });
    subject.setCurrent(blocks);
    const preparing = subject.preloader.start(blocks, 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    subject.setProviderGeneration(2);
    resolveResource({ value: 'stale', estimatedBytes: 8 });

    const evidence = await preparing;

    expect(evidence.state).toBe('cancelled');
    expect(subject.dispose).toHaveBeenCalledTimes(1);
    expect(subject.cache.size).toBe(0);
  });

  it('marks a layer partial when a block has no reusable visual resource', async () => {
    const subject = fixture({ reusableKey: (block) => block.id.endsWith('_1') ? undefined : block.id });
    const blocks = blocksByLayer();
    subject.setCurrent(blocks);

    const evidence = await subject.preloader.start(blocks, 1);

    expect(evidence.state).toBe('partial');
    expect(evidence.layersReady).toBe(1);
    expect(evidence.reusableVariantsSkipped).toBe(2);
  });

  it('disposes and reports resources that exceed the preload memory budget', async () => {
    const subject = fixture({ create: vi.fn(async (block) => ({ value: block.id, estimatedBytes: Y_LAYER_PRELOAD_MAX_TEMPLATE_BYTES + 1 })) });
    const blocks = blocksByLayer();
    subject.setCurrent(blocks);

    const evidence = await subject.preloader.start(blocks, 1);

    expect(evidence).toMatchObject({ state: 'partial', layersReady: 0, reusableVariantsPrepared: 0, reusableVariantsSkipped: 2 });
    expect(subject.dispose).toHaveBeenCalledTimes(2);
    expect(subject.cache.size).toBe(0);
  });
});

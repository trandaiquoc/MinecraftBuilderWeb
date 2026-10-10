import { describe, expect, it, vi } from 'vitest';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import type { VanillaBlockVisualProvider } from '../../renderer/geometry/vanilla-block-visual-provider';
import type { VanillaAssetProvider } from './vanilla-asset-provider';
import { AssetThumbnailService } from './asset-thumbnail-service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const item = {
  itemId: 'example:stone_item',
  displayBlockId: 'minecraft:stone',
  namespace: 'example',
  displayName: 'Stone Item',
  defaultState: {},
  concreteBlockIds: ['minecraft:stone'],
  placementKind: 'direct',
  previewRecipe: 'single',
  support: 'full',
  visualSupport: 'full',
  capabilities: {},
  previewBlocks: [],
} as unknown as PlaceableItemDefinition;

function createService() {
  const runtime: {
    generation: number;
    provider?: VanillaAssetProvider;
    visualProvider?: VanillaBlockVisualProvider;
    restoringExternalMods: boolean;
  } = {
    generation: 0,
    provider: { gameVersion: '1.21.1' } as VanillaAssetProvider,
    restoringExternalMods: false,
  };
  const service = new AssetThumbnailService({ getItem: () => undefined }, () => runtime);
  return { runtime, service };
}

function visual(overrides: Partial<VanillaBlockVisualProvider>): VanillaBlockVisualProvider {
  return { thumbnailUrl: () => undefined, ...overrides } as VanillaBlockVisualProvider;
}

describe('AssetThumbnailService', () => {
  it('keeps a flat preview visible while selected work upgrades it once', async () => {
    const { runtime, service } = createService();
    const render = vi.fn(async () => ({ url: 'blob:enhanced', quality: 'enhanced' as const }));
    runtime.visualProvider = visual({
      thumbnailUrl: () => 'resource:flat',
      perspectiveItemThumbnail: render,
    });

    service.requestItem(item, 'visible');
    expect(service.urlForItem(item)).toBe('resource:flat');
    expect(service.stateForItem(item).quality).toBe('fallback');
    service.requestItem(item, 'selected');
    await settle();

    expect(render).toHaveBeenCalledTimes(1);
    expect(service.urlForItem(item)).toBe('blob:enhanced');
    expect(service.stateForItem(item)).toEqual({ quality: 'enhanced', enhancement: 'complete' });
  });

  it('does not duplicate a running render and reuses a confirmed enhanced result', async () => {
    const { runtime, service } = createService();
    let release!: (value: { readonly url: string; readonly quality: 'enhanced' }) => void;
    const render = vi.fn(
      () =>
        new Promise<{ readonly url: string; readonly quality: 'enhanced' }>((resolve) => {
          release = resolve;
        }),
    );
    runtime.visualProvider = visual({
      thumbnailUrl: () => 'resource:flat',
      perspectiveItemThumbnail: render,
    });

    service.requestItem(item, 'visible');
    service.requestItem(item, 'selected');
    expect(render).toHaveBeenCalledTimes(1);
    release({ url: 'blob:enhanced', quality: 'enhanced' });
    await settle();
    service.requestItem(item, 'selected');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('allows a later visible retry after a transient failed enhancement', async () => {
    const { runtime, service } = createService();
    let attempts = 0;
    const render = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('renderer unavailable');
      return { url: 'blob:retry', quality: 'enhanced' as const };
    });
    runtime.visualProvider = visual({
      thumbnailUrl: () => 'resource:flat',
      perspectiveItemThumbnail: render,
    });

    service.requestItem(item, 'visible');
    await settle();
    expect(service.stateForItem(item)).toMatchObject({
      quality: 'fallback',
      enhancement: 'failed',
    });
    service.requestItem(item, 'visible');
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    expect(service.urlForItem(item)).toBe('blob:retry');
    expect(service.stateForItem(item)).toEqual({ quality: 'enhanced', enhancement: 'complete' });
  });

  it('marks unsupported enhancement unavailable without retrying it', async () => {
    const { runtime, service } = createService();
    const render = vi.fn(async () => ({
      url: undefined,
      quality: 'fallback' as const,
      retryable: false,
    }));
    runtime.visualProvider = visual({
      thumbnailUrl: () => 'resource:flat',
      perspectiveItemThumbnail: render,
    });

    service.requestItem(item, 'visible');
    await settle();
    expect(service.stateForItem(item)).toEqual({ quality: 'fallback', enhancement: 'unavailable' });
    service.requestItem(item, 'visible');
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.urlForItem(item)).toBe('resource:flat');
  });

  it('ignores stale provider results after a content generation transition', async () => {
    const { runtime, service } = createService();
    const old = deferred<{ readonly url: string; readonly quality: 'enhanced' }>();
    const current = deferred<{ readonly url: string; readonly quality: 'enhanced' }>();
    const oldVisual = visual({
      thumbnailUrl: () => 'resource:old',
      perspectiveItemThumbnail: () => old.promise,
    });
    const currentVisual = visual({
      thumbnailUrl: () => 'resource:current',
      perspectiveItemThumbnail: () => current.promise,
    });
    runtime.visualProvider = oldVisual;
    service.requestItem(item, 'visible');
    await settle();
    runtime.generation += 1;
    service.clearForContentGeneration();
    runtime.visualProvider = currentVisual;
    service.requestItem(item, 'visible');
    await settle();

    old.resolve({ url: 'blob:old', quality: 'enhanced' });
    await settle();
    expect(service.urlForItem(item)).toBe('resource:current');
    current.resolve({ url: 'blob:current', quality: 'enhanced' });
    await settle();
    expect(service.urlForItem(item)).toBe('blob:current');
  });

  it('defers work during batched mod restore until a new epoch', async () => {
    const { runtime, service } = createService();
    const render = vi.fn(async () => ({ url: 'blob:restored', quality: 'enhanced' as const }));
    runtime.visualProvider = visual({
      thumbnailUrl: () => 'resource:flat',
      perspectiveItemThumbnail: render,
    });
    runtime.restoringExternalMods = true;
    service.requestItem(item, 'visible');
    expect(render).not.toHaveBeenCalled();
    runtime.restoringExternalMods = false;
    service.advanceEpoch();
    service.requestItem(item, 'visible');
    await settle();
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.urlForItem(item)).toBe('blob:restored');
  });
});

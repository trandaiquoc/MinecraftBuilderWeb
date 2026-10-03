import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { VanillaBlockVisualProvider } from '../../renderer/geometry/block-model-geometry';
import { VanillaAssetsService } from './vanilla-assets.service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('VanillaAssetsService thumbnail quality', () => {
  it('keeps a flat preview visible while selected work upgrades it once', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    const render = vi.fn(async () => ({ url: 'blob:enhanced', quality: 'enhanced' as const }));
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);

    service.requestItemThumbnail(item, 'visible');
    expect(service.thumbnailUrlForItem(item)).toBe('resource:flat');
    expect(service.thumbnailStateForItem(item).quality).toBe('fallback');
    service.requestItemThumbnail(item, 'selected');
    await settle();

    expect(render).toHaveBeenCalledTimes(1);
    expect(service.thumbnailUrlForItem(item)).toBe('blob:enhanced');
    expect(service.thumbnailStateForItem(item)).toEqual({ quality: 'enhanced', enhancement: 'complete' });
  });

  it('does not duplicate a running render and reuses a confirmed enhanced result', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    let release!: (value: { readonly url: string; readonly quality: 'enhanced' }) => void;
    const render = vi.fn(() => new Promise<{ readonly url: string; readonly quality: 'enhanced' }>((resolve) => { release = resolve; }));
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);

    service.requestItemThumbnail(item, 'visible');
    service.requestItemThumbnail(item, 'selected');
    expect(render).toHaveBeenCalledTimes(1);
    release({ url: 'blob:enhanced', quality: 'enhanced' });
    await settle();
    service.requestItemThumbnail(item, 'selected');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('allows a later visible retry after a transient failed enhancement', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    let attempts = 0;
    const render = vi.fn(async () => { attempts += 1; if (attempts === 1) throw new Error('renderer unavailable'); return { url: 'blob:retry', quality: 'enhanced' as const }; });
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);

    service.requestItemThumbnail(item, 'visible');
    await settle();
    expect(service.thumbnailStateForItem(item)).toMatchObject({ quality: 'fallback', enhancement: 'failed' });
    service.requestItemThumbnail(item, 'visible');
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    expect(service.thumbnailUrlForItem(item)).toBe('blob:retry');
    expect(service.thumbnailStateForItem(item)).toEqual({ quality: 'enhanced', enhancement: 'complete' });
  });

  it('marks explicitly unsupported enhancement as unavailable without retrying it', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    const render = vi.fn(async () => ({ url: undefined, quality: 'fallback' as const, retryable: false }));
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);

    service.requestItemThumbnail(item, 'visible');
    await settle();
    expect(service.thumbnailStateForItem(item)).toEqual({ quality: 'fallback', enhancement: 'unavailable' });
    service.requestItemThumbnail(item, 'visible');
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.thumbnailUrlForItem(item)).toBe('resource:flat');
  });

  it('advances generation before replacing provider state and epoch', () => {
    const service = TestBed.inject(VanillaAssetsService);
    service.generation.set(5);
    service.thumbnailEpoch.set(10);
    const observed: number[] = [];
    const internal = service as unknown as { transitionThumbnailGeneration: (replace: () => void) => void };
    internal.transitionThumbnailGeneration(() => observed.push(service.generation()));
    expect(observed).toEqual([6]);
    expect(service.generation()).toBe(6);
    expect(service.thumbnailEpoch()).toBe(11);
  });

  it('ignores an old provider result after generation and epoch change', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    const old = deferred<{ readonly url: string; readonly quality: 'enhanced' }>();
    const current = deferred<{ readonly url: string; readonly quality: 'enhanced' }>();
    const oldVisual = { thumbnailUrl: () => 'resource:old', perspectiveItemThumbnail: () => old.promise } as unknown as VanillaBlockVisualProvider;
    const currentVisual = { thumbnailUrl: () => 'resource:current', perspectiveItemThumbnail: () => current.promise } as unknown as VanillaBlockVisualProvider;
    service.generation.set(1);
    service.thumbnailEpoch.set(10);
    service.visualProvider.set(oldVisual);
    service.requestItemThumbnail(item, 'visible');
    await settle();
    service.generation.set(2);
    service.thumbnailEpoch.set(11);
    service.visualProvider.set(currentVisual);
    service.requestItemThumbnail(item, 'visible');
    await settle();

    old.resolve({ url: 'blob:old', quality: 'enhanced' });
    await settle();
    expect(service.thumbnailUrlForItem(item)).toBe('resource:current');
    current.resolve({ url: 'blob:current', quality: 'enhanced' });
    await settle();
    expect(service.thumbnailUrlForItem(item)).toBe('blob:current');
  });

  it('defers thumbnail work during batched mod restore until the final epoch', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    const render = vi.fn(async () => ({ url: 'blob:restored', quality: 'enhanced' as const }));
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);
    const internal = service as unknown as { restoringExternalMods: boolean };
    internal.restoringExternalMods = true;
    service.requestItemThumbnail(item, 'visible');
    expect(render).not.toHaveBeenCalled();
    internal.restoringExternalMods = false;
    service.thumbnailEpoch.update((value) => value + 1);
    service.requestItemThumbnail(item, 'visible');
    await settle();
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.thumbnailUrlForItem(item)).toBe('blob:restored');
  });
});

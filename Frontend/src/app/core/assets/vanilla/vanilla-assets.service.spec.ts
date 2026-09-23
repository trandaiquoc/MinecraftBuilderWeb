import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { VanillaBlockVisualProvider } from '../../renderer/geometry/block-model-geometry';
import { VanillaAssetsService } from './vanilla-assets.service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('allows an explicit selected retry after a failed enhancement without background retry loops', async () => {
    const service = TestBed.inject(VanillaAssetsService);
    const item = TestBed.inject(BlockLibraryService).allItems()[0];
    const render = vi.fn(async () => { throw new Error('renderer unavailable'); });
    service.visualProvider.set({ thumbnailUrl: () => 'resource:flat', perspectiveItemThumbnail: render } as unknown as VanillaBlockVisualProvider);

    service.requestItemThumbnail(item, 'visible');
    await settle();
    expect(service.thumbnailStateForItem(item)).toMatchObject({ quality: 'fallback', enhancement: 'failed' });
    service.requestItemThumbnail(item, 'visible');
    expect(render).toHaveBeenCalledTimes(1);
    service.requestItemThumbnail(item, 'selected');
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    expect(service.thumbnailUrlForItem(item)).toBe('resource:flat');
  });
});

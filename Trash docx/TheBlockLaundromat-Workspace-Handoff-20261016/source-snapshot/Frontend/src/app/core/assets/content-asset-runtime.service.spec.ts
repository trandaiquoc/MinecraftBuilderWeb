import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContentAssetRuntimeService } from './content-asset-runtime.service';
import { ContentSourceCleanupError } from './content-source/composite-asset-provider';
import { AssetActivityService } from './asset-activity.service';

type Assert<T extends true> = T;
type ActiveProviderReadView = NonNullable<ReturnType<ContentAssetRuntimeService['provider']>>;
type ActiveProviderViewExcludesLifecycle = Assert<
  Extract<keyof ActiveProviderReadView, 'dispose' | 'serialize' | 'assertUsable'> extends never
    ? true
    : false
>;
type ActiveVisualProviderView = NonNullable<
  ReturnType<ContentAssetRuntimeService['visualProvider']>
>;
type ActiveVisualProviderViewExcludesDisposal = Assert<
  Extract<keyof ActiveVisualProviderView, 'dispose'> extends never ? true : false
>;
const activeProviderViewExcludesLifecycle: ActiveProviderViewExcludesLifecycle = true;
const activeVisualProviderViewExcludesDisposal: ActiveVisualProviderViewExcludesDisposal = true;

describe('ContentAssetRuntimeService content generation', () => {
  it('keeps active provider lifecycle methods private to the content runtime', () => {
    expect(activeProviderViewExcludesLifecycle).toBe(true);
    expect(activeVisualProviderViewExcludesDisposal).toBe(true);
  });

  it('exposes runtime state as read-only signals', () => {
    const service = TestBed.inject(ContentAssetRuntimeService);

    for (const state of [
      service.provider,
      service.visualProvider,
      service.status,
      service.contentRestore,
      service.activeVersion,
      service.downloadProgress,
      service.message,
      service.sourceName,
      service.generation,
      service.diagnostics,
      service.cachedVersions,
      service.compatibilityReport,
    ]) {
      expect(state).not.toHaveProperty('set');
      expect(state).not.toHaveProperty('update');
    }
  });

  it('waits for content restoration before treating JAR resources as unavailable', () => {
    const service = TestBed.inject(ContentAssetRuntimeService);
    const internal = service as unknown as {
      statusState: { set(value: string): void };
      contentRestoreState: {
        set(value: { phase: string; current: number; total: number; failed: number }): void;
      };
    };

    internal.statusState.set('ready');
    internal.contentRestoreState.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
    expect(service.resourceAvailabilitySettled()).toBe(false);

    internal.contentRestoreState.set({
      phase: 'restoring-mods',
      current: 0,
      total: 1,
      failed: 0,
    });
    expect(service.resourceAvailabilitySettled()).toBe(false);

    internal.contentRestoreState.set({ phase: 'ready', current: 1, total: 1, failed: 0 });
    expect(service.resourceAvailabilitySettled()).toBe(true);

    internal.statusState.set('no-assets');
    internal.contentRestoreState.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
    expect(service.resourceAvailabilitySettled()).toBe(true);
  });

  it('advances generation before replacing provider state and invalidates thumbnail epoch', () => {
    const service = TestBed.inject(ContentAssetRuntimeService);
    const beforeEpoch = service.thumbnailEpoch();
    const observed: number[] = [];
    const internal = service as unknown as {
      transitionThumbnailGeneration: (replace: () => void) => void;
    };
    internal.transitionThumbnailGeneration(() => observed.push(service.generation()));
    expect(observed).toEqual([1]);
    expect(service.generation()).toBe(1);
    expect(service.thumbnailEpoch()).toBe(beforeEpoch + 1);
  });

  it('continues runtime publication after committed source cleanup failure and reports a warning', () => {
    const service = TestBed.inject(ContentAssetRuntimeService);
    const internal = service as unknown as { publishSourceChange: (publish: () => void) => void };
    const cleanupFailure = new ContentSourceCleanupError([
      { sourceId: 'retired', error: new Error('dispose failed') },
    ]);

    expect(() =>
      internal.publishSourceChange(() => {
        throw cleanupFailure;
      }),
    ).not.toThrow();
    expect(TestBed.inject(AssetActivityService).entries().at(-1)).toMatchObject({
      operation: 'cache',
      level: 'warning',
      message: cleanupFailure.message,
    });
  });
});

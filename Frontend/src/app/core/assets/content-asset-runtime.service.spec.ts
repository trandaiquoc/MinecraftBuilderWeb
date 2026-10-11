import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContentAssetRuntimeService } from './content-asset-runtime.service';
import { ContentSourceCleanupError } from './content-source/composite-asset-provider';

describe('ContentAssetRuntimeService content generation', () => {
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
    expect(service.activity.entries().at(-1)).toMatchObject({
      operation: 'cache',
      level: 'warning',
      message: cleanupFailure.message,
    });
  });
});

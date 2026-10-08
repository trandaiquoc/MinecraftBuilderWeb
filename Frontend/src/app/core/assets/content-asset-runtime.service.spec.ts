import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContentAssetRuntimeService } from './content-asset-runtime.service';

describe('ContentAssetRuntimeService content generation', () => {
  it('advances generation before replacing provider state and invalidates thumbnail epoch', () => {
    const service = TestBed.inject(ContentAssetRuntimeService);
    service.generation.set(5);
    const beforeEpoch = service.thumbnailEpoch();
    const observed: number[] = [];
    const internal = service as unknown as { transitionThumbnailGeneration: (replace: () => void) => void };
    internal.transitionThumbnailGeneration(() => observed.push(service.generation()));
    expect(observed).toEqual([6]);
    expect(service.generation()).toBe(6);
    expect(service.thumbnailEpoch()).toBe(beforeEpoch + 1);
  });
});

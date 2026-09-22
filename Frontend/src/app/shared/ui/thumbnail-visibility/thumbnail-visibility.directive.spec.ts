import { ElementRef, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ThumbnailVisibilityDirective } from './thumbnail-visibility.directive';

describe('ThumbnailVisibilityDirective', () => {
  it('uses one scroll root and distinguishes visible cards from near-viewport prefetch', async () => {
    await TestBed.configureTestingModule({}).compileComponents();
    const original = globalThis.IntersectionObserver;
    let callback: IntersectionObserverCallback | undefined;
    let observerCount = 0;
    let options: IntersectionObserverInit | undefined;
    class FakeIntersectionObserver {
      constructor(next: IntersectionObserverCallback, init?: IntersectionObserverInit) { callback = next; options = init; observerCount += 1; }
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      root: Element | Document | null = null;
      rootMargin = '';
      thresholds: readonly number[] = [];
    }
    Object.assign(globalThis, { IntersectionObserver: FakeIntersectionObserver });
    try {
      const root = document.createElement('div'); root.className = 'results';
      Object.defineProperty(root, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, right: 100, bottom: 100 }) });
      const host = document.createElement('div'); root.append(host);
      const secondHost = document.createElement('div'); root.append(secondHost);
      const directive = runInInjectionContext(TestBed.inject(EnvironmentInjector), () => new ThumbnailVisibilityDirective(new ElementRef(host)));
      const second = runInInjectionContext(TestBed.inject(EnvironmentInjector), () => new ThumbnailVisibilityDirective(new ElementRef(secondHost)));
      const priorities: string[] = [];
      directive.thumbnailVisible.subscribe((event) => priorities.push(event.priority));
      second.thumbnailVisible.subscribe((event) => priorities.push(event.priority));
      directive.ngAfterViewInit();
      second.ngAfterViewInit();
      callback?.([
        { target: host, isIntersecting: true, boundingClientRect: { top: 20, left: 0, right: 10, bottom: 40 } } as unknown as IntersectionObserverEntry,
        { target: secondHost, isIntersecting: true, boundingClientRect: { top: 140, left: 0, right: 10, bottom: 160 } } as unknown as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      expect(options?.root).toBe(root);
      expect(options?.rootMargin).toBe('160px 0px');
      expect(observerCount).toBe(1);
      expect(priorities).toEqual(['visible', 'prefetch']);
      directive.ngOnDestroy();
      second.ngOnDestroy();
    } finally {
      Object.assign(globalThis, { IntersectionObserver: original });
    }
  });
});

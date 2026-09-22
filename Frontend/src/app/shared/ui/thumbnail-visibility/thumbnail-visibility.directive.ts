import { AfterViewInit, Directive, ElementRef, OnDestroy, output } from '@angular/core';
import type { ThumbnailTaskPriority } from '../../../core/assets/vanilla/thumbnail-task-queue';

export interface VisibilityEvent { readonly priority: ThumbnailTaskPriority; }

interface SharedObserverState {
  readonly observer: IntersectionObserver;
  readonly directives: Map<Element, ThumbnailVisibilityDirective>;
}

@Directive({ selector: '[thumbnailVisibility]', standalone: true })
export class ThumbnailVisibilityDirective implements AfterViewInit, OnDestroy {
  private static readonly sharedObservers = new WeakMap<Element, SharedObserverState>();
  readonly thumbnailVisible = output<VisibilityEvent>();
  private root?: Element;
  private shared?: SharedObserverState;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const element = this.host.nativeElement;
    this.root = element.closest('.results') ?? undefined;
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => this.thumbnailVisible.emit({ priority: 'visible' }));
      return;
    }
    const root = this.root ?? document.documentElement;
    let shared = ThumbnailVisibilityDirective.sharedObservers.get(root);
    if (!shared) {
      const directives = new Map<Element, ThumbnailVisibilityDirective>();
      const observer = new IntersectionObserver((entries) => { for (const entry of entries) directives.get(entry.target)?.handleEntry(entry); }, { root, rootMargin: '160px 0px' });
      shared = { observer, directives };
      ThumbnailVisibilityDirective.sharedObservers.set(root, shared);
    }
    this.shared = shared;
    shared.directives.set(element, this);
    shared.observer.observe(element);
  }

  private handleEntry(entry: IntersectionObserverEntry): void {
    if (!entry.isIntersecting) return;
    const rootRect = this.root?.getBoundingClientRect();
    const rect = entry.boundingClientRect;
    const visible = !rootRect || (rect.bottom > rootRect.top && rect.top < rootRect.bottom && rect.right > rootRect.left && rect.left < rootRect.right);
    this.thumbnailVisible.emit({ priority: visible ? 'visible' : 'prefetch' });
  }

  ngOnDestroy(): void {
    const element = this.host.nativeElement;
    if (!this.shared) return;
    this.shared.observer.unobserve(element);
    this.shared.directives.delete(element);
    if (!this.shared.directives.size && this.root) {
      this.shared.observer.disconnect();
      ThumbnailVisibilityDirective.sharedObservers.delete(this.root);
    }
    this.shared = undefined;
  }
}

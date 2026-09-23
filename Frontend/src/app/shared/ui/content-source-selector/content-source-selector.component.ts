import { Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight, LucidePlus } from '@lucide/angular';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../tooltip/ui-tooltip.directive';

export interface ContentSourceOption {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
  readonly tooltip?: string;
}

export interface HorizontalScrollState {
  readonly canScrollLeft: boolean;
  readonly canScrollRight: boolean;
}

export function horizontalScrollState(scrollLeft: number, clientWidth: number, scrollWidth: number): HorizontalScrollState {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const position = Math.min(maxScrollLeft, Math.max(0, Number.isFinite(scrollLeft) ? scrollLeft : 0));
  return { canScrollLeft: position > 1, canScrollRight: position < maxScrollLeft - 1 };
}

export function horizontalScrollTarget(scrollLeft: number, clientWidth: number, scrollWidth: number, direction: 'left' | 'right'): number {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const distance = Math.max(96, Math.floor(Math.max(0, clientWidth) * .8));
  return Math.min(maxScrollLeft, Math.max(0, scrollLeft + (direction === 'right' ? distance : -distance)));
}

export function shouldConsumeHorizontalWheel(deltaX: number, deltaY: number, scrollLeft: number, clientWidth: number, scrollWidth: number): boolean {
  const delta = Math.abs(deltaX) > 0 ? deltaX : deltaY;
  if (!delta) return false;
  const state = horizontalScrollState(scrollLeft, clientWidth, scrollWidth);
  return delta < 0 ? state.canScrollLeft : state.canScrollRight;
}

@Component({
  selector: 'app-content-source-selector',
  imports: [LucideChevronLeft, LucideChevronRight, LucidePlus, UiTooltipDirective],
  templateUrl: './content-source-selector.component.html',
  styleUrl: './content-source-selector.component.scss',
})
export class ContentSourceSelectorComponent {
  protected readonly i18n = inject(I18nService);
  readonly sources = input<readonly ContentSourceOption[]>([]);
  readonly selectedId = input<string | undefined>();
  readonly label = input('Content source');
  readonly manageLabel = input('Manage sources');
  readonly selectionChange = output<string>();
  readonly manageRequested = output<void>();
  protected readonly canScrollLeft = signal(false);
  protected readonly canScrollRight = signal(false);
  private readonly sourceOptions = viewChild<ElementRef<HTMLElement>>('sourceOptions');

  private readonly layoutEffect = effect((onCleanup) => {
    const host = this.sourceOptions()?.nativeElement;
    this.sources();
    this.selectedId();
    if (!host) return;
    const update = (): void => this.updateScrollState();
    update();
    queueMicrotask(() => this.revealSelected());
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });

  protected updateScrollState(): void {
    const host = this.sourceOptions()?.nativeElement;
    if (!host) return;
    const state = horizontalScrollState(host.scrollLeft, host.clientWidth, host.scrollWidth);
    this.canScrollLeft.set(state.canScrollLeft);
    this.canScrollRight.set(state.canScrollRight);
  }

  protected scrollSources(direction: 'left' | 'right'): void {
    const host = this.sourceOptions()?.nativeElement;
    if (!host) return;
    host.scrollLeft = horizontalScrollTarget(host.scrollLeft, host.clientWidth, host.scrollWidth, direction);
    this.updateScrollState();
  }

  protected onSourceWheel(event: WheelEvent): void {
    const host = this.sourceOptions()?.nativeElement;
    if (!host || !shouldConsumeHorizontalWheel(event.deltaX, event.deltaY, host.scrollLeft, host.clientWidth, host.scrollWidth)) return;
    const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
    const maxScrollLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    host.scrollLeft = Math.min(maxScrollLeft, Math.max(0, host.scrollLeft + delta));
    event.preventDefault();
    this.updateScrollState();
  }

  protected onSourceFocus(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('source-option')) return;
    target.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }

  protected revealSelected(): void {
    const selectedId = this.selectedId();
    const host = this.sourceOptions()?.nativeElement;
    if (!selectedId || !host) return;
    const selected = Array.from(host.querySelectorAll<HTMLElement>('.source-option')).find((button) => button.dataset['sourceId'] === selectedId);
    selected?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }
}

import { computed, signal } from '@angular/core';
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';

type Sidebar = 'left' | 'right';

/** Owns transient resize state and commits widths only at the interaction boundary. */
export class EditorSidebarResizeSession {
  private readonly leftWidth = signal<number | undefined>(undefined);
  private readonly rightWidth = signal<number | undefined>(undefined);
  private readonly viewportWidth = signal(0);
  private readonly viewportWidths = computed(() => {
    const preferences = this.layout.preferences();
    const total =
      this.viewportWidth() ||
      this.containerWidth() ||
      (typeof window === 'undefined' ? 1024 : window.innerWidth);
    if (total <= 850) return { left: undefined, right: undefined };

    let left = preferences.leftSidebarWidth;
    let right = preferences.rightSidebarWidth;
    if (preferences.leftSidebarVisible && preferences.rightSidebarVisible) {
      left = this.clampViewportWidth('left', left, total - right - 320);
      right = this.clampViewportWidth('right', right, total - left - 320);
    } else if (preferences.leftSidebarVisible) {
      left = this.clampViewportWidth('left', left, total - 320);
    } else if (preferences.rightSidebarVisible) {
      right = this.clampViewportWidth('right', right, total - 320);
    }

    return {
      left:
        preferences.leftSidebarVisible && left !== preferences.leftSidebarWidth ? left : undefined,
      right:
        preferences.rightSidebarVisible && right !== preferences.rightSidebarWidth
          ? right
          : undefined,
    };
  });
  private drag?: {
    readonly side: Sidebar;
    readonly pointerId: number;
    readonly startX: number;
    readonly origin: number;
    moved: boolean;
  };
  readonly gridTemplate = computed(() => {
    const preferences = this.layout.preferences();
    const left = this.effectiveWidth('left');
    const right = this.effectiveWidth('right');
    if (!preferences.leftSidebarVisible && !preferences.rightSidebarVisible)
      return 'minmax(0, 1fr)';
    if (!preferences.leftSidebarVisible) return `minmax(0, 1fr) ${right}px`;
    if (!preferences.rightSidebarVisible) return `${left}px minmax(0, 1fr)`;
    return `${left}px minmax(0, 1fr) ${right}px`;
  });

  constructor(
    private readonly layout: EditorLayoutPreferencesService,
    private readonly containerWidth: () => number,
  ) {}

  effectiveWidth(side: Sidebar): number {
    const transient = side === 'left' ? this.leftWidth() : this.rightWidth();
    const viewportWidth = this.viewportWidths()[side];
    const preferences = this.layout.preferences();
    return (
      transient ??
      viewportWidth ??
      (side === 'left' ? preferences.leftSidebarWidth : preferences.rightSidebarWidth)
    );
  }

  resizeRange(side: Sidebar): { min: number; max: number; value: number } {
    const min = side === 'left' ? 180 : 200;
    const preferences = this.layout.preferences();
    const otherSide: Sidebar = side === 'left' ? 'right' : 'left';
    const otherVisible =
      otherSide === 'left' ? preferences.leftSidebarVisible : preferences.rightSidebarVisible;
    const total =
      this.containerWidth() || (typeof window === 'undefined' ? 1024 : window.innerWidth);
    const max = Math.min(
      520,
      Math.max(min, total - (otherVisible ? this.effectiveWidth(otherSide) : 0) - 320),
    );
    return { min, max, value: this.effectiveWidth(side) };
  }

  begin(side: Sidebar, event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.drag = {
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      origin: this.effectiveWidth(side),
      moved: false,
    };
  }

  move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = drag.side === 'left' ? event.clientX - drag.startX : drag.startX - event.clientX;
    const width = this.clamp(drag.side, drag.origin + delta);
    this.widthSignal(drag.side).set(width);
    drag.moved = width !== drag.origin;
  }

  end(event?: PointerEvent): void {
    const drag = this.drag;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    if (drag.moved) this.layout.setSidebarWidth(drag.side, this.effectiveWidth(drag.side));
    this.widthSignal(drag.side).set(undefined);
    this.drag = undefined;
    this.clampToViewport();
  }

  adjust(side: Sidebar, event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction =
      side === 'left' ? (event.key === 'ArrowRight' ? 1 : -1) : event.key === 'ArrowLeft' ? 1 : -1;
    this.layout.setSidebarWidth(side, this.clamp(side, this.effectiveWidth(side) + direction * 16));
    this.clampToViewport();
  }

  clampToViewport(): void {
    this.viewportWidth.set(
      this.containerWidth() || (typeof window === 'undefined' ? 1024 : window.innerWidth),
    );
  }

  reset(): void {
    this.drag = undefined;
    this.leftWidth.set(undefined);
    this.rightWidth.set(undefined);
  }

  private widthSignal(side: Sidebar) {
    return side === 'left' ? this.leftWidth : this.rightWidth;
  }

  private clampViewportWidth(side: Sidebar, width: number, maximum: number): number {
    const minimum = side === 'left' ? 180 : 200;
    const upperBound = Math.min(520, Math.max(minimum, maximum));
    return Math.round(Math.min(upperBound, Math.max(minimum, width)));
  }

  private clamp(side: Sidebar, width: number): number {
    const { min, max } = this.resizeRange(side);
    return Math.round(Math.min(max, Math.max(min, width)));
  }
}

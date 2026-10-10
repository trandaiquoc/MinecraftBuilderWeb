import { computed, signal } from '@angular/core';
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';

type Sidebar = 'left' | 'right';

/** Owns transient resize state and commits widths only at the interaction boundary. */
export class EditorSidebarResizeSession {
  private readonly leftWidth = signal<number | undefined>(undefined);
  private readonly rightWidth = signal<number | undefined>(undefined);
  private drag?: {
    readonly side: Sidebar;
    readonly pointerId: number;
    readonly startX: number;
    readonly origin: number;
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
    const preferences = this.layout.preferences();
    return (
      transient ?? (side === 'left' ? preferences.leftSidebarWidth : preferences.rightSidebarWidth)
    );
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
    };
  }

  move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = drag.side === 'left' ? event.clientX - drag.startX : drag.startX - event.clientX;
    this.widthSignal(drag.side).set(this.clamp(drag.side, drag.origin + delta));
  }

  end(event?: PointerEvent): void {
    const drag = this.drag;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    this.layout.setSidebarWidth(drag.side, this.effectiveWidth(drag.side));
    this.widthSignal(drag.side).set(undefined);
    this.drag = undefined;
  }

  adjust(side: Sidebar, event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction =
      side === 'left' ? (event.key === 'ArrowRight' ? 1 : -1) : event.key === 'ArrowLeft' ? 1 : -1;
    this.layout.setSidebarWidth(side, this.clamp(side, this.effectiveWidth(side) + direction * 16));
  }

  clampToViewport(): void {
    const preferences = this.layout.preferences();
    for (const side of ['left', 'right'] as const) {
      const current =
        side === 'left' ? preferences.leftSidebarWidth : preferences.rightSidebarWidth;
      const clamped = this.clamp(side, current);
      if (clamped !== current) this.layout.setSidebarWidth(side, clamped);
    }
  }

  reset(): void {
    this.drag = undefined;
    this.leftWidth.set(undefined);
    this.rightWidth.set(undefined);
  }

  private widthSignal(side: Sidebar) {
    return side === 'left' ? this.leftWidth : this.rightWidth;
  }

  private clamp(side: Sidebar, width: number): number {
    const preferences = this.layout.preferences();
    const total =
      this.containerWidth() || (typeof window === 'undefined' ? 1024 : window.innerWidth);
    const minimum = side === 'left' ? 180 : 200;
    const otherSide: Sidebar = side === 'left' ? 'right' : 'left';
    const otherVisible =
      otherSide === 'left' ? preferences.leftSidebarVisible : preferences.rightSidebarVisible;
    const maximum = Math.min(
      520,
      Math.max(minimum, total - (otherVisible ? this.effectiveWidth(otherSide) : 0) - 320),
    );
    return Math.round(Math.min(maximum, Math.max(minimum, width)));
  }
}

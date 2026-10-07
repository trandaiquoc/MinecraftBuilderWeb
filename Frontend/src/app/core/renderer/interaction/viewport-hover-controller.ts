export interface HoverPointerRequest<T> {
  readonly clientX: number;
  readonly clientY: number;
  readonly project: unknown;
  readonly active: unknown;
  readonly planeY: number | undefined;
  readonly showGhost: boolean;
  readonly listener: (hit: T) => void;
}

export interface ViewportHoverControllerCallbacks<T> {
  readonly isSuspended: () => boolean;
  readonly cameraGestureInProgress: () => boolean;
  readonly record: (name: 'hoverRaycasts' | 'hoverPointerMovesCoalesced' | 'hoverRaycastsSuppressedDuringCamera') => void;
  readonly hit: (request: HoverPointerRequest<T>) => T;
}

/** Coalesces hover pointer work without owning renderer or ghost state. */
export class ViewportHoverController<T> {
  private frame?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: HoverPointerRequest<T>;

  constructor(private readonly callbacks: ViewportHoverControllerCallbacks<T>) {}

  hover(request: HoverPointerRequest<T>): void {
    if (this.callbacks.isSuspended()) return;
    if (this.callbacks.cameraGestureInProgress()) { this.callbacks.record('hoverRaycastsSuppressedDuringCamera'); return; }
    if (this.pending) this.callbacks.record('hoverPointerMovesCoalesced');
    this.pending = request;
    if (this.frame !== undefined || this.timer !== undefined) return;
    const run = () => {
      this.frame = undefined; this.timer = undefined;
      const next = this.pending; this.pending = undefined;
      if (!next || this.callbacks.cameraGestureInProgress()) { if (next) this.callbacks.record('hoverRaycastsSuppressedDuringCamera'); return; }
      this.callbacks.record('hoverRaycasts');
      next.listener(this.callbacks.hit(next));
    };
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(run);
    else this.timer = setTimeout(run, 0);
  }

  cancel(countAsSuppressed: boolean): void {
    if (this.frame !== undefined && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(this.frame); this.frame = undefined; }
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; }
    if (countAsSuppressed && this.pending) this.callbacks.record('hoverRaycastsSuppressedDuringCamera');
    this.pending = undefined;
  }
}

export interface ViewportHostLifecycleHandlers {
  readonly onResize: () => void;
  readonly onPointerDownCapture: (event: PointerEvent) => void;
  readonly onPointerUpCapture: (event: PointerEvent) => void;
  readonly onWheelCapture: (event: WheelEvent) => void;
  readonly onWindowBlur: () => void;
  readonly onVisibilityChange: () => void;
}

/** Owns DOM listeners that bind a viewport canvas to its host element. */
export class ViewportHostLifecycleAdapter {
  private container?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private resizeObserver?: ResizeObserver;
  private mounted = false;

  constructor(private readonly handlers: ViewportHostLifecycleHandlers) {}

  mount(container: HTMLElement, canvas: HTMLCanvasElement): void {
    if (this.mounted && this.container === container && this.canvas === canvas) return;
    this.dispose();
    this.container = container;
    this.canvas = canvas;
    container.appendChild(canvas);
    canvas.addEventListener('pointerdown', this.handlers.onPointerDownCapture, true);
    canvas.addEventListener('pointerup', this.handlers.onPointerUpCapture, true);
    canvas.addEventListener('pointercancel', this.handlers.onPointerUpCapture, true);
    canvas.addEventListener('wheel', this.handlers.onWheelCapture, { capture: true, passive: false });
    if (typeof document !== 'undefined') {
      document.addEventListener('focusin', this.handlers.onWindowBlur);
      document.addEventListener('visibilitychange', this.handlers.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.addEventListener('blur', this.handlers.onWindowBlur);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handlers.onResize);
      this.resizeObserver.observe(container);
    }
    this.mounted = true;
  }

  dispose(): void {
    if (!this.mounted && !this.canvas && !this.container) return;
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlers.onPointerDownCapture, true);
      canvas.removeEventListener('pointerup', this.handlers.onPointerUpCapture, true);
      canvas.removeEventListener('pointercancel', this.handlers.onPointerUpCapture, true);
      canvas.removeEventListener('wheel', this.handlers.onWheelCapture, true);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('focusin', this.handlers.onWindowBlur);
      document.removeEventListener('visibilitychange', this.handlers.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.handlers.onWindowBlur);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.mounted = false;
    this.canvas = undefined;
    this.container = undefined;
  }

  get hostContainer(): HTMLElement | undefined { return this.container; }
  get isMounted(): boolean { return this.mounted; }
}

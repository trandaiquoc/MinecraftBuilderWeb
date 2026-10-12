export interface RenderSchedulerCallbacks {
  readonly onInvalidation?: () => void;
  readonly onCoalesced?: () => void;
}

export type RenderFrameRequest = (callback: FrameRequestCallback) => number;
export type RenderFrameCancel = (handle: number) => void;

/** Demand-render scheduler. It knows nothing about Three.js or project state. */
export class RenderScheduler {
  private pending = false;
  private frame?: number;

  constructor(
    private readonly requestFrame: RenderFrameRequest,
    private readonly cancelFrame: RenderFrameCancel,
    private readonly callbacks: RenderSchedulerCallbacks = {},
  ) {}

  request(render: () => void): void {
    this.callbacks.onInvalidation?.();
    if (this.pending) {
      this.callbacks.onCoalesced?.();
      return;
    }
    this.pending = true;
    this.frame = this.requestFrame(() => {
      this.pending = false;
      this.frame = undefined;
      render();
    });
  }

  cancel(): void {
    if (this.frame === undefined) return;
    this.cancelFrame(this.frame);
    this.frame = undefined;
    this.pending = false;
  }

  dispose(): void {
    this.cancel();
  }

  get scheduled(): boolean {
    return this.pending;
  }
}

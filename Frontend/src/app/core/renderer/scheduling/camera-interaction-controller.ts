export interface CameraInteractionControllerOptions {
  readonly idleGraceMs: number;
  readonly now?: () => number;
}

/** Tracks interaction state used by camera/render/hydration policies. Camera math stays in the engine. */
export class CameraInteractionController {
  readonly pressedActions = new Set<string>();
  private gesture = false;
  private interactingUntil = 0;
  private readonly now: () => number;

  constructor(private readonly options: CameraInteractionControllerOptions) {
    this.now = options.now ?? (() => performance.now());
  }

  beginGesture(): void {
    this.gesture = true;
    this.mark();
  }

  endGesture(): void {
    this.gesture = false;
    this.mark();
  }

  press(action: string): void {
    this.pressedActions.add(action);
    this.mark();
  }

  release(action: string): void {
    this.pressedActions.delete(action);
    this.mark();
  }

  mark(): number {
    this.interactingUntil = Math.max(this.interactingUntil, this.now() + this.options.idleGraceMs);
    return this.interactingUntil;
  }

  isActive(): boolean {
    return this.gesture || this.pressedActions.size > 0 || this.now() < this.interactingUntil;
  }

  clear(): void {
    this.cancelAll();
  }

  /** Immediately cancels every interaction source, including idle grace. */
  cancelAll(): void {
    this.pressedActions.clear();
    this.gesture = false;
    this.interactingUntil = 0;
  }

  get gestureInProgress(): boolean {
    return this.gesture;
  }

  get idleUntil(): number {
    return this.interactingUntil;
  }
}

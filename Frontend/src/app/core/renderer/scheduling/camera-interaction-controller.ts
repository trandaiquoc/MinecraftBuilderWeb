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
  }

  endGesture(): void {
    this.gesture = false;
  }

  press(action: string): void {
    this.pressedActions.add(action);
    this.mark();
  }

  release(action: string): void {
    this.pressedActions.delete(action);
  }

  mark(): number {
    this.interactingUntil = this.now() + this.options.idleGraceMs;
    return this.interactingUntil;
  }

  isActive(): boolean {
    return this.gesture || this.pressedActions.size > 0 || this.now() < this.interactingUntil;
  }

  clear(): void {
    this.pressedActions.clear();
    this.gesture = false;
  }

  get gestureInProgress(): boolean {
    return this.gesture;
  }

  get idleUntil(): number {
    return this.interactingUntil;
  }
}

export interface CameraInteractionControllerOptions {
  readonly idleGraceMs: number;
  readonly now?: () => number;
}

/** Tracks interaction state used by camera/render/hydration policies. Camera math stays in the engine. */
export class CameraInteractionController<Action extends string = string> {
  private readonly pressed = new Set<Action>();
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

  get pressedActions(): ReadonlySet<Action> {
    return this.pressed;
  }

  press(action: Action): void {
    this.pressed.add(action);
    this.mark();
  }

  release(action: Action): void {
    this.pressed.delete(action);
  }

  mark(): number {
    this.interactingUntil = this.now() + this.options.idleGraceMs;
    return this.interactingUntil;
  }

  isActive(): boolean {
    return this.gesture || this.pressed.size > 0 || this.now() < this.interactingUntil;
  }

  clear(): void {
    this.pressed.clear();
    this.gesture = false;
  }

  get gestureInProgress(): boolean {
    return this.gesture;
  }

  get idleUntil(): number {
    return this.interactingUntil;
  }
}

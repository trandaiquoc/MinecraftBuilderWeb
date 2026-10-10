import type { MovementAction } from './keyboard-bindings';
import { MovementKeyOwnership } from './keyboard-bindings';

export const AMBIGUOUS_RELEASE_GRACE_MS = 150;

export interface EditorMovementInputCallbacks {
  readonly movementDown: (action: MovementAction) => void;
  readonly movementUp: (action: MovementAction) => void;
  readonly clearMovement: () => void;
}

export class EditorMovementInputSession {
  private readonly ownership = new MovementKeyOwnership();
  private streamState: 'synchronized' | 'uncertain' = 'synchronized';
  private ambiguousReleaseTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly callbacks: EditorMovementInputCallbacks) {}

  keyDown(action: MovementAction, physicalKey: string | undefined): void {
    if (!physicalKey) {
      this.streamState = 'uncertain';
      this.ownership.clear();
      this.callbacks.clearMovement();
      return;
    }

    this.cancelAmbiguousRelease();
    const previous = this.ownership.actionFor(physicalKey);
    if (previous === action) return;
    if (previous) this.release(physicalKey, previous);
    const alreadyHeld = this.ownership.hasAction(action);
    this.ownership.press(physicalKey, action);
    this.streamState = 'synchronized';
    if (!alreadyHeld) this.callbacks.movementDown(action);
  }

  keyUp(physicalKey: string | undefined): void {
    if (!physicalKey) {
      this.scheduleAmbiguousRelease();
      return;
    }
    this.cancelAmbiguousRelease();
    this.streamState = 'synchronized';
    const action = this.ownership.actionFor(physicalKey);
    if (action) this.release(physicalKey, action);
  }

  shouldSuppressDestructiveAction(): boolean {
    return this.streamState === 'uncertain' || this.ownership.ownerCount() > 0;
  }

  ownerCount(): number {
    return this.ownership.ownerCount();
  }

  clear(): void {
    this.cancelAmbiguousRelease();
    this.ownership.clear();
    this.callbacks.clearMovement();
    this.streamState = 'synchronized';
  }

  dispose(): void {
    this.clear();
  }

  private release(owner: string, action: MovementAction): void {
    this.ownership.release(owner);
    if (!this.ownership.hasAction(action)) this.callbacks.movementUp(action);
  }

  private scheduleAmbiguousRelease(): void {
    this.streamState = 'uncertain';
    this.cancelAmbiguousRelease();
    this.ambiguousReleaseTimer = setTimeout(() => {
      this.ambiguousReleaseTimer = undefined;
      if (this.ownership.ownerCount() > 0) this.clear();
      else this.streamState = 'synchronized';
    }, AMBIGUOUS_RELEASE_GRACE_MS);
  }

  private cancelAmbiguousRelease(): void {
    if (this.ambiguousReleaseTimer === undefined) return;
    clearTimeout(this.ambiguousReleaseTimer);
    this.ambiguousReleaseTimer = undefined;
  }
}

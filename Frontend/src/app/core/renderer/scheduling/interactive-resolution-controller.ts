export interface PixelRatioTarget {
  readonly staticRatio: number;
  readonly interactiveRatio: number;
}

export interface InteractiveResolutionRestoreOptions {
  readonly interactionUntil: number;
  readonly isInteractionActive: () => boolean;
  readonly applyStatic: () => void;
  readonly onRestored: () => void;
}

/** Owns the temporary low-resolution policy used while the camera is moving. */
export class InteractiveResolutionController {
  private restoreTimer?: ReturnType<typeof setTimeout>;
  private active = false;

  enter(target: PixelRatioTarget, applyInteractive: () => void, onEntered: () => void): boolean {
    if (this.active || target.staticRatio <= target.interactiveRatio) return false;
    this.active = true;
    applyInteractive();
    onEntered();
    return true;
  }

  scheduleRestore(options: InteractiveResolutionRestoreOptions): void {
    if (!this.active) return;
    if (this.restoreTimer !== undefined) clearTimeout(this.restoreTimer);
    const delay = Math.max(0, options.interactionUntil - performance.now());
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = undefined;
      if (options.isInteractionActive()) {
        this.scheduleRestore(options);
        return;
      }
      this.active = false;
      options.applyStatic();
      options.onRestored();
    }, delay);
  }

  /** Keeps the controller compatible with an existing owner that persisted the active bit. */
  markActive(): void {
    this.active = true;
  }

  cancel(): void {
    if (this.restoreTimer !== undefined) clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
  }

  dispose(): void {
    this.cancel();
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }
}

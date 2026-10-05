export interface HydrationTerminalConditions {
  readonly generationStable: boolean;
  readonly regularQueued: number;
  readonly providerRefreshQueued: number;
  readonly regularRunning: number;
  readonly providerRefreshRunning: number;
  readonly terrainPending: number;
  readonly fluidPending: number;
  readonly ownershipComplete: boolean;
}
export function canReconcileHydrationTerminal(conditions: HydrationTerminalConditions): boolean {
  return conditions.generationStable
    && conditions.regularQueued === 0
    && conditions.providerRefreshQueued === 0
    && conditions.regularRunning === 0
    && conditions.providerRefreshRunning === 0
    && conditions.terrainPending === 0
    && conditions.fluidPending === 0
    && conditions.ownershipComplete;
}

/** A one-shot, resettable watchdog. It never decides readiness by itself. */
export class HydrationTerminalReconciler {
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly delayMs = 5000, private readonly onCheck: () => void = () => undefined) {}

  arm(): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.onCheck();
    }, this.delayMs);
  }

  reset(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  dispose(): void { this.reset(); }
}

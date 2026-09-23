export async function yieldToBrowser(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Keeps long synchronous catalog loops within a small frame-friendly slice. */
export class CooperativeWorkBudget {
  private startedAt = performance.now();

  constructor(private readonly maxMilliseconds = 10, private readonly maxItems = 32) {}

  shouldYield(processedItems: number): boolean {
    return processedItems >= this.maxItems || performance.now() - this.startedAt >= this.maxMilliseconds;
  }

  reset(): void { this.startedAt = performance.now(); }
}

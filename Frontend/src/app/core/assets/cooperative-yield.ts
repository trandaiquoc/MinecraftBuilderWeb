export async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const schedulerApi = (
    globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler;
  if (schedulerApi?.yield) {
    await schedulerApi.yield();
    signal?.throwIfAborted();
    return;
  }
  await new Promise<void>((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(0);
      return;
    }
    setTimeout(resolve, 0);
  });
  signal?.throwIfAborted();
}

/** Keeps long synchronous catalog loops within a small frame-friendly slice. */
export class CooperativeWorkBudget {
  private startedAt = performance.now();
  private processedSinceReset = 0;

  constructor(
    private readonly maxMilliseconds = 10,
    private readonly maxItems = 32,
  ) {}

  shouldYield(processedItems: number): boolean {
    return (
      processedItems >= this.maxItems || performance.now() - this.startedAt >= this.maxMilliseconds
    );
  }

  shouldYieldNow(items = 1): boolean {
    this.processedSinceReset += items;
    return this.shouldYield(this.processedSinceReset);
  }

  reset(): void {
    this.startedAt = performance.now();
    this.processedSinceReset = 0;
  }
}

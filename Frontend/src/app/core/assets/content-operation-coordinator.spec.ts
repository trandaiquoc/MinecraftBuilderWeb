import { describe, expect, it } from 'vitest';
import { ContentOperationCoordinator } from './content-operation-coordinator';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ContentOperationCoordinator', () => {
  it('preempts background work before foreground work writes', async () => {
    const coordinator = new ContentOperationCoordinator();
    let backgroundAborted = false;
    let releaseBackground!: () => void;
    const background = coordinator.run('background', async (signal) => {
      await new Promise<void>((resolve) => {
        releaseBackground = resolve;
      });
      backgroundAborted = signal.aborted;
    });
    await Promise.resolve();
    let foregroundStarted = false;
    const foreground = coordinator.run('foreground', async () => {
      foregroundStarted = true;
      return 'done';
    });
    await Promise.resolve();
    expect(foregroundStarted).toBe(false);
    releaseBackground();
    await expect(background).resolves.toBeUndefined();
    await expect(foreground).resolves.toBe('done');
    expect(backgroundAborted).toBe(true);
  });

  it('does not leave a writer active after completion', async () => {
    const coordinator = new ContentOperationCoordinator();
    await coordinator.run('foreground', async () => 'ok');
    expect(coordinator.isBusy()).toBe(false);
  });

  it('waits for foreground work instead of aborting it when background work starts', async () => {
    const coordinator = new ContentOperationCoordinator();
    let releaseForeground!: () => void;
    let foregroundAborted = false;
    const foreground = coordinator.run('foreground', async (signal) => {
      await new Promise<void>((resolve) => {
        releaseForeground = resolve;
      });
      foregroundAborted = signal.aborted;
      return 'foreground';
    });
    await Promise.resolve();
    let backgroundStarted = false;
    const background = coordinator.run('background', async () => {
      backgroundStarted = true;
      return 'background';
    });
    await Promise.resolve();
    expect(backgroundStarted).toBe(false);
    expect(foregroundAborted).toBe(false);
    releaseForeground();
    await expect(foreground).resolves.toBe('foreground');
    await expect(background).resolves.toBe('background');
    expect(backgroundStarted).toBe(true);
  });

  it('runs three queued writers one at a time in FIFO order', async () => {
    const coordinator = new ContentOperationCoordinator();
    const releaseForeground = deferred();
    const releaseFirstBackground = deferred();
    const releaseSecondBackground = deferred();
    const firstBackgroundStarted = deferred();
    const secondBackgroundStarted = deferred();
    const started: string[] = [];

    const foreground = coordinator.run('foreground', async () => releaseForeground.promise);
    const firstBackground = coordinator.run('background', async () => {
      started.push('first-background');
      firstBackgroundStarted.resolve();
      await releaseFirstBackground.promise;
    });
    const secondBackground = coordinator.run('background', async () => {
      started.push('second-background');
      secondBackgroundStarted.resolve();
      await releaseSecondBackground.promise;
    });

    const busyWhileQueued = coordinator.isBusy();
    releaseForeground.resolve();
    await foreground;
    await firstBackgroundStarted.promise;
    const firstWasExclusive = started.length === 1;
    const busyDuringFirstBackground = coordinator.isBusy();

    releaseFirstBackground.resolve();
    await firstBackground;
    await secondBackgroundStarted.promise;
    const startedInFifoOrder = started.join(',') === 'first-background,second-background';
    releaseSecondBackground.resolve();
    await secondBackground;

    expect(busyWhileQueued).toBe(true);
    expect(firstWasExclusive).toBe(true);
    expect(busyDuringFirstBackground).toBe(true);
    expect(startedInFifoOrder).toBe(true);
    expect(coordinator.isBusy()).toBe(false);
  });

  it('prioritizes queued foreground writers while preserving FIFO within each priority', async () => {
    const coordinator = new ContentOperationCoordinator();
    const releaseActive = deferred();
    const started: string[] = [];
    const active = coordinator.run('background', async () => releaseActive.promise);
    const backgroundFirst = coordinator.run('background', async () => {
      started.push('background-first');
    });
    const foregroundFirst = coordinator.run('foreground', async () => {
      started.push('foreground-first');
    });
    const backgroundSecond = coordinator.run('background', async () => {
      started.push('background-second');
    });
    const foregroundSecond = coordinator.run('foreground', async () => {
      started.push('foreground-second');
    });

    releaseActive.resolve();
    await Promise.all([
      active,
      foregroundFirst,
      foregroundSecond,
      backgroundFirst,
      backgroundSecond,
    ]);
    expect(started).toEqual([
      'foreground-first',
      'foreground-second',
      'background-first',
      'background-second',
    ]);
  });

  it('rejects a caller-cancelled waiting writer without executing it', async () => {
    const coordinator = new ContentOperationCoordinator();
    const releaseActive = deferred();
    const caller = new AbortController();
    const reason = new DOMException('No longer needed', 'AbortError');
    let waitingWriterStarted = false;
    const active = coordinator.run('foreground', async () => releaseActive.promise);
    const waiting = coordinator.run(
      'background',
      async () => {
        waitingWriterStarted = true;
      },
      caller.signal,
    );

    let rejectionReason: unknown;
    const waitingOutcome = waiting.then(
      () => undefined,
      (error: unknown) => {
        rejectionReason = error;
      },
    );
    caller.abort(reason);
    await Promise.resolve();
    const rejectedBeforeActiveFinished = rejectionReason === reason;

    releaseActive.resolve();
    await active;
    await waitingOutcome;

    expect(rejectedBeforeActiveFinished).toBe(true);
    expect(waitingWriterStarted).toBe(false);
    expect(coordinator.isBusy()).toBe(false);
  });

  it('keeps a cancelled running writer exclusive until its work settles', async () => {
    const coordinator = new ContentOperationCoordinator();
    const releaseActive = deferred();
    const caller = new AbortController();
    let activeSignal: AbortSignal | undefined;
    let nextWriterStarted = false;
    const active = coordinator.run(
      'foreground',
      async (signal) => {
        activeSignal = signal;
        await releaseActive.promise;
        return signal.aborted;
      },
      caller.signal,
    );
    const next = coordinator.run('background', async () => {
      nextWriterStarted = true;
    });

    caller.abort();
    expect(activeSignal?.aborted).toBe(true);
    expect(nextWriterStarted).toBe(false);
    expect(coordinator.isBusy()).toBe(true);

    releaseActive.resolve();
    await expect(active).resolves.toBe(true);
    await next;
    expect(nextWriterStarted).toBe(true);
    expect(coordinator.isBusy()).toBe(false);
  });

  it('propagates a synchronous work failure and starts the next writer', async () => {
    const coordinator = new ContentOperationCoordinator();
    const failure = new Error('source preparation failed');
    let nextWriterStarted = false;
    const failed = coordinator.run('foreground', () => {
      throw failure;
    });
    const next = coordinator.run('background', async () => {
      nextWriterStarted = true;
    });

    await expect(failed).rejects.toBe(failure);
    await next;
    expect(nextWriterStarted).toBe(true);
    expect(coordinator.isBusy()).toBe(false);
  });

  it('propagates an asynchronous rejection and releases ownership for the next writer', async () => {
    const coordinator = new ContentOperationCoordinator();
    const failure = new Error('provider publication failed');
    let nextWriterStarted = false;
    const failed = coordinator.run('foreground', async () => {
      throw failure;
    });
    const next = coordinator.run('background', async () => {
      nextWriterStarted = true;
    });

    await expect(failed).rejects.toBe(failure);
    await next;
    expect(nextWriterStarted).toBe(true);
    expect(coordinator.isBusy()).toBe(false);
  });

  it('does not run work when the caller was already cancelled', async () => {
    const coordinator = new ContentOperationCoordinator();
    const caller = new AbortController();
    const reason = new DOMException('Cancelled before enqueue', 'AbortError');
    let writerStarted = false;
    caller.abort(reason);

    await expect(
      coordinator.run(
        'foreground',
        async () => {
          writerStarted = true;
        },
        caller.signal,
      ),
    ).rejects.toBe(reason);
    expect(writerStarted).toBe(false);
    expect(coordinator.isBusy()).toBe(false);
  });
});

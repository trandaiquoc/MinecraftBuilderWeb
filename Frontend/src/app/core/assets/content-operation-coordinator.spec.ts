import { describe, expect, it } from 'vitest';
import { ContentOperationCoordinator } from './content-operation-coordinator';

describe('ContentOperationCoordinator', () => {
  it('preempts background work before foreground work writes', async () => {
    const coordinator = new ContentOperationCoordinator();
    let backgroundAborted = false;
    let releaseBackground!: () => void;
    const background = coordinator.run('background', async (signal) => {
      await new Promise<void>((resolve) => { releaseBackground = resolve; });
      backgroundAborted = signal.aborted;
    });
    await Promise.resolve();
    let foregroundStarted = false;
    const foreground = coordinator.run('foreground', async () => { foregroundStarted = true; return 'done'; });
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
});

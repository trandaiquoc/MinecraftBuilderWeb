import { describe, expect, it } from 'vitest';
import { applyBeforeUnloadGuard } from './project-autosave.service';

describe('applyBeforeUnloadGuard', () => {
  it('leaves clean revisions unblocked', () => {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    applyBeforeUnloadGuard(event, false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('blocks unsafe dirty revisions', () => {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    applyBeforeUnloadGuard(event, true);
    expect(event.defaultPrevented).toBe(true);
  });
});

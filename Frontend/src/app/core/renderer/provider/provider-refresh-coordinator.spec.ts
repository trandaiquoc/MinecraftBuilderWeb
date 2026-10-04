import { describe, expect, it, vi } from 'vitest';
import { ProviderRefreshCoordinator } from './provider-refresh-coordinator';

function provider() { return { retain: vi.fn(), release: vi.fn() }; }

describe('ProviderRefreshCoordinator', () => {
  it('retains the replacement and releases the retired provider after handoff', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    expect(first.release).not.toHaveBeenCalled();
    coordinator.releaseUnused({ referenced: () => false, queued: () => false });
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.retain).toHaveBeenCalledTimes(1);
    expect(coordinator.generation).toBe(2);
  });

  it('keeps a retired provider while rendered or refresh work still references it', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    coordinator.releaseUnused({ referenced: () => true, queued: () => false });
    expect(first.release).not.toHaveBeenCalled();
    coordinator.releaseUnused({ referenced: () => false, queued: () => true });
    expect(first.release).not.toHaveBeenCalled();
  });

  it('does not retain a provider again when it is reactivated from retirement', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    coordinator.transition(second, first);
    expect(first.retain).toHaveBeenCalledTimes(1);
    expect(second.release).not.toHaveBeenCalled();
  });
});

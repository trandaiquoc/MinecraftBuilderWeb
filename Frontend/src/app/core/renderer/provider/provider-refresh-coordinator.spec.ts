import { describe, expect, it, vi } from 'vitest';
import { ProviderRefreshCoordinator } from './provider-refresh-coordinator';

function provider() {
  return { retain: vi.fn(), release: vi.fn() };
}

describe('ProviderRefreshCoordinator', () => {
  it('retains the replacement and releases the retired provider after handoff', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    expect(first.release).not.toHaveBeenCalled();
    coordinator.releaseUnused({ referenced: () => false });
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.retain).toHaveBeenCalledTimes(1);
    expect(coordinator.generation).toBe(2);
  });

  it('releases a retired provider once the authoritative owners report no references', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    coordinator.releaseUnused({ referenced: () => true });
    expect(first.release).not.toHaveBeenCalled();
    coordinator.releaseUnused({ referenced: () => false });
    expect(first.release).toHaveBeenCalledTimes(1);
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

  it('does not expose its mutable retirement set through a readonly view', () => {
    const first = provider();
    const second = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.transition(first, second);
    (coordinator.retiredProviders as Set<typeof first>).clear();
    expect(coordinator.hasRetired(first)).toBe(true);
  });

  it('keeps a retired provider through conditional disposal until async owners release it', () => {
    const first = provider();
    const coordinator = new ProviderRefreshCoordinator<typeof first>();
    coordinator.transition(undefined, first);
    coordinator.retire(first);
    coordinator.clear(() => true);
    expect(first.release).not.toHaveBeenCalled();
    coordinator.releaseUnused({ referenced: () => false });
    expect(first.release).toHaveBeenCalledOnce();
  });
});

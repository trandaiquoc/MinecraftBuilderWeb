import { describe, expect, it, vi } from 'vitest';
import { AssetActivityService } from '../asset-activity.service';
import { ContentOperationCoordinator } from '../content-operation-coordinator';
import { ContentSourceRegistry } from '../content-source/content-source-registry';
import { ExternalModContentLifecycle } from './external-mod-content-lifecycle';

function lifecycle(cache: Record<string, unknown> = {}) {
  const sources = new ContentSourceRegistry();
  const publication = { sources, activate: vi.fn(), commitRestored: vi.fn(), remove: vi.fn() };
  const activity = { update: vi.fn(), begin: vi.fn(), finish: vi.fn(), event: vi.fn(), fail: vi.fn(), protect: vi.fn(() => 1), releaseProtected: vi.fn() };
  const service = new ExternalModContentLifecycle(cache as never, activity as unknown as AssetActivityService, new ContentOperationCoordinator(), publication, () => '1.21.1');
  return { service, activity, publication };
}

describe('ExternalModContentLifecycle', () => {
  it('owns an empty restore result without claiming a vanilla load phase', async () => {
    const { service } = lifecycle({ loadExternalMods: vi.fn(async () => []) });
    const states: unknown[] = [];
    await expect(service.restore('1.21.1', undefined, (state) => states.push(state))).resolves.toEqual({ phase: 'ready', current: 0, total: 0, failed: 0 });
    expect(states).toEqual([{ phase: 'ready', current: 0, total: 0, failed: 0 }]);
    expect(service.isRestoring).toBe(false);
  });

  it('reports a cache read failure as partial while keeping the runtime usable', async () => {
    const { service } = lifecycle({ loadExternalMods: vi.fn(async () => { throw new Error('cache unavailable'); }) });
    await expect(service.restore('1.21.1')).resolves.toEqual({ phase: 'partial', current: 0, total: 0, failed: 1 });
    expect(service.isRestoring).toBe(false);
  });

  it('does not mutate the source registry or cache when removing an inactive source', async () => {
    const deleteExternalMod = vi.fn(async () => undefined);
    const { service, publication } = lifecycle({ deleteExternalMod });
    await service.remove('absent');
    expect(publication.remove).not.toHaveBeenCalled();
    expect(deleteExternalMod).not.toHaveBeenCalled();
  });
});

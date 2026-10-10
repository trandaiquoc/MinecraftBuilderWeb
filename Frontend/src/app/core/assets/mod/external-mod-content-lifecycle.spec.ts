import { describe, expect, it, vi } from 'vitest';
import { AssetActivityService } from '../asset-activity.service';
import { ContentOperationCoordinator } from '../content-operation-coordinator';
import { ContentSourceRegistry } from '../content-source/content-source-registry';
import type { PreparedContentSource } from '../content-source/content-source-registry';
import { ExternalModProvider } from './external-mod-provider';
import { ExternalModContentLifecycle } from './external-mod-content-lifecycle';

function lifecycle(cache: Record<string, unknown> = {}) {
  const sources = new ContentSourceRegistry();
  const publication = {
    sources,
    activate: vi.fn((provider: ExternalModProvider) => sources.register(provider)),
    commitRestored: vi.fn((prepared: readonly PreparedContentSource[]) =>
      sources.commitBatch(prepared),
    ),
    remove: vi.fn((sourceId: string) => sources.remove(sourceId)),
  };
  const activity = {
    update: vi.fn(),
    begin: vi.fn(),
    finish: vi.fn(),
    event: vi.fn(),
    fail: vi.fn(),
    protect: vi.fn(() => 1),
    releaseProtected: vi.fn(),
  };
  const service = new ExternalModContentLifecycle(
    cache as never,
    activity as unknown as AssetActivityService,
    new ContentOperationCoordinator(),
    publication,
    () => '1.21.1',
  );
  return { service, activity, publication };
}

describe('ExternalModContentLifecycle', () => {
  it('owns an empty restore result without claiming a vanilla load phase', async () => {
    const { service } = lifecycle({ loadExternalMods: vi.fn(async () => []) });
    const states: unknown[] = [];
    await expect(
      service.restore('1.21.1', undefined, (state) => states.push(state)),
    ).resolves.toEqual({ phase: 'ready', current: 0, total: 0, failed: 0 });
    expect(states).toEqual([{ phase: 'ready', current: 0, total: 0, failed: 0 }]);
    expect(service.isRestoring).toBe(false);
  });

  it('reports a cache read failure as partial while keeping the runtime usable', async () => {
    const { service } = lifecycle({
      loadExternalMods: vi.fn(async () => {
        throw new Error('cache unavailable');
      }),
    });
    await expect(service.restore('1.21.1')).resolves.toEqual({
      phase: 'partial',
      current: 0,
      total: 0,
      failed: 1,
    });
    expect(service.isRestoring).toBe(false);
  });

  it('does not mutate the source registry or cache when removing an inactive source', async () => {
    const deleteExternalMod = vi.fn(async () => undefined);
    const { service, publication } = lifecycle({ deleteExternalMod });
    await service.remove('absent');
    expect(publication.remove).not.toHaveBeenCalled();
    expect(deleteExternalMod).not.toHaveBeenCalled();
  });

  it('restores prepared external content, publishes its summary, and reports terminal state', async () => {
    const provider = ExternalModProvider.create({
      metadata: {
        id: 'restore-fixture',
        name: 'Restore Fixture',
        version: '1.0.0',
        depends: { minecraft: '1.21.x' },
      },
      json: new Map([
        [
          'assets/restore_fixture/blockstates/widget.json',
          { variants: { '': { model: 'restore_fixture:block/widget' } } },
        ],
      ]),
      resources: new Map(),
    });
    const { service, publication } = lifecycle({
      loadExternalMods: vi.fn(async () => [provider.serialize()]),
    });
    const states: string[] = [];

    await expect(
      service.restore('1.21.1', undefined, (state) => states.push(state.phase)),
    ).resolves.toMatchObject({ phase: 'ready', total: 1, failed: 0 });
    expect(publication.commitRestored).toHaveBeenCalledOnce();
    expect(service.importedMods()).toMatchObject([
      { sourceId: 'mod:restore-fixture', displayName: 'Restore Fixture' },
    ]);
    expect(states).toEqual(['restoring-mods', 'restoring-mods', 'ready']);
    expect(service.isRestoring).toBe(false);
  });

  it('removes active source publication and cached data through the same lifecycle', async () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'remove-fixture', version: '1.0.0' },
      json: new Map([
        [
          'assets/remove_fixture/blockstates/widget.json',
          { variants: { '': { model: 'remove_fixture:block/widget' } } },
        ],
      ]),
      resources: new Map(),
    });
    const deleteExternalMod = vi.fn(async () => undefined);
    const { service, publication } = lifecycle({ deleteExternalMod });
    publication.sources.register(provider);

    await service.remove(provider.source.id);
    expect(publication.remove).toHaveBeenCalledWith(provider.source.id);
    expect(publication.sources.providerForSource(provider.source.id)).toBeUndefined();
    expect(deleteExternalMod).toHaveBeenCalledWith(provider.source.id, expect.any(AbortSignal));
  });
});

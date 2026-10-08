import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import { ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { BlockHydrationJob, HydratedBlockVisualResult } from './block-representation-contracts';
import type { BlockVisualProvider } from './block-visual-provider-contract';
import { BlockRepresentationHydrationOwner, type BlockRepresentationHydrationOwnerPorts } from './block-representation-hydration-owner';

const block = {
  kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: {},
} as ProjectDocument['blocks'][number];

const job = {
  token: 1, projectionRevision: 1, key: '1,2,3', block, signature: 'stone', role: 'normal',
  worldContext: { getBlock: () => undefined }, options: {}, allowInstancing: false,
  surfaceFastPathEligible: false, surfaceVisibleEntries: new Map(),
} as unknown as BlockHydrationJob;

function visual(): HydratedBlockVisualResult {
  return {
    resolved: { diagnostics: [] } as unknown as HydratedBlockVisualResult['resolved'], mode: 'real', diagnostics: [],
    trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true },
  };
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function createOwner(overrides: Partial<BlockRepresentationHydrationOwnerPorts> = {}): {
  readonly owner: BlockRepresentationHydrationOwner;
  readonly provider: BlockVisualProvider;
  readonly store: ViewportBlockRepresentationStore;
  readonly releaseRetiredProviders: ReturnType<typeof vi.fn>;
  readonly commit: Record<string, ReturnType<typeof vi.fn>>;
} {
  const provider = { create: vi.fn(), thumbnailUrl: vi.fn() } as unknown as BlockVisualProvider;
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const commit = {
    begin: vi.fn(),
    tryCached: vi.fn(() => false),
    beginAsync: vi.fn(() => ({ entry: undefined, fallback, revision: 1, staticAllowed: false })),
    commitCreate: vi.fn(),
    commitRefresh: vi.fn(),
    fail: vi.fn(),
    failCached: vi.fn(),
    recordRefreshFailure: vi.fn(),
  };
  const releaseRetiredProviders = vi.fn();
  const store = new ViewportBlockRepresentationStore();
  const ports: BlockRepresentationHydrationOwnerPorts = {
    store,
    provider: () => provider,
    providerGeneration: () => 0,
    resolve: {
      reusableKey: () => undefined,
      visual: () => Promise.resolve(visual()),
      terrain: () => Promise.resolve(visual()),
    },
    commit: commit as unknown as BlockRepresentationHydrationOwnerPorts['commit'],
    invalidateDiagnostics: vi.fn(),
    releaseRetiredProviders,
    ...overrides,
  };
  return { owner: new BlockRepresentationHydrationOwner(ports), provider, store, releaseRetiredProviders, commit };
}

describe('BlockRepresentationHydrationOwner provider lifetime', () => {
  it('counts concurrent jobs independently and releases each lease once', async () => {
    const first = deferred<HydratedBlockVisualResult>();
    const second = deferred<HydratedBlockVisualResult>();
    const requests = [first, second];
    const completions = vi.fn();
    const fixture = createOwner({ resolve: { reusableKey: () => undefined, visual: () => requests.shift()!.promise, terrain: () => Promise.resolve(visual()) } });

    fixture.owner.create(job, completions);
    fixture.owner.create({ ...job, key: '4,5,6' }, completions);
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(2);

    first.resolve(visual());
    await flushAsync();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(1);
    second.resolve(visual());
    await flushAsync();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(0);
    expect(completions).toHaveBeenCalledTimes(2);
  });

  it('holds a provider while cached terrain is pending and settles it once', async () => {
    const pending = deferred<void>();
    const complete = vi.fn();
    const fixture = createOwner({ commit: { ...fixtureCommit(), tryCached: vi.fn(() => pending.promise) } as unknown as BlockRepresentationHydrationOwnerPorts['commit'] });

    fixture.owner.create(job, complete);
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(1);
    pending.resolve();
    await flushAsync();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(0);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('releases a lease on synchronous resolver failure', () => {
    const fixture = createOwner({ resolve: { reusableKey: () => { throw new Error('resolver failure'); }, visual: () => Promise.resolve(visual()), terrain: () => Promise.resolve(visual()) } });

    expect(() => fixture.owner.create(job)).toThrow('resolver failure');
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(0);
  });

  it('releases a lease and records fallback when the provider promise rejects', async () => {
    const fixture = createOwner({ resolve: { reusableKey: () => undefined, visual: () => Promise.reject(new Error('provider failure')), terrain: () => Promise.resolve(visual()) } });

    fixture.store.createOrReplace({ key: job.key, block: job.block, signature: job.signature, role: 'normal', revision: 0, provider: fixture.provider });
    fixture.owner.refresh(job);
    await flushAsync();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(0);
    expect(fixture.commit['recordRefreshFailure']).toHaveBeenCalledOnce();
  });

  it('keeps the lease until a disposed in-flight request reaches terminal cleanup', async () => {
    const request = deferred<HydratedBlockVisualResult>();
    const complete = vi.fn();
    const fixture = createOwner({ resolve: { reusableKey: () => undefined, visual: () => request.promise, terrain: () => Promise.resolve(visual()) } });

    fixture.owner.create(job, complete);
    fixture.owner.dispose();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(1);
    request.resolve(visual());
    await flushAsync();
    expect(fixture.owner.activeProviderReferenceCount(fixture.provider)).toBe(0);
    expect(complete).toHaveBeenCalledOnce();
    expect(fixture.commit['commitCreate']).not.toHaveBeenCalled();
  });

});

function fixtureCommit(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    begin: vi.fn(), tryCached: vi.fn(() => false),
    beginAsync: vi.fn(() => ({ entry: undefined, fallback: new THREE.Mesh(), revision: 1, staticAllowed: false })),
    commitCreate: vi.fn(), commitRefresh: vi.fn(), fail: vi.fn(), failCached: vi.fn(), recordRefreshFailure: vi.fn(),
  };
}

function flushAsync(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

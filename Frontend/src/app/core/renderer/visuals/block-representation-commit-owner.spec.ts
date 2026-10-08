import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import { ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { BlockHydrationJob, HydratedBlockVisualResult } from './block-representation-contracts';
import type { BlockVisualProvider } from './block-visual-provider-contract';
import { BlockRepresentationCommitOwner, type BlockRepresentationCommitOwnerPorts } from './block-representation-commit-owner';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';

const block = {
  kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 2, z: 3 }, state: {},
} as ProjectDocument['blocks'][number];

const job = {
  token: 1, projectionRevision: 1, key: '1,2,3', block, signature: 'stone', role: 'normal',
  worldContext: { getBlock: () => undefined }, options: {}, allowInstancing: false,
  surfaceFastPathEligible: true, surfaceVisibleEntries: new Map(), providerRefresh: true,
} as unknown as BlockHydrationJob;

const provider = { create: vi.fn(), thumbnailUrl: vi.fn() } as unknown as BlockVisualProvider;

function visual(object?: THREE.Group, terrainTemplates?: readonly SurfaceFaceTemplate[]): HydratedBlockVisualResult {
  return {
    object, terrainTemplates,
    resolved: { diagnostics: [] } as unknown as HydratedBlockVisualResult['resolved'], mode: 'real', diagnostics: [],
    trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true },
  };
}

function createOwner(store: ViewportBlockRepresentationStore, group: THREE.Group, terrainAdd: (templates: readonly SurfaceFaceTemplate[]) => boolean, release: (key: string, entry: unknown, replacement: string) => void): BlockRepresentationCommitOwner {
  const ports: BlockRepresentationCommitOwnerPorts = {
    store,
    resources: {
      ensureFallback: vi.fn(), remove: vi.fn(), removePlaceholder: vi.fn(), rollbackPartial: vi.fn(),
      removeOrphanedInstanceMemberships: vi.fn(), releasePreviousAfterReplacement: release,
    },
    targets: {
      terrain: { templatesFor: () => undefined, cacheTemplates: vi.fn(), chunkKey: () => 'chunk', add: (_block, _key, templates) => terrainAdd(templates) },
      surface: { templatesFor: () => undefined, cacheTemplates: vi.fn(), meshFor: () => undefined, add: () => undefined },
      instances: { shouldAttempt: () => false, templateFor: () => undefined, decisionFor: () => undefined, batches: new Map(), add: () => undefined, addFromTemplates: () => undefined },
      object: {
        blocksGroup: group, applyBrightness: vi.fn(), applyReferenceOpacity: vi.fn(), familyFromReusableKey: () => undefined,
        familyFromVisual: () => undefined, extractSurfaceTemplates: () => undefined,
      },
    },
    record: vi.fn(), invalidateDiagnostics: vi.fn(), recordProviderCacheStats: vi.fn(), scheduleRender: vi.fn(),
  };
  return new BlockRepresentationCommitOwner(ports);
}

describe('BlockRepresentationCommitOwner refresh transitions', () => {
  it('keeps the committed representation when terrain replacement cannot be committed', () => {
    const store = new ViewportBlockRepresentationStore();
    const group = new THREE.Group();
    const oldObject = new THREE.Group();
    group.add(oldObject);
    store.createOrReplace({ key: job.key, block, signature: 'old', role: 'normal', revision: 2, object: oldObject, provider });
    const release = vi.fn();
    const owner = createOwner(store, group, () => false, release);

    owner.commitRefresh(job, visual(undefined, [{} as SurfaceFaceTemplate]), 'stone', provider);

    expect(store.get(job.key)?.object).toBe(oldObject);
    expect(oldObject.parent).toBe(group);
    expect(release).not.toHaveBeenCalled();
    expect(oldObject.userData['diagnostics']).toEqual([{ code: 'PROVIDER_REFRESH_FAILED', message: 'Visual provider returned no replacement representation' }]);
  });

  it('publishes the new object before retiring the previous representation', () => {
    const store = new ViewportBlockRepresentationStore();
    const group = new THREE.Group();
    const oldObject = new THREE.Group();
    group.add(oldObject);
    store.createOrReplace({ key: job.key, block, signature: 'old', role: 'normal', revision: 2, object: oldObject, provider });
    const replacement = new THREE.Group();
    let sawReplacement = false;
    const release = vi.fn((_key: string, entry: unknown, _kind: string) => {
      sawReplacement = group.children.includes(replacement);
      const previous = entry as { readonly object?: THREE.Object3D };
      if (previous.object) group.remove(previous.object);
    });
    const owner = createOwner(store, group, () => true, release);

    owner.commitRefresh(job, visual(replacement), 'stone', provider);

    expect(sawReplacement).toBe(true);
    expect(store.get(job.key)?.object).toBe(replacement);
    expect(oldObject.parent).toBeNull();
    expect(replacement.parent).toBe(group);
  });
});

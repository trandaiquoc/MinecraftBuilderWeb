import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { FluidChunkRecordStore } from './fluid-chunk-record-store';
import { FluidChunkResidencyOwner } from './fluid-chunk-residency-owner';
import { FluidChunkBuildOwner } from './fluid-chunk-build-owner';
import { vanillaFluidRenderResolver } from './fluid-state';
import type { FluidChunkRecord, FluidChunkVisualProvider } from './fluid-render-contracts';
import type { FluidWorldLookup } from './fluid-state';

function waterRecord(): FluidChunkRecord {
  const block: PlacedBlock = {
    kind: 'resolved',
    id: 'minecraft:water',
    namespace: 'minecraft',
    position: { x: 0, y: 1, z: 0 },
    state: { level: '0' },
  };
  return { block, state: vanillaFluidRenderResolver.resolve(block)! };
}

describe('FluidChunkBuildOwner', () => {
  it('rejects a provider-stale texture result and leaves GPU residency empty', async () => {
    const blocksGroup = new THREE.Group();
    const records = new FluidChunkRecordStore();
    const residency = new FluidChunkResidencyOwner(blocksGroup);
    const owner = new FluidChunkBuildOwner(records, residency);
    let resolveTexture!: (texture: THREE.Texture) => void;
    let announceRequest!: () => void;
    const requestStarted = new Promise<void>((resolve) => { announceRequest = resolve; });
    const textureRequest = new Promise<THREE.Texture>((resolve) => { resolveTexture = resolve; });
    const provider: FluidChunkVisualProvider = {
      contractKey: 'provider-a',
      resolver: vanillaFluidRenderResolver,
      texture: () => { announceRequest(); return textureRequest; },
    };
    const world: FluidWorldLookup = { getBlock: () => undefined, visualRevisionKey: 'fixture-v1' };
    owner.setProvider(provider);
    const pending = owner.sync([waterRecord()], world);
    await requestStarted;

    owner.setProvider(undefined);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    resolveTexture(texture);

    await expect(pending).resolves.toMatchObject({ status: 'stale', committedKeys: [], fallbackKeys: [] });
    expect(residency.evidence()).toMatchObject({ chunks: 0, meshes: 0, materialBuckets: 0, residentVariantCount: 0 });
    owner.dispose();
    residency.dispose();
    texture.dispose();
  });

  it('keeps an equivalent provider handoff current while a chunk is building', async () => {
    const records = new FluidChunkRecordStore();
    const residency = new FluidChunkResidencyOwner(new THREE.Group());
    const owner = new FluidChunkBuildOwner(records, residency);
    let resolveTexture!: (texture: THREE.Texture) => void;
    let announceRequest!: () => void;
    const textureRequest = new Promise<THREE.Texture>((resolve) => { resolveTexture = resolve; });
    const requestStarted = new Promise<void>((resolve) => { announceRequest = resolve; });
    const provider = (texture: () => Promise<THREE.Texture>): FluidChunkVisualProvider => ({
      contractKey: 'provider-equivalent', resolver: vanillaFluidRenderResolver, texture,
    });
    const world: FluidWorldLookup = { getBlock: () => undefined, visualRevisionKey: 'fixture-v1' };
    owner.setProvider(provider(() => { announceRequest(); return textureRequest; }));
    const pending = owner.sync([waterRecord()], world);
    await requestStarted;
    owner.setProvider(provider(async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)));
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    resolveTexture(texture);

    await expect(pending).resolves.toMatchObject({ status: 'committed', committedKeys: ['0,1,0'] });
    expect(residency.evidence().chunks).toBe(1);
    owner.dispose();
    residency.dispose();
    texture.dispose();
  });
});

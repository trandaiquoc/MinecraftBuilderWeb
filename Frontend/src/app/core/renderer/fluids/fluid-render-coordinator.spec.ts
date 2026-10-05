import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import { FluidChunkRenderer } from './fluid-chunk-renderer';
import { FluidRenderCoordinator } from './fluid-render-coordinator';
import { vanillaFluidRenderResolver, type FluidRenderResolver, type FluidWorldLookup } from './fluid-state';

const block = (x: number, id = 'minecraft:water'): PlacedBlock => ({ kind: 'resolved', id, namespace: id.split(':')[0], position: { x, y: 0, z: 0 }, state: { level: '0' } });
const worldFor = (blocks: readonly PlacedBlock[]): FluidWorldLookup => {
  const map = new Map(blocks.map((value) => [`${value.position.x},${value.position.y},${value.position.z}`, value]));
  return { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) };
};
const provider = (contractKey: string, texture: () => Promise<THREE.Texture | undefined>, resolver = vanillaFluidRenderResolver) => ({ contractKey, resolver, texture });
const recordsFor = (blocks: readonly PlacedBlock[]) => blocks.map((value) => ({ block: value, state: vanillaFluidRenderResolver.resolve(value)! }));

describe('FluidRenderCoordinator', () => {
  it('commits all detected keys and exposes no orphan after the initial build', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const terminal: string[][] = [];
    const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: (_generation, keys) => terminal.push([...keys]) });
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    coordinator.setProvider(provider('A', async () => texture));
    const blocks = [block(0), block(1), block(16)];
    await coordinator.sync(recordsFor(blocks), worldFor(blocks), 4);
    expect(coordinator.diagnostics()).toMatchObject({ fluidDetectedVoxels: 3, fluidCommittedVoxels: 3, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0, fluidStandaloneMeshes: 0 });
    expect(terminal).toHaveLength(1);
    coordinator.dispose(); texture.dispose();
  });

  it('keeps committed chunks visible across equivalent and changed provider handoffs', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: () => undefined });
    const firstTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); firstTexture.needsUpdate = true;
    const secondTexture = new THREE.DataTexture(new Uint8Array([200, 200, 255, 255]), 1, 1); secondTexture.needsUpdate = true;
    const blocks = [block(0), block(1)]; const records = recordsFor(blocks); const world = worldFor(blocks);
    coordinator.setProvider(provider('A', async () => firstTexture)); await coordinator.sync(records, world, 1);
    const before = group.children.length;
    coordinator.setProvider(provider('A', async () => secondTexture));
    expect(group.children.length).toBe(before);
    await coordinator.sync(records, world, 2);
    coordinator.setProvider(provider('B', async () => secondTexture));
    expect(group.children.length).toBeGreaterThan(0);
    await coordinator.sync(records, world, 3);
    expect(coordinator.diagnostics()).toMatchObject({ fluidCommittedVoxels: 2, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0 });
    coordinator.dispose(); firstTexture.dispose(); secondTexture.dispose();
  });

  it('discards stale A to B work while allowing C to become authoritative', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: () => undefined });
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    let releaseB!: () => void; const bReady = new Promise<void>((resolve) => { releaseB = resolve; });
    const blocks = [block(0)]; const records = recordsFor(blocks); const world = worldFor(blocks);
    coordinator.setProvider(provider('A', async () => texture)); await coordinator.sync(records, world, 1);
    coordinator.setProvider(provider('B', async () => { await bReady; return texture; }));
    const stale = coordinator.sync(records, world, 2);
    await Promise.resolve();
    expect(group.children.length).toBeGreaterThan(0);
    coordinator.setProvider(provider('C', async () => texture));
    const current = coordinator.sync(records, world, 3);
    releaseB();
    await Promise.all([stale, current]);
    expect(coordinator.diagnostics()).toMatchObject({ fluidCommittedVoxels: 1, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0 });
    coordinator.dispose(); texture.dispose();
  });

  it('commits a visible fallback material when a fluid texture is unavailable', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: () => undefined });
    const blocks = [block(0)];
    coordinator.setProvider(provider('missing-texture', async () => undefined));
    await coordinator.sync(recordsFor(blocks), worldFor(blocks), 1);
    expect(coordinator.diagnostics()).toMatchObject({ fluidCommittedVoxels: 0, fluidFallbackVoxels: 1, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0, fluidChunkMeshes: 1 });
    coordinator.dispose();
  });

  it('commits a generic visible fallback when a fluid build fails', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: () => undefined });
    const failingResolver: FluidRenderResolver = { resolve: () => { throw new Error('synthetic fluid build failure'); } };
    const blocks = [block(0)];
    coordinator.setProvider(provider('build-failure', async () => undefined, failingResolver));
    await coordinator.sync(recordsFor(blocks), worldFor(blocks), 1);
    expect(coordinator.diagnostics()).toMatchObject({ fluidCommittedVoxels: 0, fluidFallbackVoxels: 1, fluidPendingVoxels: 0, fluidOrphanedLogicalCount: 0, fluidChunkMeshes: 1 });
    coordinator.dispose();
  });

  it('keeps detected fluids pending until the texture-backed chunk commits', async () => {
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const terminal: string[][] = [];
    const coordinator = new FluidRenderCoordinator(renderer, { onTerminal: (_generation, keys) => terminal.push([...keys]) });
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    let release!: (value: THREE.Texture) => void;
    const textureReady = new Promise<THREE.Texture>((resolve) => { release = resolve; });
    const blocks = [block(0)];
    coordinator.setProvider(provider('delayed-texture', async () => textureReady));
    const sync = coordinator.sync(recordsFor(blocks), worldFor(blocks), 1);
    await Promise.resolve();
    expect(coordinator.diagnostics()).toMatchObject({ fluidDetectedVoxels: 1, fluidPendingVoxels: 1, fluidCommittedVoxels: 0, fluidOrphanedLogicalCount: 0 });
    expect(terminal).toHaveLength(0);
    release(texture);
    await sync;
    expect(coordinator.diagnostics()).toMatchObject({ fluidPendingVoxels: 0, fluidCommittedVoxels: 1, fluidOrphanedLogicalCount: 0 });
    expect(terminal).toHaveLength(1);
    coordinator.dispose(); texture.dispose();
  });
});

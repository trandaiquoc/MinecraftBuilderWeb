import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { vanillaFluidRenderResolver } from '../fluids/fluid-state';
import {
  GroupIsolationPresentation,
  type GroupIsolationSnapshot,
} from './group-isolation-presentation';

describe('group isolation presentation', () => {
  it('keeps disposal bookkeeping bounded across 100 presentation cycles', async () => {
    const presentation = new GroupIsolationPresentation(new THREE.Group());
    const block: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: {},
    };

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const key = `cycle-${cycle}`;
      presentation.prepare({
        blocks: [{ key, block, standalone: new THREE.Group() }],
        decorations: [],
        fluidWorld: { getBlock: () => undefined },
        isolateKeys: new Set([key]),
      });
      presentation.deactivate();
      await Promise.resolve();
    }

    const diagnostics = presentation.diagnostics();
    expect(diagnostics).toMatchObject({
      createdBundleCount: 100,
      disposeRequestedCount: 100,
      disposedBundleCount: 100,
      disposeCount: 100,
      activeBundleCount: 0,
      stagingBundleCount: 0,
    });
    expect(diagnostics.createdBundleCount).toBe(diagnostics.disposedBundleCount);
    expect('disposedBundleGenerations' in (presentation as unknown as object)).toBe(false);
    presentation.dispose();
  });

  it('disposes cancelled generations once and never commits stale asynchronous work', async () => {
    const presentation = new GroupIsolationPresentation(new THREE.Group());
    const water: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:water',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: { level: '0' },
    };
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    const makeSnapshot = (
      provider: { texture: (resource: string) => Promise<THREE.Texture | undefined> },
      key: string,
    ): GroupIsolationSnapshot => ({
      blocks: [
        {
          key,
          block: water,
          fluid: { block: water, state: vanillaFluidRenderResolver.resolve(water)! },
        },
      ],
      decorations: [],
      fluidProvider: {
        contractKey: key,
        resolver: vanillaFluidRenderResolver,
        texture: provider.texture,
      },
      fluidWorld: { getBlock: () => water },
      isolateKeys: new Set([key]),
    });
    const first = deferred<THREE.Texture | undefined>();
    presentation.prepare(makeSnapshot({ texture: vi.fn(() => first.promise) }, 'A'));
    await Promise.resolve();
    presentation.deactivate();
    first.resolve(texture);
    await settleMicrotasks(6);
    expect(presentation.diagnostics()).toMatchObject({
      state: 'inactive',
      activeBundleCount: 0,
      stagingBundleCount: 0,
      createdBundleCount: 1,
      disposedBundleCount: 1,
      disposeCount: 1,
      commitCount: 0,
    });

    const secondA = deferred<THREE.Texture | undefined>();
    const secondB = deferred<THREE.Texture | undefined>();
    let calls = 0;
    const provider = { texture: vi.fn(() => (++calls === 1 ? secondA.promise : secondB.promise)) };
    presentation.prepare(makeSnapshot(provider, 'B'));
    await Promise.resolve();
    presentation.prepare(makeSnapshot(provider, 'C'));
    secondA.resolve(texture);
    await settleMicrotasks(6);
    expect(presentation.diagnostics()).toMatchObject({
      activeBundleCount: 0,
      stagingBundleCount: 1,
      createdBundleCount: 3,
      disposedBundleCount: 2,
      disposeCount: 2,
      commitCount: 0,
    });
    secondB.resolve(texture);
    await settleMicrotasks(8);
    expect(presentation.diagnostics()).toMatchObject({
      state: 'active',
      activeBundleCount: 1,
      stagingBundleCount: 0,
      disposedBundleCount: 2,
      commitCount: 1,
    });
    presentation.dispose();
    await settleMicrotasks(4);
    expect(presentation.diagnostics()).toMatchObject({
      activeBundleCount: 0,
      stagingBundleCount: 0,
      createdBundleCount: 3,
      disposedBundleCount: 3,
    });
    texture.dispose();
  });
});

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function settleMicrotasks(rounds: number): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

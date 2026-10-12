import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import { viewportThemePalette } from '../engine/appearance/viewport-theme';
import { BlockGhostPresenter } from './block-ghost-presenter';

describe('BlockGhostPresenter', () => {
  it('releases already-created block visuals when another placement part fails', async () => {
    const { presenter, provider } = setup();
    const object = visualObject();
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    object.geometry.addEventListener('dispose', geometryDisposed);
    (object.material as THREE.Material).addEventListener('dispose', materialDisposed);
    let rejectBroken!: (error: Error) => void;
    const broken = new Promise<never>((_, reject) => (rejectBroken = reject));
    provider.create = vi.fn((block) =>
      block.id === 'example:broken'
        ? broken
        : Promise.resolve({ object: new THREE.Group().add(object) } as any),
    );

    presenter.updateModel(activeBlock(), placementPlan(['example:ready', 'example:broken']));
    await settleAsyncWork();
    rejectBroken(new Error('part visual failed'));
    await settleAsyncWork();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(presenter.ghost.userData['renderMode']).toBe('fallback');
    presenter.dispose();
  });

  it('releases a visual that resolves after a sibling has already failed', async () => {
    const { presenter, provider } = setup();
    const object = visualObject();
    const geometryDisposed = vi.fn();
    object.geometry.addEventListener('dispose', geometryDisposed);
    let resolveDelayed!: (visual: any) => void;
    const delayed = new Promise<any>((resolve) => (resolveDelayed = resolve));
    provider.create = vi.fn((block) =>
      block.id === 'example:broken' ? Promise.reject(new Error('part visual failed')) : delayed,
    );

    presenter.updateModel(activeBlock(), placementPlan(['example:delayed', 'example:broken']));
    await settleAsyncWork();
    resolveDelayed({ object: new THREE.Group().add(object) });
    await settleAsyncWork();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(presenter.ghost.userData['renderMode']).toBe('fallback');
    presenter.dispose();
  });

  it('disposes a late visual result after presenter disposal', async () => {
    const { presenter, provider, scene } = setup();
    const object = visualObject();
    const geometryDisposed = vi.fn();
    object.geometry.addEventListener('dispose', geometryDisposed);
    let resolveVisual!: (visual: any) => void;
    provider.create = vi.fn(() => new Promise((resolve) => (resolveVisual = resolve)) as any);

    presenter.updateModel(activeBlock(), placementPlan(['example:late']));
    presenter.dispose();
    resolveVisual({ object: new THREE.Group().add(object) });
    await settleAsyncWork();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it('reuses ghost visuals when equivalent block states have different key order', async () => {
    const { presenter, provider, callbacks } = setup();
    provider.create = vi.fn(async () => ({ object: new THREE.Group() }) as any);
    presenter.updateModel(
      activeBlock({ facing: 'north', half: 'top' }),
      placementPlan(['example:stairs'], { facing: 'north', half: 'top' }),
    );
    await settleAsyncWork();

    presenter.updateModel(
      activeBlock({ half: 'top', facing: 'north' }),
      placementPlan(['example:stairs'], { half: 'top', facing: 'north' }),
    );

    expect(provider.create).toHaveBeenCalledOnce();
    expect(callbacks.record).toHaveBeenCalledWith('ghostVisualReuses');
    presenter.dispose();
  });
});

function setup(): {
  readonly presenter: BlockGhostPresenter;
  readonly provider: BlockVisualProvider;
  readonly callbacks: {
    readonly record: ReturnType<typeof vi.fn>;
  };
  readonly scene: THREE.Scene;
} {
  const scene = new THREE.Scene();
  const provider = { create: vi.fn() } as unknown as BlockVisualProvider;
  const callbacks = {
    provider: () => provider,
    providerGeneration: () => 1,
    blockLookup: () => undefined,
    record: vi.fn(),
    scheduleRender: vi.fn(),
  };
  return {
    presenter: new BlockGhostPresenter(scene, viewportThemePalette('dark'), callbacks),
    provider,
    callbacks,
    scene,
  };
}

function activeBlock(state: Readonly<Record<string, string>> = {}): ActiveBlock {
  return { id: 'example:stairs', state, support: 'full' };
}

function placementPlan(
  ids: readonly string[],
  state: Readonly<Record<string, string>> = {},
): PlacementPlan {
  return {
    request: { position: { x: 4, y: 2, z: 7 } },
    blocks: ids.map((id, index) => ({
      kind: 'resolved',
      id,
      namespace: id.split(':')[0],
      position: { x: 4 + index, y: 2, z: 7 },
      state,
    })),
  } as unknown as PlacementPlan;
}

function visualObject(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
}

async function settleAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

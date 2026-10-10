import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { RenderRegionPolicy } from './render-region-policy';
import { StaticModelBatchRenderer } from './static-model-batch-renderer';

function block(
  position: VoxelCoordinate,
  id = 'minecraft:stone',
): ProjectDocument['blocks'][number] {
  return { kind: 'resolved', id, namespace: 'minecraft', position, state: {} };
}

function fixture(capacity = 4, layerCapacity?: number) {
  const group = new THREE.Group();
  const entries = new Map<
    string,
    { instanceBatchKey?: string; instanceIndex?: number; object?: THREE.Object3D }
  >();
  const diagnostics = new RendererDiagnostics();
  const renderer = new StaticModelBatchRenderer({
    blocksGroup: group,
    capacity,
    ...(layerCapacity !== undefined ? { layerCapacity } : {}),
    chunkKey: (position) => `${Math.floor(position.x / 16)},0,0`,
    stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(32, 32, 32)),
    regionPolicy: new RenderRegionPolicy(32),
    instrumentation: diagnostics,
    getEntry: (key) => entries.get(key),
    setEntryObject: (key, batchKey, index, object) => {
      const entry = entries.get(key);
      if (entry) {
        entry.instanceBatchKey = batchKey;
        entry.instanceIndex = index;
        entry.object = object;
      }
    },
  });
  return { group, entries, diagnostics, renderer };
}

function template(color = 0x557799): {
  geometry: THREE.BoxGeometry;
  material: THREE.MeshBasicMaterial;
  matrix: THREE.Matrix4;
} {
  const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  geometry.userData['providerOwnedGeometry'] = true;
  return {
    geometry,
    material: new THREE.MeshBasicMaterial({ color }),
    matrix: new THREE.Matrix4(),
  };
}

describe('static model batch renderer', () => {
  it('uses the layer capacity for layer-resident static model batches', () => {
    const state = fixture(64, 9);
    state.renderer.setLayerPresentation(new Set([0]), 0, 0.28);
    const key = '0,0,0';
    state.entries.set(key, {});

    expect(
      state.renderer.addFromTemplates([template()], block({ x: 0, y: 0, z: 0 }), key),
    ).toBeDefined();
    const batch = [...state.renderer.batches.values()][0];
    expect(batch.capacity).toBe(9);
    expect(batch.parts[0].instanceMatrix.array.length).toBe(9 * 16);

    state.renderer.clear();
  });

  it('uses cache hits for stable keys and segments without falling back', () => {
    const fixtureState = fixture(4);
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    geometry.userData['providerOwnedGeometry'] = true;
    const makeObject = () => {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
      return root;
    };
    for (let index = 0; index < 10; index += 1) {
      const position = { x: index, y: 0, z: 0 };
      const key = `${index},0,0`;
      fixtureState.entries.set(key, {});
      if (index === 0)
        expect(
          fixtureState.renderer.tryAdd(makeObject(), block(position), key, 'stone-template'),
        ).toBeDefined();
      else {
        const cached = fixtureState.renderer.templateFor('stone-template');
        expect(cached).toBeDefined();
        expect(
          fixtureState.renderer.addFromTemplates(
            cached!.templates,
            block(position),
            key,
            'cached-template',
            cached,
          ),
        ).toBeDefined();
      }
    }
    expect(fixtureState.renderer.batches.size).toBe(3);
    expect(fixtureState.renderer.metrics()).toMatchObject({
      batchable: 1,
      batchedMembers: 10,
      templateCacheHits: 9,
      templateCacheMisses: 1,
      providerObjectsAvoidedByStaticCache: 9,
    });
    expect(fixtureState.renderer.shouldAttempt(false, 'stone-template')).toBe(true);
    fixtureState.renderer.clear();
    geometry.dispose();
  });

  it('keeps identical models in separate spatial regions', () => {
    const state = fixture();
    const first = block({ x: 31, y: 0, z: 0 });
    const second = block({ x: 32, y: 0, z: 0 });
    const firstKey = '31,0,0';
    const secondKey = '32,0,0';
    state.entries.set(firstKey, {});
    state.entries.set(secondKey, {});
    expect(state.renderer.addFromTemplates([template()], first, firstKey)).toBeDefined();
    expect(state.renderer.addFromTemplates([template()], second, secondKey)).toBeDefined();
    expect(state.renderer.batches.size).toBe(2);
    state.renderer.clear();
  });

  it('records reusable-key coverage without mixing missing keys into classifier rejection', () => {
    const state = fixture();
    state.renderer.recordReusableKey('stone', 'generic-json');
    state.renderer.recordReusableKey(undefined, 'signs');
    expect(state.renderer.metrics()).toMatchObject({
      reusableKeyRequested: 2,
      reusableKeyReturned: 1,
      reusableKeyMissing: 1,
      reusableKeyMissingByFamily: { signs: 1 },
    });
    state.renderer.clear();
  });

  it('updates ownership after swap-back removal and preserves pick metadata', () => {
    const state = fixture(10);
    const positions = [0, 1, 2].map((x) => ({ x, y: 0, z: 0 }));
    positions.forEach((position) => state.entries.set(`${position.x},0,0`, {}));
    const compiledTemplate = template();
    positions.forEach((position) =>
      expect(
        state.renderer.addFromTemplates([compiledTemplate], block(position), `${position.x},0,0`),
      ).toBeDefined(),
    );
    const batch = [...state.renderer.batches.values()][0];
    const part = batch.parts[0];
    state.renderer.remove('0,0,0', state.entries.get('0,0,0'));
    expect(batch.keys).toEqual(['2,0,0', '1,0,0']);
    expect(state.entries.get('2,0,0')?.instanceIndex).toBe(0);
    expect((part.userData['instanceKeys'] as string[])[0]).toBe('2,0,0');
    state.renderer.clear();
  });

  it('refreshes a key into a new template batch without duplicate ownership', () => {
    const state = fixture();
    const key = '0,0,0';
    state.entries.set(key, {});
    const old = template(0xff0000);
    const next = template(0x00ff00);
    expect(state.renderer.addFromTemplates([old], block({ x: 0, y: 0, z: 0 }), key)).toBeDefined();
    state.renderer.remove(key, state.entries.get(key));
    expect(state.renderer.addFromTemplates([next], block({ x: 0, y: 0, z: 0 }), key)).toBeDefined();
    expect(state.renderer.ownershipIndex.size).toBe(1);
    expect(state.renderer.batches.size).toBe(1);
    state.renderer.clear();
  });
});

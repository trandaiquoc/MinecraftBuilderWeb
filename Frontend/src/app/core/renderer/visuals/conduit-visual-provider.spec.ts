import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { conduitInactiveModel, ConduitVisualProvider } from './conduit-visual-provider';

const provider = new ConduitVisualProvider();
const conduit = (id = 'minecraft:conduit') => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0], position: { x: 0, y: 0, z: 0 }, state: {} });

describe('ConduitVisualProvider', () => {
  it('claims only the vanilla conduit and preserves its centered six-pixel shell', () => {
    expect(provider.family).toBe('conduits');
    expect(provider.overrideGeneric).toBe(true);
    expect(provider.matches(conduit())).toBe(true);
    expect(provider.matches(conduit('mod:conduit'))).toBe(false);
    expect(provider.textureResource()).toBe('minecraft:entity/conduit/base');
    expect(conduitInactiveModel.textureSize).toEqual([32, 16]);
    expect(conduitInactiveModel.parts[0].cuboids[0]).toMatchObject({ uv: [0, 0], from: [-3, -3, -3], size: [6, 6, 6] });

    const visual = provider.create(conduit());
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.toArray()).toEqual([.3125, .3125, .3125]);
    expect(bounds.max.toArray()).toEqual([.6875, .6875, .6875]);
    expect(visual.userData['conduitState']).toBe('inactive');
  });
});

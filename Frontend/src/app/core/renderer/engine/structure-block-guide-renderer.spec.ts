import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import { ThreeViewportEngine } from './three-viewport-engine';
import type { BlockVisualProvider } from '../geometry/block-model-geometry';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';

describe('Structure Block guide renderer', () => {
  it('requests the real Save-mode block visual and keeps it in a dedicated owner', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.userData['providerOwnedGeometry'] = true;
    const create = vi.fn(async (block: { readonly id: string }) => {
      const object = new THREE.Group();
      object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x8a6a45 })));
      return { object, resolved: { diagnostics: [], support: 'full' as const }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } };
    });
    const provider = { create, thumbnailUrl: () => undefined } as unknown as BlockVisualProvider;
    const definition = { id: 'minecraft:structure_block', sourceId: 'vanilla', defaultState: { mode: 'load' } } as unknown as BlockDefinition;
    const engine = new ThreeViewportEngine();
    engine.setBlockDefinitionResolver(() => definition);
    engine.setVisualProvider(provider);
    engine.update({ ...rendererBenchmarkProject('small'), blocks: [] }, undefined);
    await Promise.resolve();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: 'minecraft:structure_block', state: { mode: 'save' } }));
    const guideGroup = (engine as unknown as { structureBlockGuideGroup: THREE.Group }).structureBlockGuideGroup;
    expect(guideGroup.name).toBe('structureBlockGuide');
    expect(guideGroup.children).toHaveLength(1);
    expect(guideGroup.children[0].position.toArray()).toEqual([-1, 0, -1]);

    engine.dispose();
  });
});

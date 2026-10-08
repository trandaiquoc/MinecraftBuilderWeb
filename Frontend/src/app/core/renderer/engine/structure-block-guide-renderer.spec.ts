import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import { ThreeViewportEngine } from './three-viewport-engine';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';

describe('Structure Block guide renderer', () => {
  it('requests the real Save-mode block visual, brightens its owned materials, and keeps it in a dedicated owner', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.userData['providerOwnedGeometry'] = true;
    const sourceMaterial = new THREE.MeshBasicMaterial({ color: 0x8a6a45 });
    const create = vi.fn(async (block: { readonly id: string }) => {
      const object = new THREE.Group();
      object.add(new THREE.Mesh(geometry, sourceMaterial));
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
    expect(guideGroup.children[0].position.toArray()).toEqual([0, -1, 0]);
    const guideMaterials: THREE.Material[] = [];
    guideGroup.traverse((object) => { if (object instanceof THREE.Mesh) guideMaterials.push(object.material as THREE.Material); });
    expect(guideMaterials).toHaveLength(1);
    expect(guideMaterials[0]).not.toBe(sourceMaterial);
    expect(guideMaterials[0].userData['structureGuideOwnedMaterial']).toBe(true);
    expect(guideGroup.getObjectByName('structureBlockGuideOutline')).toBeUndefined();
    const guideColorBeforeUserBrightness = (guideMaterials[0] as THREE.MeshBasicMaterial).color.clone();
    engine.setBlockBrightness(0);
    engine.setBlockBrightness(10);
    expect((guideMaterials[0] as THREE.MeshBasicMaterial).color.equals(guideColorBeforeUserBrightness)).toBe(true);

    engine.dispose();
    sourceMaterial.dispose();
  });
});

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { TerrainTemplateResourceOwner } from './terrain-template-resource-owner';

describe('terrain template resource owner', () => {
  it('caches compiled templates by identity and disposes shared resources once', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const geometryDisposed = vi.spyOn(geometry, 'dispose');
    const materialDisposed = vi.spyOn(material, 'dispose');
    const template = {
      geometry,
      material,
      direction: 'north',
      matrix: new THREE.Matrix4(),
    } as SurfaceFaceTemplate;
    const templates = [template, template, template, template, template, template];
    const records: string[] = [];
    const owner = new TerrainTemplateResourceOwner('off', (name) => records.push(name));

    owner.cacheTemplates('stone', templates);
    owner.cacheTemplates('stone', templates);
    const compiled = owner.compiledTemplates({
      key: 'stone-at-0',
      block: blockAtOrigin(),
      templates,
    });

    expect(owner.hasTemplates('stone')).toBe(true);
    expect(owner.templatesFor('stone')).toBe(templates);
    expect(owner.compiledTemplates({ key: 'stone-at-1', block: blockAtOrigin(), templates })).toBe(
      compiled,
    );
    expect(owner.identityFor(templates)).toBe(owner.identityFor(templates));
    expect(owner.evidence()).toEqual({ templateResolutions: 1, templateCacheHits: 1 });
    expect(records).toEqual(['terrainTemplateResolutions', 'terrainTemplateCacheHits']);

    owner.clear();
    owner.clear();

    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(owner.hasTemplates('stone')).toBe(false);
    expect(owner.evidence()).toEqual({ templateResolutions: 0, templateCacheHits: 0 });
  });
});

function blockAtOrigin() {
  return {
    kind: 'resolved' as const,
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x: 0, y: 0, z: 0 },
    state: {},
  };
}

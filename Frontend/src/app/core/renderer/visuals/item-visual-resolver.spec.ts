import { describe, expect, it } from 'vitest';
import { itemVisualResource, itemVisualTextureResources, resolveItemVisual } from './item-visual-resolver';

describe('item visual resolver', () => {
  it('resolves legacy and modern item entries without requiring a block model', () => {
    const resources: Record<string, unknown> = {
      'assets/example/models/item/hammer.json': { parent: 'item/generated', textures: { layer0: 'example:item/hammer' } },
      'assets/example/items/gem.json': { model: { type: 'minecraft:model', model: 'example:item/gem' } },
      'assets/example/models/item/gem.json': { parent: 'item/generated', textures: { layer0: 'example:item/gem' } },
    };
    const provider = { readJson: (path: string) => resources[path] };
    expect(itemVisualResource(provider, 'example:hammer')).toBe('example:item/hammer');
    expect(itemVisualResource(provider, 'example:gem')).toBe('example:item/gem');
  });

  it('resolves generated inventory layers and exposes them to item catalog consumers', () => {
    const resources: Record<string, unknown> = {
      'assets/example/items/berry.json': { model: 'example:item/berry' },
      'assets/example/models/item/berry.json': { parent: 'minecraft:item/generated', textures: { layer0: 'example:item/berry', layer1: 'example:item/shine' } },
    };
    const provider = { readJson: (path: string) => resources[path] };
    expect(resolveItemVisual(provider, 'example:berry')).toMatchObject({ kind: 'generated-layers', layers: ['example:item/berry', 'example:item/shine'] });
    expect(itemVisualTextureResources(provider, 'example:berry')).toEqual(['example:item/berry', 'example:item/shine']);
  });

  it('fails closed for conditional item models', () => {
    const resources: Record<string, unknown> = { 'assets/example/items/widget.json': { model: { type: 'minecraft:condition', property: 'minecraft:using_item' } } };
    expect(resolveItemVisual({ readJson: (path: string) => resources[path] }, 'example:widget').kind).toBe('unsupported');
  });

  it('retains block-parent item models as a shared model contract', () => {
    const resources: Record<string, unknown> = { 'assets/example/models/item/brick.json': { parent: 'example:block/brick' } };
    expect(resolveItemVisual({ readJson: (path: string) => resources[path] }, 'example:brick')).toMatchObject({ kind: 'block-model', model: 'example:block/brick' });
  });

  it('uses the 1.21.1 models/item entry before an unrelated client-item definition', () => {
    const resources: Record<string, unknown> = {
      'assets/example/models/item/gem.json': { parent: 'item/generated', textures: { layer0: 'example:item/legacy' } },
      'assets/example/items/gem.json': { model: { type: 'minecraft:model', model: 'example:item/modern' } },
    };
    const provider = { gameVersion: '1.21.1', readJson: (path: string) => resources[path] };
    expect(resolveItemVisual(provider, 'example:gem')).toMatchObject({ kind: 'generated-layers', layers: ['example:item/legacy'] });
  });

  it('inherits parent textures, chained variables, layers and fixed display data', () => {
    const resources: Record<string, unknown> = {
      'assets/example/models/item/gem.json': { parent: 'example:item/base', textures: { icon: '#gem' } },
      'assets/example/models/item/base.json': { parent: 'minecraft:item/generated', textures: { gem: '#asset', asset: 'example:item/gem', layer0: '#icon', layer1: 'example:item/overlay' }, display: { fixed: { rotation: [10, 20, 30], translation: [1, 2, 3], scale: [0.5, 0.5, 0.5] } } },
    };
    expect(resolveItemVisual({ readJson: (path: string) => resources[path] }, 'example:gem')).toMatchObject({ kind: 'generated-layers', layers: ['example:item/gem', 'example:item/overlay'], displayFixed: { rotation: [10, 20, 30] } });
  });
});

import { describe, expect, it } from 'vitest';
import { ItemCatalog, normalizeItemSearch } from './item-catalog';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { normalizeItemStack } from '../item-stack.types';

function entry(id: string, sourceId = id.split(':')[0]!, sourceName = sourceId) {
  return { id, displayName: id.split(':')[1]!, namespace: id.split(':')[0]!, sourceId, sourceName, sourceFormat: 'authoritative-registry' as const, referencedModels: [], referencedResources: [] };
}

describe('ItemCatalog', () => {
  it('normalizes valid stacks without dropping custom components', () => {
    expect(normalizeItemStack({ id: 'example:gem', count: '2', components: { custom: { value: true } } })).toEqual({ id: 'example:gem', count: 2, components: { custom: { value: true } } });
    expect(normalizeItemStack({ id: 'example:gem', count: 0 })).toBeUndefined();
  });
  it('aggregates item-only and block-backed items without polluting BlockCatalog', () => {
    const catalog = new ItemCatalog();
    catalog.replaceSource('vanilla', [entry('minecraft:stone', 'vanilla', 'Minecraft'), entry('minecraft:apple', 'vanilla', 'Minecraft')]);
    catalog.replaceSource('external-a', [entry('example:gem', 'external-a', 'Example Mod'), entry('example:display_item', 'external-a', 'Example Mod')]);
    expect(catalog.search('example mod').map((item) => item.id)).toEqual(['example:gem', 'example:display_item']);
    expect(catalog.search('minecraft:apple').map((item) => item.id)).toEqual(['minecraft:apple']);
    const blocks = new BlockCatalog();
    blocks.load({ minecraftVersion: '1.21.1', blocks: [{ id: 'minecraft:stone', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] } }] });
    expect(blocks.get('example:gem')).toBeUndefined();
  });

  it('removes source entries while preserving an unavailable selected ID in project data', () => {
    const catalog = new ItemCatalog();
    catalog.replaceSource('external-a', [entry('example:gem')]);
    expect(catalog.get('example:gem')).toBeDefined();
    catalog.removeSource('external-a');
    expect(catalog.get('example:gem')).toBeUndefined();
  });

  it('normalizes display, registry, namespace and source search text', () => {
    const catalog = new ItemCatalog();
    catalog.replaceSource('external-a', [entry('example:gem', 'external-a', 'Cobblemon')]);
    expect(catalog.search(' GEM ').map((item) => item.id)).toEqual(['example:gem']);
    expect(catalog.search('example').map((item) => item.id)).toEqual(['example:gem']);
    expect(catalog.search('cobblemon').map((item) => item.id)).toEqual(['example:gem']);
    expect(normalizeItemSearch('Tiếng Việt')).toBe('tieng viet');
  });
});

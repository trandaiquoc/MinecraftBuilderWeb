import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from './active-block.service';
import { representativeBlockFixture } from '../catalog/block-catalog.fixture';
import { BlockCatalog } from '../catalog/block-catalog';
import { BlockLibraryService } from '../catalog/block-library.service';

describe('ActiveBlockService', () => {
  it('selects a block with its default state and support level', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    const service = new ActiveBlockService();
    service.select(catalog.get('minecraft:oak_stairs')!);
    expect(service.active()).toEqual({
      id: 'minecraft:oak_stairs',
      sourceId: 'vanilla',
      state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
      support: 'full',
    });
  });

  it('preserves the originating source when selecting an item-backed definition', () => {
    const catalog = new BlockCatalog();
    catalog.load({
      ...representativeBlockFixture,
      sourceId: 'example',
      sourceName: 'Example',
      blocks: [
        { ...representativeBlockFixture.blocks[0], id: 'example:stone', sourceId: 'example' },
      ],
    });
    const service = new ActiveBlockService();
    service.select(catalog.get('example:stone')!);
    expect(service.active()?.sourceId).toBe('example');
  });

  it('picks a placed block without losing state or fallback status', () => {
    const service = new ActiveBlockService();
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    service.pick({
      kind: 'missing',
      id: 'example:unknown',
      namespace: 'example',
      position: { x: 1, y: 2, z: 3 },
      state: { facing: 'south' },
    });
    expect(service.active()).toEqual({
      id: 'example:unknown',
      state: { facing: 'south' },
      support: 'unknown',
    });
    service.pick(
      {
        kind: 'resolved',
        id: 'example:fallback',
        namespace: 'example',
        position: { x: 0, y: 0, z: 0 },
        state: { mode: 'x' },
      },
      catalog.get('example:missing_renderer'),
    );
    expect(service.active()?.support).toBe('fallback');
    expect(service.active()?.state).toEqual({ mode: 'x' });
  });

  it('refreshes catalog metadata without replacing the selected state', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    library.replaceSource({
      minecraftVersion: '1.21.1',
      sourceId: 'vanilla',
      sourceName: 'Vanilla',
      blocks: [
        {
          id: 'minecraft:known',
          displayName: 'Known',
          defaultState: { mode: 'a' },
          stateDefinitions: [],
          resources: { textures: [] },
          support: 'fallback',
        },
      ],
    });
    active.select(library.getItem('minecraft:known')!);
    active.set({ ...active.active()!, state: { mode: 'edited' }, support: 'unknown' });
    library.replaceSource({
      minecraftVersion: '1.21.1',
      sourceId: 'vanilla',
      sourceName: 'Vanilla',
      blocks: [
        {
          id: 'minecraft:known',
          displayName: 'Known',
          defaultState: { mode: 'a' },
          stateDefinitions: [],
          resources: { textures: [] },
          support: 'full',
          capabilities: [{ kind: 'direct-placement', evidence: 'verified' }],
        },
      ],
    });
    expect(active.active()).toMatchObject({
      id: 'minecraft:known',
      state: { mode: 'edited' },
      support: 'full',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { ProjectDocument } from '../../domain/project.types';
import { placementRequestForActive, planPlacement } from './placement-plan';
import { buildPlaceableItems } from '../../blocks/placement-palette/placeable-item';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';

const project: ProjectDocument = {
  schemaVersion: 2,
  id: 'plan',
  metadata: { name: 'Plan', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
};

describe('placement plans', () => {
  it('has fixture logical items', () => {
    const catalog = new BlockCatalog();
    catalog.load(representativeBlockFixture);
    expect(buildPlaceableItems(catalog.all()).map((item) => item.itemId)).toContain(
      'minecraft:red_bed',
    );
  });
  it('plans complete bed, door and tall-plant footprints without mutating the project', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    const before = structuredClone(project);
    for (const [id, expected] of [
      ['minecraft:red_bed', 2],
      ['minecraft:oak_door', 2],
      ['minecraft:sunflower', 2],
    ] as const) {
      const item = library.getItem(id);
      expect(item, id).toBeDefined();
      active.select(item!);
      const plan = planPlacement(
        project,
        active.active()!,
        { x: 3, y: 1, z: 3 },
        { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 0 },
        (value) => library.get(value),
        item,
      );
      expect(plan.blocks).toHaveLength(expected);
    }
    expect(project).toEqual(before);
  });

  it('moves the planned bed head with player-facing yaw', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    const item = library.getItem('minecraft:red_bed')!;
    active.select(item);
    const plan = planPlacement(
      project,
      active.active()!,
      { x: 3, y: 1, z: 3 },
      { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 90 },
      (value) => library.get(value),
      item,
    );
    expect(plan.blocks.find((block) => block.state['part'] === 'foot')?.state['facing']).toBe(
      'west',
    );
    expect(plan.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({
      x: 2,
      y: 1,
      z: 3,
    });
  });

  it('plans contextual wall variants', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    const item = library.getItem('minecraft:torch')!;
    active.select(item);
    const plan = planPlacement(
      project,
      active.active()!,
      { x: 3, y: 1, z: 3 },
      { faceNormal: { x: 1, y: 0, z: 0 }, yaw: 0 },
      (value) => library.get(value),
      item,
    );
    expect(plan.blocks[0]?.id).toBe('minecraft:wall_torch');
  });

  it('keeps known content resolved when placement confidence is unknown', () => {
    const active = new ActiveBlockService();
    active.set({ id: 'minecraft:stone', state: {}, support: 'unknown' });
    const library = new BlockLibraryService(active);
    const request = placementRequestForActive(
      active.active()!,
      { x: 1, y: 1, z: 1 },
      undefined,
      undefined,
      (id) => library.get(id),
    );
    expect(request.kind).toBe('resolved');
    expect(request.id).toBe('minecraft:stone');
  });

  it('returns deterministic valid status for ordinary direct-placement blocks', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    active.select(library.getItem('minecraft:stone')!);
    const plan = planPlacement(
      project,
      active.active()!,
      { x: 1, y: 1, z: 1 },
      { faceNormal: { x: 0, y: 1, z: 0 } },
      (id) => library.get(id),
      library.getItem('minecraft:stone'),
    );
    expect(plan.validation).toMatchObject({ status: 'valid', reason: 'ok' });
  });

  it('covers ordinary vanilla direct placement and support-dependent fixtures', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    library.replaceSource({
      minecraftVersion: '1.21.1',
      sourceId: 'example',
      sourceName: 'Example',
      blocks: [
        {
          id: 'minecraft:oak_planks',
          displayName: 'Oak Planks',
          defaultState: {},
          stateDefinitions: [],
          resources: { textures: [] },
          support: 'full',
          capabilities: [{ kind: 'direct-placement', evidence: 'verified' }],
        },
        {
          id: 'minecraft:oak_hanging_sign',
          displayName: 'Oak Hanging Sign',
          defaultState: { rotation: '0', attached: 'false' },
          stateDefinitions: [],
          resources: { textures: [] },
          support: 'full',
          behavior: {
            kind: 'hanging-sign',
            rotationProperty: 'rotation',
            attachedProperty: 'attached',
            wallBlockId: 'minecraft:oak_wall_hanging_sign',
          },
        },
      ],
    });
    for (const id of ['minecraft:oak_planks', 'minecraft:oak_log', 'minecraft:stone_slab']) {
      active.select(library.getItem(id)!);
      const context =
        id === 'minecraft:oak_log'
          ? { faceNormal: { x: 1, y: 0, z: 0 } }
          : { faceNormal: { x: 0, y: 1, z: 0 } };
      const result = planPlacement(
        project,
        active.active()!,
        { x: 1, y: 1, z: 1 },
        context,
        (value) => library.get(value),
        library.getItem(id),
      );
      expect(result.validation.status, id).toBe('valid');
    }
    active.select(library.getItem('minecraft:torch')!);
    expect(
      planPlacement(
        project,
        active.active()!,
        { x: 1, y: 1, z: 1 },
        { faceNormal: { x: 0, y: 1, z: 0 } },
        (id) => library.get(id),
        library.getItem('minecraft:torch'),
      ).validation.status,
    ).toBe('invalid');
    const supportedProject = {
      ...project,
      blocks: [
        {
          kind: 'resolved' as const,
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 1, y: 0, z: 1 },
          state: {},
        },
      ],
    };
    expect(
      planPlacement(
        supportedProject,
        active.active()!,
        { x: 1, y: 1, z: 1 },
        { faceNormal: { x: 0, y: 1, z: 0 } },
        (id) => library.get(id),
        library.getItem('minecraft:torch'),
      ).validation.status,
    ).toBe('valid');
    active.set({
      id: 'minecraft:lantern',
      state: { hanging: 'false', waterlogged: 'false' },
      support: 'full',
    });
    expect(
      planPlacement(
        project,
        active.active()!,
        { x: 1, y: 1, z: 1 },
        { faceNormal: { x: 0, y: 1, z: 0 } },
        (id) => library.get(id),
        library.getItem('minecraft:lantern'),
      ).validation.status,
    ).toBe('invalid');
    active.set({
      id: 'minecraft:oak_hanging_sign',
      state: { rotation: '0', attached: 'false' },
      support: 'full',
    });
    const hangingSupport = {
      ...project,
      blocks: [
        {
          kind: 'resolved' as const,
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 1, y: 2, z: 1 },
          state: {},
        },
      ],
    };
    expect(
      planPlacement(
        hangingSupport,
        active.active()!,
        { x: 1, y: 1, z: 1 },
        { faceNormal: { x: 0, y: -1, z: 0 } },
        (id) => library.get(id),
      ).validation.status,
    ).toBe('valid');
  });

  it('keeps unsupported external placement unknown instead of treating it as missing content', () => {
    const active = new ActiveBlockService();
    const library = new BlockLibraryService(active);
    library.replaceSource({
      minecraftVersion: '1.21.1',
      sourceId: 'external',
      sourceName: 'External',
      blocks: [
        {
          id: 'example:unknown',
          displayName: 'Unknown',
          defaultState: {},
          stateDefinitions: [],
          resources: { textures: [] },
          support: 'full',
        },
      ],
    });
    active.select(library.getItem('example:unknown')!);
    const plan = planPlacement(
      project,
      active.active()!,
      { x: 1, y: 1, z: 1 },
      undefined,
      (id) => library.get(id),
      library.getItem('example:unknown'),
    );
    expect(plan.request.kind).toBe('resolved');
    expect(plan.validation.status).toBe('unknown');
  });
});

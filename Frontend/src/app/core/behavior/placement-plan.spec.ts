import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../blocks/active-block.service';
import { BlockLibraryService } from '../blocks/block-library.service';
import { ProjectDocument } from '../domain/project.types';
import { planPlacement } from './placement-plan';
import { buildPlaceableItems } from '../blocks/placeable-item';
import { BlockCatalog } from '../blocks/block-catalog';
import { representativeBlockFixture } from '../blocks/block-catalog.fixture';

const project: ProjectDocument = { schemaVersion: 2, id: 'plan', metadata: { name: 'Plan', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };

describe('placement plans', () => {
  it('has fixture logical items', () => { const catalog = new BlockCatalog(); catalog.load(representativeBlockFixture); expect(buildPlaceableItems(catalog.all()).map((item) => item.itemId)).toContain('minecraft:red_bed'); });
  it('plans complete bed, door and tall-plant footprints without mutating the project', () => {
    const active = new ActiveBlockService(); const library = new BlockLibraryService(active); const before = structuredClone(project);
    for (const [id, expected] of [['minecraft:red_bed', 2], ['minecraft:oak_door', 2], ['minecraft:sunflower', 2]] as const) {
      const item = library.getItem(id); expect(item, id).toBeDefined(); active.select(item!);
      const plan = planPlacement(project, active.active()!, { x: 3, y: 1, z: 3 }, { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 0 }, (value) => library.get(value), item);
      expect(plan.blocks).toHaveLength(expected);
    }
    expect(project).toEqual(before);
  });

  it('moves the planned bed head with player-facing yaw', () => {
    const active = new ActiveBlockService(); const library = new BlockLibraryService(active); const item = library.getItem('minecraft:red_bed')!; active.select(item);
    const plan = planPlacement(project, active.active()!, { x: 3, y: 1, z: 3 }, { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 90 }, (value) => library.get(value), item);
    expect(plan.blocks.find((block) => block.state['part'] === 'foot')?.state['facing']).toBe('west');
    expect(plan.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({ x: 2, y: 1, z: 3 });
  });

  it('plans contextual wall variants', () => {
    const active = new ActiveBlockService(); const library = new BlockLibraryService(active); const item = library.getItem('minecraft:torch')!; active.select(item);
    const plan = planPlacement(project, active.active()!, { x: 3, y: 1, z: 3 }, { faceNormal: { x: 1, y: 0, z: 0 }, yaw: 0 }, (value) => library.get(value), item);
    expect(plan.blocks[0]?.id).toBe('minecraft:wall_torch');
  });
});

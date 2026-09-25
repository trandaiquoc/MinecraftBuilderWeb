import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { HistoryService } from '../../editor/history/history.service';
import { SelectionService } from '../../editor/selection/selection.service';
import { StructureEditorService } from '../../editor/structure/structure-editor.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { BlockRuleEngine, minecraftPlayerFacing, minecraftSkullRotation } from './block-rule-engine';
import { VanillaAssetProvider } from '../../assets/vanilla/vanilla-asset-provider';
import { VanillaBehaviorRegistry } from '../vanilla/vanilla-behavior-registry';

const catalog = new BlockCatalog(); catalog.load(representativeBlockFixture);
const engine = new BlockRuleEngine((id) => catalog.get(id));
const base: ProjectDocument = { schemaVersion: 2, id: 'rules', metadata: { name: 'Rules', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
const block = (id: string, position: VoxelCoordinate, state?: Readonly<Record<string, string>>): PlacedBlock => ({ kind: 'resolved', id, namespace: 'minecraft', position, state: state ?? catalog.get(id)?.defaultState ?? {} });

describe('BlockRuleEngine', () => {
  it.each([[0, 'south'], [90, 'west'], [180, 'north'], [-90, 'east'], [270, 'east']] as const)('maps bed yaw %s to %s', (yaw, facing) => {
    expect(minecraftPlayerFacing(yaw)).toBe(facing);
  });
  it.each([[0, 'south'], [90, 'west'], [180, 'north'], [-90, 'east']] as const)('places Decorated Pot with player-facing yaw %s', (yaw, facing) => {
    const potDefinition = { id: 'minecraft:decorated_pot', namespace: 'minecraft', displayName: 'Decorated Pot', defaultState: { facing: 'north', waterlogged: 'false', cracked: 'false' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south', 'west', 'east'] }, { name: 'waterlogged', values: ['true', 'false'] }, { name: 'cracked', values: ['true', 'false'] }], resources: { textures: [] }, behaviorSupport: 'full' as const, visualSupport: 'real' as const, visualClassification: 'special-renderer-required' as const, defaultStateSource: 'verified-fixture' as const, support: 'full' as const, behavior: { kind: 'decorated-pot-placement' as const, facingProperty: 'facing' as const } };
    const potEngine = new BlockRuleEngine((id) => id === potDefinition.id ? potDefinition : catalog.get(id));
    const placed = potEngine.place(base, block('minecraft:decorated_pot', { x: 2, y: 1, z: 2 }, potDefinition.defaultState), { yaw }).project;
    expect(placed?.blocks[0].state).toMatchObject({ facing, cracked: 'false', waterlogged: 'false' });
  });
  it('places a Conduit in air with waterlogged=false without requiring support', () => {
    const conduitDefinition = { id: 'minecraft:conduit', namespace: 'minecraft', displayName: 'Conduit', defaultState: { waterlogged: 'true' }, stateDefinitions: [{ name: 'waterlogged', values: ['true', 'false'] }], resources: { textures: [] }, behaviorSupport: 'full' as const, visualSupport: 'real' as const, visualClassification: 'special-renderer-required' as const, defaultStateSource: 'authoritative-report' as const, support: 'full' as const, behavior: { kind: 'conduit-placement' as const, waterloggedProperty: 'waterlogged' as const } };
    const conduitEngine = new BlockRuleEngine((id) => id === conduitDefinition.id ? conduitDefinition : catalog.get(id));
    const placed = conduitEngine.place(base, block('minecraft:conduit', { x: 2, y: 6, z: 2 }, conduitDefinition.defaultState), { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 0 }).project;
    expect(placed?.blocks[0].state).toEqual({ waterlogged: 'false' });
  });
  it('adds and removes fence connections through a deduplicated refresh', () => {
    const first = engine.place(base, block('minecraft:oak_fence', { x: 2, y: 1, z: 2 })).project!;
    const second = engine.place(first, block('minecraft:oak_fence', { x: 3, y: 1, z: 2 })).project!;
    expect(second.blocks.map((entry) => entry.state)).toEqual(expect.arrayContaining([expect.objectContaining({ east: 'true' }), expect.objectContaining({ west: 'true' })]));
    const removed = engine.delete(second, { x: 3, y: 1, z: 2 }).project!;
    expect(removed.blocks[0].state['east']).toBe('false');
  });

  it('normalizes a resource-selected upper half before placing a double-height object', () => {
    const supported = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 0, z: 2 }), block('minecraft:stone', { x: 3, y: 0, z: 2 })] };
    const door = engine.place(supported, block('minecraft:oak_door', { x: 2, y: 1, z: 2 }, { ...catalog.get('minecraft:oak_door')!.defaultState, half: 'upper' }));
    expect(door.validation).toMatchObject({ status: 'valid', reason: 'ok' });
    expect(door.project?.blocks.filter((entry) => entry.id === 'minecraft:oak_door').map((entry) => entry.state['half'])).toEqual(['lower', 'upper']);
    const sunflower = engine.place(supported, block('minecraft:sunflower', { x: 3, y: 1, z: 2 }, { half: 'upper' }));
    expect(sunflower.validation).toMatchObject({ status: 'valid', reason: 'ok' });
    expect(sunflower.project?.blocks.filter((entry) => entry.id === 'minecraft:sunflower').map((entry) => entry.state['half'])).toEqual(['lower', 'upper']);
  });

  it('uses verified fence compatibility metadata for wood, nether brick, and solid blocks', () => {
    const center = block('minecraft:oak_fence', { x: 3, y: 1, z: 3 });
    const refreshed = engine.refresh({ ...base, blocks: [
      center,
      block('minecraft:spruce_fence', { x: 3, y: 1, z: 2 }),
      block('minecraft:nether_brick_fence', { x: 4, y: 1, z: 3 }),
      block('minecraft:stone', { x: 3, y: 1, z: 4 }),
    ] }, [center.position]).project!;
    expect(refreshed.blocks[0].state).toMatchObject({ north: 'true', east: 'false', south: 'true', west: 'false' });
  });

  it('connects panes and bars in the shared verified family', () => {
    const pane = engine.place(base, block('minecraft:glass_pane', { x: 2, y: 1, z: 2 })).project!;
    const bars = engine.place(pane, block('minecraft:iron_bars', { x: 2, y: 1, z: 1 })).project!;
    expect(bars.blocks.find((entry) => entry.id === 'minecraft:glass_pane')?.state['north']).toBe('true');
    expect(bars.blocks.find((entry) => entry.id === 'minecraft:iron_bars')?.state['south']).toBe('true');
  });

  it('connects a pane in four directions to panes, bars, and solid blocks', () => {
    const center = block('minecraft:glass_pane', { x: 3, y: 1, z: 3 });
    const refreshed = engine.refresh({ ...base, blocks: [center,
      block('minecraft:glass_pane', { x: 3, y: 1, z: 2 }), block('minecraft:iron_bars', { x: 4, y: 1, z: 3 }),
      block('minecraft:stone', { x: 3, y: 1, z: 4 }), block('minecraft:glass_pane', { x: 2, y: 1, z: 3 }),
    ] }, [center.position]).project!;
    expect(refreshed.blocks[0].state).toMatchObject({ north: 'true', east: 'true', south: 'true', west: 'true' });
    const removed = engine.delete(refreshed, { x: 3, y: 1, z: 2 }).project!;
    expect(removed.blocks[0].state['north']).toBe('false');
  });

  it('computes verified wall none/low connections', () => {
    const wall = engine.place(base, block('minecraft:cobblestone_wall', { x: 2, y: 1, z: 2 })).project!;
    const connected = engine.place(wall, block('minecraft:stone', { x: 3, y: 1, z: 2 })).project!;
    const state = connected.blocks.find((entry) => entry.id === 'minecraft:cobblestone_wall')!.state;
    expect(state['east']).toBe('low'); expect(state['west']).toBe('none'); expect(state['up']).toBe('true');
  });

  it.each([
    ['isolated', [], { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' }],
    ['one', ['north'], { north: 'low', east: 'none', south: 'none', west: 'none', up: 'true' }],
    ['corner', ['south', 'west'], { north: 'none', east: 'none', south: 'low', west: 'low', up: 'true' }],
    ['tee', ['north', 'south', 'west'], { north: 'low', east: 'none', south: 'low', west: 'low', up: 'true' }],
    ['cross', ['north', 'east', 'south', 'west'], { north: 'low', east: 'low', south: 'low', west: 'low', up: 'false' }],
  ] as const)('matches the golden wall %s state', (_name, directions, expected) => {
    const center = block('minecraft:cobblestone_wall', { x: 3, y: 1, z: 3 });
    const offsets: Record<string, VoxelCoordinate> = { north: { x: 3, y: 1, z: 2 }, east: { x: 4, y: 1, z: 3 }, south: { x: 3, y: 1, z: 4 }, west: { x: 2, y: 1, z: 3 } };
    const refreshed = engine.refresh({ ...base, blocks: [center, ...directions.map((direction) => block('minecraft:cobblestone_wall', offsets[direction]))] }, [center.position]).project!;
    expect(refreshed.blocks[0].state).toMatchObject(expected);
  });

  it('promotes cross-wall sides to tall under a solid block and restores them after delete', () => {
    const center = block('minecraft:cobblestone_wall', { x: 3, y: 1, z: 3 });
    const walls = [{ x: 3, y: 1, z: 2 }, { x: 4, y: 1, z: 3 }, { x: 3, y: 1, z: 4 }, { x: 2, y: 1, z: 3 }].map((position) => block('minecraft:cobblestone_wall', position));
    const upper = block('minecraft:stone', { x: 3, y: 2, z: 3 });
    const tall = engine.refresh({ ...base, blocks: [center, ...walls, upper] }, [center.position, upper.position]).project!;
    expect(tall.blocks[0].state).toMatchObject({ north: 'tall', east: 'tall', south: 'tall', west: 'tall', up: 'false' });
    const removed = engine.delete(tall, upper.position).project!;
    expect(removed.blocks[0].state).toMatchObject({ north: 'low', east: 'low', south: 'low', west: 'low', up: 'false' });
  });

  it('recomputes stair outer shape and preserves unrelated state', () => {
    const current = block('minecraft:oak_stairs', { x: 2, y: 1, z: 2 }, { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'true' });
    const front = block('minecraft:oak_stairs', { x: 2, y: 1, z: 1 }, { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: 'false' });
    const refreshed = engine.refresh({ ...base, blocks: [current, front] }, [current.position, front.position]).project!;
    expect(refreshed.blocks[0].state['shape']).toBe('outer_left'); expect(refreshed.blocks[0].state['waterlogged']).toBe('true');
    const deleted = engine.delete(refreshed, front.position).project!; expect(deleted.blocks[0].state['shape']).toBe('straight');
  });

  it('recomputes a verified inner stair corner', () => {
    const current = block('minecraft:oak_stairs', { x: 2, y: 1, z: 2 }, { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' });
    const back = block('minecraft:oak_stairs', { x: 2, y: 1, z: 3 }, { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: 'false' });
    const refreshed = engine.refresh({ ...base, blocks: [current, back] }, [current.position, back.position]).project!;
    expect(refreshed.blocks[0].state['shape']).toBe('inner_left');
  });

  it.each([
    [{ x: 2, y: 1, z: 1 }, 'west', 'outer_left'],
    [{ x: 2, y: 1, z: 1 }, 'east', 'outer_right'],
    [{ x: 2, y: 1, z: 3 }, 'west', 'inner_left'],
    [{ x: 2, y: 1, z: 3 }, 'east', 'inner_right'],
  ] as const)('derives stair corner %s/%s as %s', (neighborPosition, neighborFacing, expected) => {
    const current = block('minecraft:oak_stairs', { x: 2, y: 1, z: 2 }, { facing: 'north', half: 'top', shape: 'straight', waterlogged: 'true' });
    const neighbor = block('minecraft:oak_stairs', neighborPosition, { facing: neighborFacing, half: 'top', shape: 'straight', waterlogged: 'false' });
    const refreshed = engine.refresh({ ...base, blocks: [current, neighbor] }, [current.position, neighbor.position]).project!;
    expect(refreshed.blocks[0].state).toMatchObject({ shape: expected, half: 'top', waterlogged: 'true' });
  });

  it('derives stair top/bottom from the clicked face and side hit height', () => {
    const top = engine.place(base, block('minecraft:oak_stairs', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 0, y: -1, z: 0 } }).project!;
    expect(top.blocks[0].state['half']).toBe('top');
    const sideTop = engine.place(base, block('minecraft:oak_stairs', { x: 3, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 }, hitPoint: { x: 3, y: 1.75, z: 2.5 } }).project!;
    expect(sideTop.blocks[0].state['half']).toBe('top');
    const bottom = engine.place(base, block('minecraft:oak_stairs', { x: 4, y: 1, z: 2 }), { faceNormal: { x: 0, y: 1, z: 0 } }).project!;
    expect(bottom.blocks[0].state['half']).toBe('bottom');
  });

  it('returns deterministic support and unknown validation', () => {
    const unsupported = engine.place(base, block('minecraft:wall_torch', { x: 2, y: 1, z: 2 }, { facing: 'east' }));
    expect(unsupported.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    const supportedProject = { ...base, blocks: [block('minecraft:stone', { x: 1, y: 1, z: 2 })] };
    expect(engine.place(supportedProject, block('minecraft:wall_torch', { x: 2, y: 1, z: 2 }, { facing: 'east' })).validation.status).toBe('valid');
    expect(engine.place(base, block('example:missing_renderer', { x: 1, y: 1, z: 1 })).validation).toMatchObject({ status: 'unknown', reason: 'unknown-behavior' });
  });

  it('uses verified generic support contracts without requiring solid behavior', () => {
    const supportDefinition = { id: 'example:soil', namespace: 'example', displayName: 'Soil', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'partial' as const, behaviorSupport: 'full' as const, visualSupport: 'partial' as const, visualClassification: 'standard-json' as const, defaultStateSource: 'verified-fixture' as const, supportContracts: ['plantable-soil'] };
    const plantDefinition = { id: 'example:plant', namespace: 'example', displayName: 'Plant', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'partial' as const, behaviorSupport: 'full' as const, visualSupport: 'partial' as const, visualClassification: 'standard-json' as const, defaultStateSource: 'verified-fixture' as const, behavior: { kind: 'floor-supported' as const }, supportRequirements: [{ direction: 'below' as const, contractId: 'plantable-soil', evidence: 'verified' as const }] };
    const contractEngine = new BlockRuleEngine((id) => id === supportDefinition.id ? supportDefinition : id === plantDefinition.id ? plantDefinition : catalog.get(id));
    const soil = block(supportDefinition.id, { x: 2, y: 0, z: 2 });
    expect(contractEngine.place({ ...base, blocks: [soil] }, block(plantDefinition.id, { x: 2, y: 1, z: 2 })).validation.status).toBe('valid');
    const unrelated = { ...soil, id: 'example:other-soil', namespace: 'example' };
    const unknownEngine = new BlockRuleEngine((id) => id === supportDefinition.id ? supportDefinition : id === plantDefinition.id ? plantDefinition : id === unrelated.id ? { ...supportDefinition, id: unrelated.id, supportContracts: ['other'] } : catalog.get(id));
    expect(unknownEngine.place({ ...base, blocks: [unrelated] }, block(plantDefinition.id, { x: 2, y: 1, z: 2 })).validation.status).toBe('invalid');
    const noMetadata = { ...supportDefinition, id: 'example:unverified-soil', supportContracts: undefined };
    const honestEngine = new BlockRuleEngine((id) => id === noMetadata.id ? noMetadata : id === plantDefinition.id ? plantDefinition : catalog.get(id));
    expect(honestEngine.place({ ...base, blocks: [block(noMetadata.id, { x: 2, y: 0, z: 2 })] }, block(plantDefinition.id, { x: 2, y: 1, z: 2 })).validation.status).toBe('unknown');
  });

  it('accepts verified direct-placement blocks and derives a trusted pillar axis from the clicked face', () => {
    for (const id of ['minecraft:stone', 'minecraft:stone_slab', 'minecraft:white_carpet', 'minecraft:oak_log']) {
      const result = engine.place(base, block(id, { x: 2, y: 1, z: 2 }), { faceNormal: { x: 0, y: 1, z: 0 } });
      expect(result.validation.status, id).toBe('valid');
    }
    expect(engine.place(base, block('minecraft:oak_log', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 } }).project?.blocks[0].state['axis']).toBe('x');
    expect(engine.place(base, block('minecraft:oak_log', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 0, y: 0, z: -1 } }).project?.blocks[0].state['axis']).toBe('z');
    expect(engine.place(base, block('minecraft:oak_log', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 0, y: 1, z: 0 } }).project?.blocks[0].state['axis']).toBe('y');
    expect(engine.place(base, block('example:unknown', { x: 2, y: 1, z: 2 })).validation.status).toBe('unknown');
  });

  it('places and deletes door and tall plant pairs atomically', () => {
    const supported = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 0, z: 2 })] };
    const door = engine.place(supported, block('minecraft:oak_door', { x: 2, y: 1, z: 2 })).project!;
    expect(door.blocks.filter((entry) => entry.id === 'minecraft:oak_door').map((entry) => entry.state['half'])).toEqual(['lower', 'upper']);
    expect(engine.delete(door, { x: 2, y: 2, z: 2 }).project!.blocks.some((entry) => entry.id === 'minecraft:oak_door')).toBe(false);
    const plant = engine.place(supported, block('minecraft:sunflower', { x: 2, y: 1, z: 2 })).project!;
    expect(plant.blocks.filter((entry) => entry.id === 'minecraft:sunflower')).toHaveLength(2);
    expect(engine.delete(plant, { x: 2, y: 2, z: 2 }).project!.blocks.some((entry) => entry.id === 'minecraft:sunflower')).toBe(false);
    expect(engine.place({ ...supported, size: { x: 8, y: 2, z: 8 } }, block('minecraft:sunflower', { x: 2, y: 1, z: 2 })).project).toBeUndefined();
    const collision = { ...supported, blocks: [...supported.blocks, block('minecraft:stone', { x: 2, y: 2, z: 2 })] };
    expect(engine.place(collision, block('minecraft:oak_door', { x: 2, y: 1, z: 2 })).validation.reason).toBe('occupied');
  });

  it.each([
    ['north', { x: 3, y: 1, z: 2 }], ['east', { x: 4, y: 1, z: 3 }],
    ['south', { x: 3, y: 1, z: 4 }], ['west', { x: 2, y: 1, z: 3 }],
  ] as const)('places and deletes an atomic bed facing %s', (facing, headPosition) => {
    const result = engine.place(base, block('minecraft:red_bed', { x: 3, y: 1, z: 3 }, { facing, part: 'foot', occupied: 'false' }));
    expect(result.validation.status).toBe('valid');
    const bed = result.project!.blocks;
    expect(bed).toHaveLength(2);
    expect(bed.find((entry) => entry.state['part'] === 'head')?.position).toEqual(headPosition);
    expect(bed.every((entry) => entry.state['occupied'] === 'false' && entry.state['facing'] === facing)).toBe(true);
    expect(engine.delete(result.project!, headPosition).project!.blocks).toHaveLength(0);
  });

  it.each([[0, 'south', { x: 3, y: 1, z: 4 }], [90, 'west', { x: 2, y: 1, z: 3 }], [180, 'north', { x: 3, y: 1, z: 2 }], [-90, 'east', { x: 4, y: 1, z: 3 }]] as const)('derives bed placement from player yaw %s', (yaw, facing, headPosition) => {
    const result = engine.place(base, block('minecraft:red_bed', { x: 3, y: 1, z: 3 }, { facing: 'north', part: 'foot', occupied: 'true' }), { faceNormal: { x: 0, y: 1, z: 0 }, yaw });
    expect(result.validation.status).toBe('valid');
    expect(result.project?.blocks.find((entry) => entry.state['part'] === 'head')).toMatchObject({ position: headPosition, state: { facing, occupied: 'false' } });
  });

  it('rejects a bed when its head target is occupied or outside bounds', () => {
    const occupied = { ...base, blocks: [block('minecraft:stone', { x: 3, y: 1, z: 2 })] };
    expect(engine.place(occupied, block('minecraft:red_bed', { x: 3, y: 1, z: 3 })).validation.reason).toBe('occupied');
    expect(engine.place(base, block('minecraft:red_bed', { x: 0, y: 1, z: 0 }, { facing: 'north', part: 'foot', occupied: 'false' })).validation.reason).toBe('out-of-bounds');
  });

  it('forces new bed placement to unoccupied while imported state remains untouched', () => {
    const placed = engine.place(base, block('minecraft:red_bed', { x: 3, y: 1, z: 3 }, { facing: 'north', part: 'foot', occupied: 'true' })).project!;
    expect(placed.blocks.every((entry) => entry.state['occupied'] === 'false')).toBe(true);
    const imported = block('minecraft:red_bed', { x: 1, y: 1, z: 1 }, { facing: 'east', part: 'foot', occupied: 'true' });
    expect(engine.refresh({ ...base, blocks: [imported] }, [imported.position]).project!.blocks[0].state['occupied']).toBe('true');
  });

  it('places standing and wall torch variants with verified support', () => {
    const support = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 0, z: 2 }), block('minecraft:stone', { x: 3, y: 1, z: 2 })] };
    const standing = engine.place(support, block('minecraft:torch', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 0, y: 1, z: 0 } });
    expect(standing.validation.status).toBe('valid'); expect(standing.project?.blocks.at(-1)?.id).toBe('minecraft:torch');
    const wall = engine.place(support, block('minecraft:torch', { x: 4, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(wall.validation.status).toBe('valid'); expect(wall.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:wall_torch', state: { facing: 'east' } });
    const directWall = engine.place(support, block('minecraft:wall_torch', { x: 4, y: 1, z: 2 }, { facing: 'north' }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(directWall.validation.status).toBe('valid'); expect(directWall.project?.blocks.at(-1)?.state['facing']).toBe('east');
    expect(engine.place(base, block('minecraft:torch', { x: 4, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 } }).validation.reason).toBe('missing-support');
  });

  it('places a standing head above another head without requiring floor support', () => {
    const existing = block('minecraft:skeleton_skull', { x: 2, y: 1, z: 2 }, { rotation: '0' });
    const result = engine.place({ ...base, blocks: [existing] }, block('minecraft:skeleton_skull', { x: 2, y: 2, z: 2 }), { faceNormal: { x: 0, y: 1, z: 0 }, yaw: 90 });
    expect(result.validation.status).toBe('valid');
    expect(result.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:skeleton_skull', position: { x: 2, y: 2, z: 2 }, state: { rotation: '4' } });
  });

  it('uses the vanilla direct-yaw rotation mapping for standing skulls', () => {
    expect([0, 90, 180, -90, 270].map(minecraftSkullRotation)).toEqual(['0', '4', '8', '12', '12']);
  });

  it('orients wall skull placement from the clicked wall face', () => {
    const result = engine.place(base, block('minecraft:skeleton_wall_skull', { x: 2, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(result.validation.status).toBe('valid');
    expect(result.project?.blocks[0].state['facing']).toBe('east');
  });

  it('derives Shulker Box facing directly from each clicked face without support rules', () => {
    const behavior = new VanillaBehaviorRegistry().enrich({ id: 'minecraft:shulker_box', displayName: 'Shulker Box', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'fallback', visualSupport: 'fallback', behaviorSupport: 'unknown', defaultStateSource: 'unknown' });
    const shulkerEngine = new BlockRuleEngine((id) => id === behavior.id ? {
      ...behavior, namespace: 'minecraft', support: 'full', visualSupport: 'partial', visualClassification: 'special-renderer-required', behaviorSupport: 'full', defaultStateSource: 'verified-fixture',
    } : catalog.get(id));
    const cases = [
      [{ x: 0, y: 1, z: 0 }, 'up'], [{ x: 0, y: -1, z: 0 }, 'down'], [{ x: 1, y: 0, z: 0 }, 'east'],
      [{ x: -1, y: 0, z: 0 }, 'west'], [{ x: 0, y: 0, z: 1 }, 'south'], [{ x: 0, y: 0, z: -1 }, 'north'],
    ] as const;
    for (const [faceNormal, facing] of cases) {
      const result = shulkerEngine.place(base, block('minecraft:shulker_box', { x: 2, y: 2, z: 2 }, { facing: 'up', waterlogged: 'true' }), { faceNormal });
      expect(result.validation.status, facing).toBe('valid');
      expect(result.project?.blocks[0].state, facing).toMatchObject({ facing, waterlogged: 'true' });
    }
  });

  it('preserves unsupported standing torch and tall plant data while reporting invalid', () => {
    const support = block('minecraft:stone', { x: 2, y: 0, z: 2 });
    const torch = block('minecraft:torch', { x: 2, y: 1, z: 2 });
    const torchResult = engine.delete({ ...base, blocks: [support, torch] }, support.position);
    expect(torchResult.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    expect(torchResult.project?.blocks).toEqual([torch]);
    const plant = [block('minecraft:sunflower', { x: 2, y: 1, z: 2 }, { half: 'lower' }), block('minecraft:sunflower', { x: 2, y: 2, z: 2 }, { half: 'upper' })];
    const plantResult = engine.delete({ ...base, blocks: [support, ...plant] }, support.position);
    expect(plantResult.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    expect(plantResult.project?.blocks).toHaveLength(2);
  });

  it('preserves a wall-mounted block and reports invalid when support is deleted', () => {
    const support = block('minecraft:stone', { x: 1, y: 1, z: 2 });
    const torch = block('minecraft:wall_torch', { x: 2, y: 1, z: 2 }, { facing: 'east' });
    const result = engine.delete({ ...base, blocks: [support, torch] }, support.position);
    expect(result.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    expect(result.project?.blocks).toEqual([torch]);
  });

  it('places standing and chain-hanging lanterns with canonical hanging state', () => {
    const support = { ...base, blocks: [block('minecraft:stone', { x: 2, y: 0, z: 2 })] };
    const standing = engine.place(support, block('minecraft:lantern', { x: 2, y: 1, z: 2 }));
    expect(standing.validation).toMatchObject({ status: 'valid' });
    expect(standing.project?.blocks.at(-1)?.state['hanging']).toBe('false');

    const chain = engine.place(base, block('minecraft:chain', { x: 2, y: 2, z: 2 })).project!;
    const hanging = engine.place(chain, block('minecraft:lantern', { x: 2, y: 1, z: 2 }));
    expect(hanging.validation).toMatchObject({ status: 'valid' });
    expect(hanging.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:lantern', state: { hanging: 'true' } });
  });

  it('rejects unsupported lantern placement and preserves hanging lantern after chain removal', () => {
    const unsupported = engine.place(base, block('minecraft:lantern', { x: 2, y: 1, z: 2 }));
    expect(unsupported.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    const chain = engine.place(base, block('minecraft:chain', { x: 2, y: 2, z: 2 })).project!;
    const placed = engine.place(chain, block('minecraft:lantern', { x: 2, y: 1, z: 2 })).project!;
    const removed = engine.delete(placed, { x: 2, y: 2, z: 2 });
    expect(removed.validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
    expect(removed.project?.blocks).toHaveLength(1);
    expect(removed.project?.blocks[0].state['hanging']).toBe('true');
  });

  it('rejects a neighbor-derived update on a locked block', () => {
    const locked: ProjectDocument = { ...base, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [block('minecraft:oak_fence', { x: 2, y: 1, z: 2 })].map((entry) => ({ ...entry, groupIds: ['locked'] })) };
    expect(engine.place(locked, block('minecraft:oak_fence', { x: 3, y: 1, z: 2 })).validation.reason).toBe('locked-affected-block');
  });

  it('records direct placement and derived neighbor changes as one history entry', () => {
    const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(active);
    workspace.project.set({ ...base, blocks: [block('minecraft:oak_fence', { x: 2, y: 1, z: 2 })] }); active.select(library.get('minecraft:oak_fence')!);
    const editor = new StructureEditorService(workspace, active, selection, history, library);
    expect(editor.place({ x: 3, y: 1, z: 2 })).toBe(true); expect(workspace.project()!.blocks[0].state['east']).toBe('true');
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(1); expect(workspace.project()!.blocks[0].state['east']).toBe('false');
    expect(history.undo()).toBe(false);
  });

  it('places and deletes a door pair as one history transaction each', () => {
    const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(active);
    workspace.project.set({ ...base, blocks: [block('minecraft:stone', { x: 2, y: 0, z: 2 })] }); active.select(library.get('minecraft:oak_door')!);
    const editor = new StructureEditorService(workspace, active, selection, history, library);
    expect(editor.place({ x: 2, y: 1, z: 2 })).toBe(true); expect(workspace.project()!.blocks).toHaveLength(3);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(1); expect(history.redo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(3);
    history.clear(); expect(editor.delete({ x: 2, y: 2, z: 2 })).toBe(true); expect(workspace.project()!.blocks).toHaveLength(1);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(3); expect(history.undo()).toBe(false);
  });

  it('preserves verified behavior after a generated JAR catalog replaces the fixture', () => {
    const provider = generatedBehaviorProvider();
    const generated = new BlockCatalog(); generated.load(provider.catalog());
    const generatedEngine = new BlockRuleEngine((id) => generated.get(id));
    const generatedBlock = (id: string, position: VoxelCoordinate): PlacedBlock => ({ kind: 'resolved', id, namespace: 'minecraft', position, state: generated.get(id)?.defaultState ?? {} });
    const supported = { ...base, blocks: [generatedBlock('minecraft:stone', { x: 2, y: 0, z: 2 })] };

    const firstFence = generatedEngine.place(supported, generatedBlock('minecraft:oak_fence', { x: 2, y: 1, z: 2 })).project!;
    const connected = generatedEngine.place(firstFence, generatedBlock('minecraft:spruce_fence', { x: 3, y: 1, z: 2 })).project!;
    expect(connected.blocks.find((entry) => entry.id === 'minecraft:oak_fence')?.state['east']).toBe('true');
    expect(connected.blocks.find((entry) => entry.id === 'minecraft:spruce_fence')?.state['west']).toBe('true');
    const incompatible = generatedEngine.place(connected, generatedBlock('minecraft:nether_brick_fence', { x: 1, y: 1, z: 2 })).project!;
    expect(incompatible.blocks.find((entry) => entry.id === 'minecraft:oak_fence')?.state['west']).toBe('false');
    const disconnected = generatedEngine.delete(incompatible, { x: 3, y: 1, z: 2 }).project!;
    expect(disconnected.blocks.find((entry) => entry.id === 'minecraft:oak_fence')?.state['east']).toBe('false');

    const wall = generatedEngine.place(base, generatedBlock('minecraft:cobblestone_wall', { x: 2, y: 1, z: 2 })).project!;
    const wallConnected = generatedEngine.place(wall, generatedBlock('minecraft:stone', { x: 3, y: 1, z: 2 })).project!;
    expect(wallConnected.blocks.find((entry) => entry.id === 'minecraft:cobblestone_wall')?.state).toMatchObject({ east: 'low', up: 'true' });
    const pane = generatedEngine.place(base, generatedBlock('minecraft:glass_pane', { x: 2, y: 1, z: 2 })).project!;
    const bars = generatedEngine.place(pane, generatedBlock('minecraft:iron_bars', { x: 2, y: 1, z: 1 })).project!;
    expect(bars.blocks.find((entry) => entry.id === 'minecraft:glass_pane')?.state['north']).toBe('true');
    const stair = generatedBlock('minecraft:oak_stairs', { x: 2, y: 1, z: 2 });
    expect(generatedEngine.refresh({ ...base, blocks: [stair] }, [stair.position]).project?.blocks[0].state).toMatchObject({ shape: 'straight', waterlogged: 'false' });

    const door = generatedEngine.place(supported, generatedBlock('minecraft:oak_door', { x: 2, y: 1, z: 2 }));
    expect(door.project?.blocks.filter((entry) => entry.id === 'minecraft:oak_door')).toHaveLength(2);
    const sunflower = generatedEngine.place(supported, generatedBlock('minecraft:sunflower', { x: 2, y: 1, z: 2 }));
    expect(sunflower.project?.blocks.filter((entry) => entry.id === 'minecraft:sunflower')).toHaveLength(2);

    const wallSupport = { ...base, blocks: [generatedBlock('minecraft:stone', { x: 2, y: 1, z: 2 })] };
    const wallTorch = generatedEngine.place(wallSupport, generatedBlock('minecraft:torch', { x: 3, y: 1, z: 2 }), { faceNormal: { x: 1, y: 0, z: 0 } });
    expect(wallTorch.project?.blocks.at(-1)).toMatchObject({ id: 'minecraft:wall_torch', state: { facing: 'east' } });
    const bedSupport = { ...base, blocks: [generatedBlock('minecraft:red_bed', { x: 2, y: 0, z: 2 })] };
    expect(generatedEngine.place(bedSupport, generatedBlock('minecraft:dandelion', { x: 2, y: 1, z: 2 })).validation).toMatchObject({ status: 'invalid', reason: 'missing-support' });
  });

  it('places, deletes, undoes, and redoes a bed as one logical transaction', () => {
    const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(active);
    workspace.project.set(base); active.select(library.get('minecraft:red_bed')!);
    const editor = new StructureEditorService(workspace, active, selection, history, library);
    expect(editor.place({ x: 3, y: 1, z: 3 })).toBe(true); expect(workspace.project()!.blocks).toHaveLength(2);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(0);
    expect(history.redo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(2);
    history.clear(); expect(editor.delete({ x: 3, y: 1, z: 2 })).toBe(true); expect(workspace.project()!.blocks).toHaveLength(0);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(2); expect(history.undo()).toBe(false);
  });

  it('synchronizes editable door state without overwriting each half identity', () => {
    const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(active);
    const lower = block('minecraft:oak_door', { x: 2, y: 1, z: 2 }, { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' });
    const upper = block('minecraft:oak_door', { x: 2, y: 2, z: 2 }, { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' });
    workspace.project.set({ ...base, blocks: [lower, upper] }); const editor = new StructureEditorService(workspace, active, selection, history, library);
    expect(editor.updateBlockState(lower.position, 'facing', 'east')).toBe(true);
    expect(workspace.project()!.blocks.map((entry) => entry.state['facing'])).toEqual(['east', 'east']);
    expect(workspace.project()!.blocks.map((entry) => entry.state['half'])).toEqual(['lower', 'upper']);
    expect(editor.updateBlockState(upper.position, 'open', 'true')).toBe(true);
    expect(workspace.project()!.blocks.map((entry) => entry.state['open'])).toEqual(['true', 'true']);
  });
});

function generatedBehaviorProvider(): VanillaAssetProvider {
  const blockstates = Object.fromEntries(['stone', 'oak_fence', 'spruce_fence', 'nether_brick_fence', 'cobblestone_wall', 'glass_pane', 'iron_bars', 'oak_stairs', 'oak_door', 'sunflower', 'red_bed', 'torch', 'wall_torch', 'dandelion'].map((name) => [`assets/minecraft/blockstates/${name}.json`, { variants: {} }]));
  return new VanillaAssetProvider('generated.jar', {
    'assets/minecraft/lang/en_us.json': {}, ...blockstates,
    'data/minecraft/tags/block/fences.json': { values: ['#minecraft:wooden_fences', 'minecraft:nether_brick_fence'] },
    'data/minecraft/tags/block/wooden_fences.json': { values: ['minecraft:oak_fence', 'minecraft:spruce_fence'] },
    'data/minecraft/tags/block/walls.json': { values: ['minecraft:cobblestone_wall'] },
    'data/minecraft/tags/block/stairs.json': { values: ['minecraft:oak_stairs'] },
    'data/minecraft/tags/block/doors.json': { values: ['minecraft:oak_door'] },
    'data/minecraft/tags/block/tall_flowers.json': { values: ['minecraft:sunflower'] },
    'data/minecraft/tags/block/beds.json': { values: ['minecraft:red_bed'] },
    'data/minecraft/tags/block/small_flowers.json': { values: ['minecraft:dandelion'] },
  }, new Map());
}

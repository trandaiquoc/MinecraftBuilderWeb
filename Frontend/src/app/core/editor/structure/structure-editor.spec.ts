import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { isSignId, signLines, StructureEditorService } from './structure-editor.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { rendererBenchmarkProject } from '../../renderer/benchmark/renderer-benchmark-fixtures';
import type { ItemStackData } from '../../items/item-stack.types';
import { ProjectMutationHintService } from '../mutations/project-mutation-hint.service';

function makeEditor(project: ProjectDocument): { editor: StructureEditorService; workspace: WorkspaceStateService; history: HistoryService; selection: SelectionService; library: BlockLibraryService; active: ActiveBlockService; hints: ProjectMutationHintService } {
  const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const hints = new ProjectMutationHintService(); const history = new HistoryService(workspace, hints); const library = new BlockLibraryService(active);
  workspace.project.set(project); return { editor: new StructureEditorService(workspace, active, selection, history, library), workspace, history, selection, library, active, hints };
}

const project: ProjectDocument = { schemaVersion: 1, id: 'editor', metadata: { name: 'Editor', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [{ kind: 'resolved', id: 'minecraft:oak_stairs', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } }], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };

describe('StructureEditorService mutations', () => {
  it('records wall and fence neighbor state changes as exact bounded deltas', () => {
    const wallA: PlacedBlock = { kind: 'resolved', id: 'minecraft:cobblestone_wall', namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true', waterlogged: 'false' } };
    const wallProject = { ...project, blocks: [wallA] };
    const wall = makeEditor(wallProject); wall.active.select(wall.library.get('minecraft:cobblestone_wall')!);
    expect(wall.editor.place({ x: 3, y: 1, z: 2 })).toBe(true);
    const wallHint = wall.hints.consume(wall.workspace.project(), 'test')!;
    expect(wallHint.changes.map((change) => `${change.position.x},${change.position.y},${change.position.z}`)).toEqual(expect.arrayContaining(['2,1,2', '3,1,2']));
    expect(wallHint.changes.find((change) => change.position.x === 2)?.after?.state['east']).toBe('low');
    expect(wall.history.undo()).toBe(true);
    expect(wall.workspace.project()!.blocks[0].state['east']).toBe('none');
    expect(wall.history.redo()).toBe(true);
    expect(wall.workspace.project()!.blocks.find((block) => block.position.x === 2)?.state['east']).toBe('low');

    const fenceA: PlacedBlock = { kind: 'resolved', id: 'minecraft:oak_fence', namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { north: 'false', east: 'false', south: 'false', west: 'false', waterlogged: 'false' } };
    const fenceProject = { ...project, blocks: [fenceA] };
    const fence = makeEditor(fenceProject); fence.active.select(fence.library.get('minecraft:oak_fence')!);
    expect(fence.editor.place({ x: 3, y: 1, z: 2 })).toBe(true);
    const fenceHint = fence.hints.consume(fence.workspace.project(), 'test')!;
    expect(fenceHint.changes.find((change) => change.position.x === 2)?.after?.state['east']).toBe('true');
    expect(fence.editor.delete({ x: 3, y: 1, z: 2 })).toBe(true);
    const deleteHint = fence.hints.consume(fence.workspace.project(), 'test-delete')!;
    expect(deleteHint.changes.find((change) => change.position.x === 2)?.before?.state['east']).toBe('true');
    expect(deleteHint.changes.find((change) => change.position.x === 2)?.after?.state['east']).toBe('false');
    expect(deleteHint.changes.some((change) => change.position.x === 2 && !change.before && change.after)).toBe(false);
    expect(fence.history.undo()).toBe(true);
    expect(fence.workspace.project()!.blocks.find((block) => block.position.x === 2)?.state['east']).toBe('true');
    expect(fence.history.redo()).toBe(true);
    expect(fence.workspace.project()!.blocks.find((block) => block.position.x === 2)?.state['east']).toBe('false');

    const stairCenter: PlacedBlock = { kind: 'resolved', id: 'minecraft:oak_stairs', namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'true' } };
    const stairs = makeEditor({ ...project, blocks: [stairCenter] });
    stairs.active.set({ id: 'minecraft:oak_stairs', state: { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: 'false' }, support: 'full' });
    expect(stairs.editor.place({ x: 2, y: 1, z: 1 })).toBe(true);
    const stairHint = stairs.hints.consume(stairs.workspace.project(), 'test-stairs')!;
    expect(stairHint.changes.find((change) => change.position.x === 2 && change.position.z === 2)?.after?.state['shape']).toBe('outer_left');
  });

  it('rejects negative placement coordinates without changing project or history', () => {
    const { editor, workspace, history, library, active } = makeEditor({ ...project, blocks: [] });
    active.select(library.get('minecraft:stone')!);
    const before = workspace.project();
    expect(editor.place({ x: -1, y: 0, z: 0 })).toBe(false);
    expect(editor.place({ x: 0, y: -1, z: 0 })).toBe(false);
    expect(editor.place({ x: 0, y: 0, z: -1 })).toBe(false);
    expect(workspace.project()).toBe(before); expect(history.canUndo()).toBe(false);
  });

  it('rejects a multi-block placement whose paired part crosses a lower boundary atomically', () => {
    const { editor, workspace, history, library, active } = makeEditor({ ...project, blocks: [] });
    active.select(library.get('minecraft:red_bed')!);
    const before = workspace.project();
    expect(editor.place({ x: 0, y: 0, z: 0 }, { facing: 'west' })).toBe(false);
    expect(workspace.project()).toBe(before); expect(history.canUndo()).toBe(false);
  });

  it('rotates a Bed pair atomically and moves its head from either selected part', () => {
    const bed: ProjectDocument = { ...project, blocks: [
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 3, y: 1, z: 3 }, state: { part: 'foot', facing: 'north', occupied: 'false' } },
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 3, y: 1, z: 2 }, state: { part: 'head', facing: 'north', occupied: 'false' } },
    ] };
    const { editor, workspace, history, selection, library } = makeEditor(bed);
    selection.selectLogical({ x: 3, y: 1, z: 3 }, bed, (id) => library.get(id));
    expect(editor.updateBlockState({ x: 3, y: 1, z: 3 }, 'facing', 'east')).toBe(true);
    expect(workspace.project()!.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({ x: 4, y: 1, z: 3 });
    expect(workspace.project()!.blocks.every((block) => block.state['facing'] === 'east')).toBe(true);
    selection.selectLogical({ x: 4, y: 1, z: 3 }, workspace.project()!, (id) => library.get(id));
    expect(editor.rotateBlock({ x: 4, y: 1, z: 3 })).toBe(true);
    expect(workspace.project()!.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({ x: 3, y: 1, z: 4 });
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({ x: 4, y: 1, z: 3 });
    expect(history.redo()).toBe(true); expect(workspace.project()!.blocks.find((block) => block.state['part'] === 'head')?.position).toEqual({ x: 3, y: 1, z: 4 });
  });

  it('rejects Bed rotation without partial mutation when destination is occupied', () => {
    const bed: ProjectDocument = { ...project, blocks: [
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 3, y: 1, z: 3 }, state: { part: 'foot', facing: 'north', occupied: 'false' } },
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 3, y: 1, z: 2 }, state: { part: 'head', facing: 'north', occupied: 'false' } },
      { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 4, y: 1, z: 3 }, state: {} },
    ] };
    const { editor, workspace } = makeEditor(bed); const before = structuredClone(bed);
    expect(editor.updateBlockState({ x: 3, y: 1, z: 3 }, 'facing', 'east')).toBe(false); expect(workspace.project()).toEqual(before);
  });

  it('stacks matching candles in place, preserves state and group membership, and undoes each increment', () => {
    const candle: ProjectDocument = { ...project, groups: [{ id: 'decor', name: 'Decor', visible: true, locked: false }], blocks: [{ kind: 'resolved', id: 'minecraft:white_candle', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { candles: '1', lit: 'true', waterlogged: 'true' }, groupIds: ['decor'] }] };
    const { editor, workspace, history, library, active } = makeEditor(candle);
    active.select(library.get('minecraft:white_candle')!);
    expect(editor.canStackCandle({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(editor.stackCandle({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(workspace.project()!.blocks[0].state).toEqual({ candles: '2', lit: 'true', waterlogged: 'true' });
    expect(workspace.project()!.blocks[0].groupIds).toEqual(['decor']);
    expect(editor.stackCandle({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(editor.stackCandle({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(workspace.project()!.blocks[0].state['candles']).toBe('4');
    expect(editor.canStackCandle({ x: 1, y: 1, z: 1 })).toBe(false);
    expect(editor.stackCandle({ x: 1, y: 1, z: 1 })).toBe(false);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].state['candles']).toBe('3');
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].state['candles']).toBe('2');
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].state['candles']).toBe('1');
    expect(history.redo()).toBe(true); expect(workspace.project()!.blocks[0].state['candles']).toBe('2');
  });

  it('does not stack a different candle registry id', () => {
    const candle: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'minecraft:white_candle', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { candles: '2' } }] };
    const { editor, active } = makeEditor(candle);
    active.set({ id: 'minecraft:red_candle', state: { candles: '1' }, support: 'full' });
    expect(editor.canStackCandle({ x: 1, y: 1, z: 1 })).toBe(false);
  });

  it('validates generic state options, preserves immutable state, and records rotate history', () => {
    const { editor, workspace, history } = makeEditor(project);
    expect(editor.updateBlockState({ x: 1, y: 1, z: 1 }, 'half', 'top')).toBe(true);
    expect(workspace.project()!.blocks[0].state['half']).toBe('top'); expect(project.blocks[0].state['half']).toBe('bottom');
    expect(editor.updateBlockState({ x: 1, y: 1, z: 1 }, 'half', 'invalid')).toBe(false);
    expect(editor.rotateBlock({ x: 1, y: 1, z: 1 })).toBe(true); expect(workspace.project()!.blocks[0].state['facing']).toBe('east');
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].state['half']).toBe('top');
  });

  it('edits discovered numeric and boolean state values as canonical strings with history', () => {
    const { editor, workspace, history, library, active } = makeEditor({ ...project, blocks: [] });
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{ id: 'example:widget', displayName: 'Widget', defaultState: { stage: '0', anchored: 'false' }, stateDefinitions: [{ name: 'stage', values: ['0', '1'] }, { name: 'anchored', values: ['false', 'true'] }], resources: { textures: [] }, support: 'full' }] });
    active.select(library.get('example:widget')!);
    expect(editor.place({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(editor.updateBlockState({ x: 1, y: 1, z: 1 }, 'stage', '1')).toBe(true);
    expect(editor.updateBlockState({ x: 1, y: 1, z: 1 }, 'anchored', 'true')).toBe(true);
    expect(workspace.project()!.blocks[0].state).toEqual({ stage: '1', anchored: 'true' });
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].state).toEqual({ stage: '1', anchored: 'false' });
    expect(history.redo()).toBe(true); expect(workspace.project()!.blocks[0].state).toEqual({ stage: '1', anchored: 'true' });
  });

  it('rejects delete and state changes for locked groups', () => {
    const locked = { ...project, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [{ ...project.blocks[0], groupId: 'locked' }] };
    const { editor, workspace } = makeEditor(locked);
    expect(editor.delete({ x: 1, y: 1, z: 1 })).toBe(false);
    expect(editor.updateBlockState({ x: 1, y: 1, z: 1 }, 'half', 'top')).toBe(false);
    expect(workspace.project()!.blocks).toHaveLength(1);
  });

  it('deletes a logical selection atomically and restores it through one undo', () => {
    const bed: ProjectDocument = { ...project, blocks: [
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { part: 'foot', facing: 'east' } },
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 2, y: 1, z: 1 }, state: { part: 'head', facing: 'east' } },
    ] };
    const { editor, workspace, history, selection, library } = makeEditor(bed);
    selection.selectLogical({ x: 1, y: 1, z: 1 }, bed, (id) => library.get(id));
    expect(editor.deleteSelection()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(0);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(2);
    expect(history.redo()).toBe(true); expect(workspace.project()!.blocks).toHaveLength(0);
  });

  it('selects every logical structure voxel without changing history', () => {
    const { workspace, history, selection, library } = makeEditor(project);
    selection.selectAll(workspace.project()!, (id) => library.get(id));
    expect(selection.logicalPositions()).toEqual([{ x: 1, y: 1, z: 1 }]);
    expect(history.canUndo()).toBe(false);
  });

  it('deletes and restores the 20k select-all fixture as one bulk history operation', () => {
    const stress = rendererBenchmarkProject('stress');
    const { editor, workspace, history, selection } = makeEditor(stress);
    selection.selectAll(stress, () => undefined);
    expect(selection.count(stress)).toBe(20_000);
    expect(editor.deleteSelection()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(0);
    expect(history.undo()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(20_000);
    expect(history.canUndo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(0);
    expect(history.canRedo()).toBe(false);
  }, 30_000);

  it('edits verified item-storage-display slots atomically and preserves raw fields through history', () => {
    const displayProject: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'example:display_case', namespace: 'example', position: { x: 1, y: 1, z: 1 }, state: {}, blockEntityData: { legacy: { keep: true } } }] };
    const { editor, workspace, history, library } = makeEditor(displayProject);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{ id: 'example:display_case', displayName: 'Display Case', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'item-storage-display', slotCount: 2, evidence: 'verified' }] }] });
 expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 1, { id: 'example:gem', count: 1, components: { custom: true } })).toBe(true);
    const data = workspace.project()!.blocks[0].blockEntityData as { slots: readonly { slot: number; stack?: { id: string; count: number; components?: unknown } }[]; raw?: unknown };
 expect(data.slots[1]?.stack).toEqual({ id: 'example:gem', count: 1, components: { custom: true } });
    expect(data.raw).toEqual({ legacy: { keep: true } });
    expect(history.undo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect((workspace.project()!.blocks[0].blockEntityData as typeof data).slots[1]?.stack?.id).toBe('example:gem');
  });

  it('initializes empty verified item-host slots when the block is placed', () => {
    const displayProject: ProjectDocument = { ...project, blocks: [] };
    const { editor, workspace, library, active } = makeEditor(displayProject);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{ id: 'example:display_case', displayName: 'Display Case', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'item-storage-display', slotCount: 2, evidence: 'verified' }] }] });
    active.select(library.get('example:display_case')!);
    expect(editor.place({ x: 0, y: 0, z: 0 })).toBe(true);
    const data = workspace.project()!.blocks[0].blockEntityData as { kind: string; hostKind: string; slots: readonly unknown[] };
    expect(data).toMatchObject({ kind: 'item-container', hostKind: 'item-storage-display' });
    expect(data.slots).toHaveLength(2);
  });

  it('rejects item-slot edits for storage-only and locked blocks', () => {
    const displayProject: ProjectDocument = { ...project, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [{ kind: 'resolved', id: 'example:wooden_shelf', namespace: 'example', position: { x: 1, y: 1, z: 1 }, state: {}, groupIds: ['locked'] }] };
    const { editor, workspace, library } = makeEditor(displayProject);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [
      { id: 'example:wooden_shelf', displayName: 'Wooden Shelf', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full' },
      { id: 'example:chest', displayName: 'Chest', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'inventory-storage', evidence: 'verified' }] },
    ] });
    expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 0, { id: 'minecraft:stone', count: 1 })).toBe(false);
    expect(workspace.project()!.blocks[0].blockEntityData).toBeUndefined();
  });

  it('edits verified chest inventory slots, counts, clears, and preserves raw data through history', () => {
    const chestProject: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'minecraft:chest', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {}, blockEntityData: { kind: 'item-container', hostKind: 'inventory-storage', slots: [], raw: { legacy: true } } }] };
    const { editor, workspace, history, library } = makeEditor(chestProject);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{ id: 'minecraft:chest', displayName: 'Chest', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'inventory-storage', slotCount: 27, evidence: 'verified' }] }] });
 expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 26, { id: 'minecraft:diamond', count: 1, components: { custom: true } })).toBe(true);
    let data = workspace.project()!.blocks[0].blockEntityData as { slots: readonly { slot: number; stack?: ItemStackData }[]; raw?: unknown };
    expect(data.slots[26].stack).toEqual({ id: 'minecraft:diamond', count: 1, components: { custom: true } }); expect(data.raw).toEqual({ legacy: true });
 expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 26, { id: 'minecraft:diamond', count: 1, components: { custom: true } })).toBe(true);
    expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 26, undefined)).toBe(true);
 expect(history.undo()).toBe(true); data = workspace.project()!.blocks[0].blockEntityData as typeof data; expect(data.slots[26].stack?.count).toBe(1);
    expect(history.redo()).toBe(true); expect((workspace.project()!.blocks[0].blockEntityData as typeof data).slots[26].stack).toBeUndefined();
  });

  it('initializes supported containers but rejects Furnace inventory edits', () => {
    const empty: ProjectDocument = { ...project, blocks: [] }; const { editor, workspace, library, active } = makeEditor(empty);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [
      { id: 'minecraft:chest', displayName: 'Chest', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'inventory-storage', slotCount: 27, evidence: 'verified' }] },
      { id: 'minecraft:furnace', displayName: 'Furnace', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'inventory-storage', slotCount: 3, evidence: 'verified' }] },
    ] });
    active.select(library.get('minecraft:chest')!); expect(editor.place({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(workspace.project()!.blocks[0].blockEntityData).toMatchObject({ kind: 'item-container', hostKind: 'inventory-storage', slots: expect.any(Array) });
    active.select(library.get('minecraft:furnace')!); expect(editor.place({ x: 1, y: 0, z: 0 })).toBe(true);
    expect(workspace.project()!.blocks[1].blockEntityData).toBeUndefined();
    expect(editor.setBlockItemSlot({ x: 1, y: 0, z: 0 }, 0, { id: 'minecraft:stone', count: 1 })).toBe(false);
  });

  it('edits decorated pot sherds and stored items without normalizing invalid input', () => {
    const pot: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'minecraft:decorated_pot', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {}, blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:brick', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' }, raw: { future: true } } }] };
    const { editor, workspace, history } = makeEditor(pot);
    expect(editor.updateDecoratedPotDecoration({ x: 1, y: 1, z: 1 }, 'back', 'minecraft:heart_pottery_sherd')).toBe(true);
    expect(editor.updateDecoratedPotDecoration({ x: 1, y: 1, z: 1 }, 'back', 'minecraft:not_a_sherd')).toBe(false);
    expect(editor.setDecoratedPotItem({ x: 1, y: 1, z: 1 }, { id: 'minecraft:diamond', count: 1, components: { custom: true } })).toBe(true);
    const data = workspace.project()!.blocks[0].blockEntityData as { decorations: { back: string }; item?: ItemStackData; raw?: unknown };
    expect(data.decorations.back).toBe('minecraft:heart_pottery_sherd'); expect(data.item).toEqual({ id: 'minecraft:diamond', count: 1, components: { custom: true } }); expect(data.raw).toEqual({ future: true });
    expect(history.undo()).toBe(true); expect((workspace.project()!.blocks[0].blockEntityData as typeof data).item).toBeUndefined(); expect(history.redo()).toBe(true);
  });

  it('rejects decorated pot and inventory mutations for locked memberships', () => {
    const locked: ProjectDocument = { ...project, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [
      { kind: 'resolved', id: 'minecraft:decorated_pot', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {}, groupIds: ['locked'], blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:brick', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' } } },
      { kind: 'resolved', id: 'minecraft:chest', namespace: 'minecraft', position: { x: 2, y: 1, z: 1 }, state: {}, groupIds: ['locked'], blockEntityData: { kind: 'item-container', hostKind: 'inventory-storage', slots: [] } },
    ] };
    const { editor } = makeEditor(locked);
    expect(editor.updateDecoratedPotDecoration({ x: 1, y: 1, z: 1 }, 'front', 'minecraft:heart_pottery_sherd')).toBe(false);
    expect(editor.setDecoratedPotItem({ x: 1, y: 1, z: 1 }, { id: 'minecraft:stone', count: 1 })).toBe(false);
    expect(editor.setBlockItemSlot({ x: 2, y: 1, z: 1 }, 0, { id: 'minecraft:stone', count: 1 })).toBe(false);
  });
});

describe('sign text normalization', () => {
  it('does not classify external sign-looking IDs as vanilla signs', () => {
    expect(isSignId('minecraft:oak_sign')).toBe(true);
    expect(isSignId('example:oak_sign')).toBe(false);
  });

  it('keeps textarea data as exactly four canonical lines without guessed character rejection', () => {
    expect(signLines('Hello\nMinecraft\nBuilder')).toEqual(['Hello', 'Minecraft', 'Builder', '']);
    expect(signLines('1\n2\n3\n4\n5')).toEqual(['1', '2', '3', '4']);
  });
  it('commits all textarea lines as one history-aware block-entity update', () => {
    const signProject: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'minecraft:oak_wall_sign', namespace: 'minecraft', position: { x: 2, y: 2, z: 2 }, state: { facing: 'north' } }] };
    const { editor, workspace, history } = makeEditor(signProject);
    expect(editor.updateSignText({ x: 2, y: 2, z: 2 }, 'front', 'Hello\nMinecraft\nBuilder')).toBe(true);
    expect((workspace.project()!.blocks[0].blockEntityData as { front: { lines: readonly string[] } }).front.lines).toEqual(['Hello', 'Minecraft', 'Builder', '']);
    expect(history.undo()).toBe(true);
    expect(workspace.project()!.blocks[0].blockEntityData).toBeUndefined();
    expect(history.redo()).toBe(true);
    const restored = workspace.project()!.blocks[0].blockEntityData as { front: { lines: readonly string[] }; back: { lines: readonly string[] } };
    expect(restored.front.lines).toEqual(['Hello', 'Minecraft', 'Builder', '']);
    expect(restored.back.lines).toEqual(['', '', '', '']);
  });
  it('edits sign color, glow, and wax metadata as canonical block-entity data', () => {
    const signProject: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'minecraft:oak_sign', namespace: 'minecraft', position: { x: 2, y: 2, z: 2 }, state: { rotation: '0' } }] };
    const { editor, workspace } = makeEditor(signProject);
    expect(editor.updateSignAppearance({ x: 2, y: 2, z: 2 }, 'front', { color: 'red', glowing: true })).toBe(true);
    expect(editor.updateSignWaxed({ x: 2, y: 2, z: 2 }, true)).toBe(true);
    const data = workspace.project()!.blocks[0].blockEntityData as { front: { color: string; glowing: boolean }; waxed: boolean };
    expect(data.front).toMatchObject({ color: 'red', glowing: true });
    expect(data.waxed).toBe(true);
    expect(editor.updateSignAppearance({ x: 2, y: 2, z: 2 }, 'front', { color: '#fff' })).toBe(false);
  });
});

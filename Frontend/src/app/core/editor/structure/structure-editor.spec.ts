import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { ProjectDocument } from '../../domain/project.types';
import { HistoryService } from '../history/history.service';
import { SelectionService } from '../selection/selection.service';
import { isSignId, signLines, StructureEditorService } from './structure-editor.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';

function makeEditor(project: ProjectDocument): { editor: StructureEditorService; workspace: WorkspaceStateService; history: HistoryService; selection: SelectionService; library: BlockLibraryService; active: ActiveBlockService } {
  const workspace = new WorkspaceStateService(); const active = new ActiveBlockService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(active);
  workspace.project.set(project); return { editor: new StructureEditorService(workspace, active, selection, history, library), workspace, history, selection, library, active };
}

const project: ProjectDocument = { schemaVersion: 1, id: 'editor', metadata: { name: 'Editor', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [{ kind: 'resolved', id: 'minecraft:oak_stairs', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } }], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };

describe('StructureEditorService mutations', () => {
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

  it('edits verified item-storage-display slots atomically and preserves raw fields through history', () => {
    const displayProject: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: 'example:display_case', namespace: 'example', position: { x: 1, y: 1, z: 1 }, state: {}, blockEntityData: { legacy: { keep: true } } }] };
    const { editor, workspace, history, library } = makeEditor(displayProject);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'example', sourceName: 'Example', blocks: [{ id: 'example:display_case', displayName: 'Display Case', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', capabilities: [{ kind: 'item-storage-display', slotCount: 2, evidence: 'verified' }] }] });
    expect(editor.setBlockItemSlot({ x: 1, y: 1, z: 1 }, 1, { id: 'example:gem', count: 2, components: { custom: true } })).toBe(true);
    const data = workspace.project()!.blocks[0].blockEntityData as { slots: readonly { slot: number; stack?: { id: string; count: number; components?: unknown } }[]; raw?: unknown };
    expect(data.slots[1]?.stack).toEqual({ id: 'example:gem', count: 2, components: { custom: true } });
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

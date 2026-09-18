import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../domain/project.types';
import { HistoryService } from './history.service';
import { GroupService, validateGroupMove } from './group.service';
import { SelectionService } from './selection.service';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { isBlockVisible } from './group-membership';
import { ActiveBlockService } from '../blocks/active-block.service';
import { BlockLibraryService } from '../blocks/block-library.service';

const project: ProjectDocument = { schemaVersion: 2, id: 'groups', metadata: { name: 'Groups', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {} }], groups: [], editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };

function setup(input: ProjectDocument = project) { const workspace = new WorkspaceStateService(); const selection = new SelectionService(); const history = new HistoryService(workspace); const library = new BlockLibraryService(new ActiveBlockService()); workspace.project.set(input); return { workspace, selection, history, library, groups: new GroupService(workspace, selection, history, library) }; }

describe('GroupService', () => {
  it('creates an active group and rejects normalized duplicate names', () => {
    const { groups } = setup();
    expect(groups.create('Roof')).toBe(true); expect(groups.activeGroup()?.name).toBe('Roof');
    expect(groups.create(' roof ')).toBe(false);
  });

  it('toggles the active group without changing selection, membership, or history', () => {
    const { groups, selection, workspace, history } = setup();
    selection.select({ x: 1, y: 1, z: 1 });
    groups.create('Roof');
    groups.addSelectionToActive();
    const historyBefore = history.canUndo();
    groups.select(groups.activeGroupId());
    expect(groups.activeGroupId()).toBeUndefined();
    expect(groups.moveOffset()).toEqual({ x: 0, y: 0, z: 0 });
    expect(selection.single()).toEqual({ x: 1, y: 1, z: 1 });
    expect(workspace.project()!.blocks[0].groupIds).toHaveLength(1);
    expect(history.canUndo()).toBe(historyBefore);
  });

  it('switches groups and resets the previous move preview', () => {
    const { groups } = setup();
    groups.create('Roof'); const roof = groups.activeGroupId()!;
    groups.create('Entrance'); const entrance = groups.activeGroupId()!;
    groups.setMoveOffset('x', 2);
    groups.select(roof);
    expect(groups.activeGroupId()).toBe(roof);
    expect(groups.moveOffset()).toEqual({ x: 0, y: 0, z: 0 });
    groups.select(entrance);
    expect(groups.activeGroupId()).toBe(entrance);
    expect(groups.moveOffset()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('preserves multi-group membership and deletes only the requested membership', () => {
    const { groups, selection, workspace } = setup(); selection.select({ x: 1, y: 1, z: 1 });
    groups.create('Roof'); const roof = groups.activeGroupId()!;
    expect(groups.addSelectionToActive()).toBe(true); groups.create('Entrance'); const entrance = groups.activeGroupId()!;
    expect(groups.addSelectionToActive()).toBe(true); expect(workspace.project()!.blocks[0].groupIds).toEqual([roof, entrance]);
    groups.select(roof); expect(groups.removeSelectionFromActive()).toBe(true); expect(workspace.project()!.blocks[0].groupIds).toEqual([entrance]);
    groups.delete(entrance); expect(workspace.project()!.blocks).toHaveLength(1); expect(workspace.project()!.blocks[0].groupIds).toEqual([]);
  });

  it('applies any-hidden visibility, isolates active membership, and honors any locked membership', () => {
    const { groups, selection, workspace } = setup(); selection.select({ x: 1, y: 1, z: 1 });
    groups.create('Roof'); const roof = groups.activeGroupId()!; groups.addSelectionToActive(); groups.create('Entrance'); const entrance = groups.activeGroupId()!; groups.addSelectionToActive();
    groups.setVisible(roof, false); expect(isBlockVisible(workspace.project()!.blocks[0], workspace.project()!.groups)).toBe(false);
    groups.setVisible(roof, true); expect(isBlockVisible(workspace.project()!.blocks[0], workspace.project()!.groups)).toBe(true);
    groups.select(roof); groups.select(entrance); groups.isolateActive(); expect(groups.isolatedGroupId()).toBe(entrance);
    groups.setLocked(roof, true); expect(groups.removeSelectionFromActive()).toBe(false);
  });

  it('validates and saves an atomic move with one history entry and preserves memberships', () => {
    const { groups, selection, history, workspace } = setup(); selection.select({ x: 1, y: 1, z: 1 }); groups.create('Roof'); groups.addSelectionToActive(); const id = groups.activeGroupId()!;
    groups.setMoveOffset('x', 2); expect(groups.movePreview()?.valid).toBe(true); expect(groups.saveMove()).toBe(true);
    expect(workspace.project()!.blocks[0].position.x).toBe(3); expect(workspace.project()!.blocks[0].groupIds).toEqual([id]); expect(history.undo()).toBe(true); expect(workspace.project()!.blocks[0].position.x).toBe(1); expect(history.redo()).toBe(true); expect(workspace.project()!.blocks[0].position.x).toBe(3);
  });

  it('rejects bounds, external collisions, and locked group moves while allowing internal overlap', () => {
    const moved: ProjectDocument = { ...project, blocks: [{ ...project.blocks[0], groupIds: ['roof'] }, { ...project.blocks[0], position: { x: 2, y: 1, z: 1 }, groupIds: ['roof'] }, { ...project.blocks[0], position: { x: 4, y: 1, z: 1 } }], groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }] };
    expect(validateGroupMove(moved, 'roof', { x: 1, y: 0, z: 0 }).valid).toBe(true);
    expect(validateGroupMove(moved, 'roof', { x: 2, y: 0, z: 0 }).valid).toBe(false);
    expect(validateGroupMove(moved, 'roof', { x: -2, y: 0, z: 0 }).reason).toBe('bounds');
    expect(validateGroupMove({ ...moved, groups: [{ ...moved.groups[0], locked: true }] }, 'roof', { x: 1, y: 0, z: 0 }).reason).toBe('locked');
  });

  it('nudges world axes by integer step and resets without mutating the project', () => {
    const { groups, workspace } = setup(); groups.create('Roof');
    groups.setMoveStep(5); groups.nudgeMove('x', 1); groups.nudgeMove('y', -1); groups.nudgeMove('z', 1);
    expect(groups.moveOffset()).toEqual({ x: 5, y: -5, z: 5 });
    expect(workspace.project()!.blocks).toHaveLength(1);
    groups.resetMove(); expect(groups.moveOffset()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('deletes active group blocks atomically while retaining group metadata', () => {
    const { groups, selection, workspace, history } = setup();
    selection.select({ x: 1, y: 1, z: 1 });
    groups.create('Roof'); const id = groups.activeGroupId()!;
    groups.addSelectionToActive();
    expect(groups.deleteActiveBlocks()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(0);
    expect(workspace.project()!.groups.map((group) => group.id)).toEqual([id]);
    expect(history.undo()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(1);
  });

  it('rejects an active-group deletion when another locked membership is affected', () => {
    const locked: ProjectDocument = { ...project, groups: [{ id: 'active', name: 'Active', visible: true, locked: false }, { id: 'locked', name: 'Locked', visible: true, locked: true }], blocks: [{ ...project.blocks[0], groupIds: ['active', 'locked'] }] };
    const { groups, workspace } = setup(locked); groups.select('active');
    expect(groups.deleteActiveBlocks()).toBe(false);
    expect(workspace.project()!.blocks).toHaveLength(1);
  });

  it('repairs, assigns, removes, and moves a door as one logical object', () => {
    const doorProject: ProjectDocument = { ...project, groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }, { id: 'entrance', name: 'Entrance', visible: true, locked: false }], blocks: [
      { kind: 'resolved', id: 'minecraft:oak_door', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }, groupIds: ['roof'] },
      { kind: 'resolved', id: 'minecraft:oak_door', namespace: 'minecraft', position: { x: 1, y: 2, z: 1 }, state: { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }, groupIds: ['entrance'] },
    ] };
    const { groups, selection, workspace, library, history } = setup(doorProject);
    selection.selectLogical({ x: 1, y: 1, z: 1 }, doorProject, (id) => library.get(id)); groups.select('roof');
    expect(groups.addSelectionToActive()).toBe(true); expect(workspace.project()!.blocks.every((block) => block.groupIds?.includes('roof') && block.groupIds?.includes('entrance'))).toBe(true);
    expect(groups.removeSelectionFromActive()).toBe(true); expect(workspace.project()!.blocks.every((block) => !block.groupIds?.includes('roof') && block.groupIds?.includes('entrance'))).toBe(true);
    groups.select('entrance'); groups.setMoveOffset('x', 2); expect(groups.movePreview()?.positions).toHaveLength(2); expect(groups.saveMove()).toBe(true);
    expect(workspace.project()!.blocks.map((block) => block.position.x)).toEqual([3, 3]); expect(history.undo()).toBe(true); expect(workspace.project()!.blocks.map((block) => block.position.x)).toEqual([1, 1]); expect(history.redo()).toBe(true);
  });

  it('rejects moving a logical object when only one legacy half belongs to a locked group', () => {
    const lockedDoor: ProjectDocument = { ...project, groups: [{ id: 'locked', name: 'Locked', visible: true, locked: true }, { id: 'active', name: 'Active', visible: true, locked: false }], blocks: [
      { kind: 'resolved', id: 'minecraft:oak_door', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: { half: 'lower' }, groupIds: ['locked'] },
      { kind: 'resolved', id: 'minecraft:oak_door', namespace: 'minecraft', position: { x: 1, y: 2, z: 1 }, state: { half: 'upper' }, groupIds: ['active'] },
    ] };
    const { groups } = setup(lockedDoor); groups.select('active'); groups.setMoveOffset('x', 1);
    expect(groups.movePreview()).toMatchObject({ valid: false, reason: 'locked' }); expect(groups.saveMove()).toBe(false);
  });

  it('assigns and moves a bed as one logical object', () => {
    const bedProject: ProjectDocument = { ...project, groups: [{ id: 'room', name: 'Room', visible: true, locked: false }], blocks: [
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 1, y: 1, z: 2 }, state: { facing: 'east', part: 'foot', occupied: 'false' } },
      { kind: 'resolved', id: 'minecraft:red_bed', namespace: 'minecraft', position: { x: 2, y: 1, z: 2 }, state: { facing: 'east', part: 'head', occupied: 'false' } },
    ] };
    const { groups, selection, workspace, library, history } = setup(bedProject);
    selection.selectLogical({ x: 1, y: 1, z: 2 }, bedProject, (id) => library.get(id)); groups.select('room');
    expect(groups.addSelectionToActive()).toBe(true); expect(workspace.project()!.blocks.every((block) => block.groupIds?.includes('room'))).toBe(true);
    groups.setMoveOffset('z', 2); expect(groups.movePreview()?.positions).toHaveLength(2); expect(groups.saveMove()).toBe(true);
    expect(workspace.project()!.blocks.map((block) => block.position.z)).toEqual([4, 4]);
    expect(history.undo()).toBe(true); expect(workspace.project()!.blocks.map((block) => block.position.z)).toEqual([2, 2]);
  });
});

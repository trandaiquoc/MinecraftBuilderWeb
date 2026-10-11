import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../../../core/domain/project.types';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import {
  invertProjectMutationHint,
  blockMutationHint,
} from '../../../../core/editor/mutations/project-mutation-hint';
import type { ViewportHit } from '../../../../core/renderer/engine/viewport-engine-contracts';
import { ViewportHitInteractionWorkflow } from './viewport-hit-interaction-workflow';

const sign = (position: PlacedBlock['position'], id = 'minecraft:oak_sign'): PlacedBlock => ({
  kind: 'resolved',
  id,
  namespace: 'minecraft',
  position,
  state: {},
});

function project(blocks: readonly PlacedBlock[]): ProjectDocument {
  return {
    schemaVersion: 3,
    id: 'viewport-hit-test',
    metadata: {
      name: 'Viewport hit test',
      minecraftVersion: '1.21.1',
      createdAt: '',
      updatedAt: '',
    },
    size: { x: 8, y: 8, z: 8 },
    structureMode: 'vanilla-structure-block',
    blocks,
    groups: [],
    editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  };
}

function noFind(blocks: readonly PlacedBlock[]): readonly PlacedBlock[] {
  return new Proxy(blocks, {
    get(target, property, receiver) {
      if (property === 'find') throw new Error('Viewport selection must use the runtime index.');
      return Reflect.get(target, property, receiver);
    },
  });
}

describe('ViewportHitInteractionWorkflow block lookup', () => {
  it('uses the canonical runtime index for sign-side lookup and preserves the hit normal', () => {
    const block = sign({ x: 2, y: 3, z: 4 });
    const currentProject = project(noFind([block]));
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    runtimeIndex.ensure(currentProject);
    const signTextSide = { setFromHit: vi.fn() };
    const selection = { selectLogical: vi.fn(), clear: vi.fn() };
    const decorations = { active: () => undefined, clearSelection: vi.fn() };
    const workspace = { project: signal(currentProject) };
    const workflow = new ViewportHitInteractionWorkflow(
      { canStackCandle: () => false } as never,
      selection as never,
      decorations as never,
      workspace as never,
      { get: () => undefined } as never,
      signTextSide as never,
      runtimeIndex,
    );
    const faceNormal = { x: 0, y: 0, z: -1 };

    workflow.applyClick(
      { block: block.position, faceNormal } as ViewportHit,
      'primary-action',
      'select',
      '3d',
    );

    expect(selection.selectLogical).toHaveBeenCalledWith(
      block.position,
      currentProject,
      expect.any(Function),
    );
    expect(signTextSide.setFromHit).toHaveBeenCalledWith(block, faceNormal);
    expect(runtimeIndex.rebuildCount).toBe(1);
  });

  it('reconciles project switches and incremental history transitions without repeated rebuilds', () => {
    const first = sign({ x: 1, y: 1, z: 1 });
    const firstProject = project([first]);
    const switchedBlock = sign({ x: 2, y: 1, z: 1 }, 'minecraft:birch_sign');
    const switchedProject = project([switchedBlock]);
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    runtimeIndex.ensure(firstProject);
    const workspace = { project: signal(firstProject) };
    const signTextSide = { setFromHit: vi.fn() };
    const workflow = new ViewportHitInteractionWorkflow(
      { canStackCandle: () => false } as never,
      { selectLogical: vi.fn(), clear: vi.fn() } as never,
      { active: () => undefined, clearSelection: vi.fn() } as never,
      workspace as never,
      { get: () => undefined } as never,
      signTextSide as never,
      runtimeIndex,
    );
    const hit = (block: PlacedBlock): ViewportHit => ({
      block: block.position,
      faceNormal: { x: 1, y: 0, z: 0 },
    });

    workspace.project.set(switchedProject);
    workflow.applyClick(hit(switchedBlock), 'primary-action', 'select', '3d');
    const rebuildsAfterSwitch = runtimeIndex.rebuildCount;
    workflow.applyClick(hit(switchedBlock), 'primary-action', 'select', '3d');
    expect(rebuildsAfterSwitch).toBe(2);
    expect(runtimeIndex.rebuildCount).toBe(rebuildsAfterSwitch);
    expect(signTextSide.setFromHit).toHaveBeenLastCalledWith(switchedBlock, { x: 1, y: 0, z: 0 });

    const changedBlock = sign(switchedBlock.position, 'minecraft:dark_oak_sign');
    const changedProject = { ...switchedProject, blocks: [changedBlock] };
    const forward = blockMutationHint([
      { position: switchedBlock.position, before: switchedBlock, after: changedBlock },
    ]);
    expect(runtimeIndex.adoptTransition(switchedProject, changedProject, forward)).toBe(true);
    workspace.project.set(changedProject);
    workflow.applyClick(hit(changedBlock), 'primary-action', 'select', '3d');
    expect(runtimeIndex.rebuildCount).toBe(rebuildsAfterSwitch);

    expect(
      runtimeIndex.adoptTransition(
        changedProject,
        switchedProject,
        invertProjectMutationHint(forward),
      ),
    ).toBe(true);
    workspace.project.set(switchedProject);
    workflow.applyClick(hit(switchedBlock), 'primary-action', 'select', '3d');
    expect(runtimeIndex.rebuildCount).toBe(rebuildsAfterSwitch);

    const importedBlock = sign(switchedBlock.position, 'minecraft:spruce_sign');
    const importedProject = { ...switchedProject, blocks: [importedBlock] };
    workspace.project.set(importedProject);
    workflow.applyClick(hit(importedBlock), 'primary-action', 'select', '3d');
    const rebuildsAfterImport = runtimeIndex.rebuildCount;
    workflow.applyClick(hit(importedBlock), 'primary-action', 'select', '3d');
    expect(rebuildsAfterImport).toBe(rebuildsAfterSwitch + 1);
    expect(runtimeIndex.rebuildCount).toBe(rebuildsAfterImport);
    expect(signTextSide.setFromHit).toHaveBeenLastCalledWith(importedBlock, { x: 1, y: 0, z: 0 });
  });

  it('keeps Y-layer selection behavior from changing sign text side', () => {
    const block = sign({ x: 0, y: 0, z: 0 });
    const currentProject = project([block]);
    const signTextSide = { setFromHit: vi.fn() };
    const workflow = new ViewportHitInteractionWorkflow(
      { canStackCandle: () => false } as never,
      { selectLogical: vi.fn(), clear: vi.fn() } as never,
      { active: () => undefined, clearSelection: vi.fn() } as never,
      { project: signal(currentProject) } as never,
      { get: () => undefined } as never,
      signTextSide as never,
      new ProjectBlockRuntimeIndex(),
    );

    workflow.applyClick(
      { block: block.position, faceNormal: { x: 0, y: 1, z: 0 } } as ViewportHit,
      'primary-action',
      'select',
      'y-layer',
    );

    expect(signTextSide.setFromHit).not.toHaveBeenCalled();
  });
});

function createWorkflowFixture() {
  const block = sign({ x: 1, y: 2, z: 3 });
  const currentProject = project([block]);
  const runtimeIndex = new ProjectBlockRuntimeIndex();
  runtimeIndex.ensure(currentProject);
  const editor = {
    pick: vi.fn(),
    place: vi.fn(),
    delete: vi.fn(),
    canStackCandle: vi.fn(() => false),
    stackCandle: vi.fn(),
  };
  const selection = { selectLogical: vi.fn(), clear: vi.fn() };
  let activeDecoration: unknown;
  const decorations = {
    active: () => activeDecoration,
    clearSelection: vi.fn(),
    delete: vi.fn(),
    pick: vi.fn(),
    select: vi.fn(),
    placeFromSupport: vi.fn(),
  };
  const signTextSide = { setFromHit: vi.fn() };
  const workflow = new ViewportHitInteractionWorkflow(
    editor as never,
    selection as never,
    decorations as never,
    { project: signal(currentProject) } as never,
    { get: () => undefined } as never,
    signTextSide as never,
    runtimeIndex,
  );
  return {
    block,
    editor,
    selection,
    decorations,
    signTextSide,
    workflow,
    setActiveDecoration(value: unknown): void {
      activeDecoration = value;
    },
  };
}

describe('ViewportHitInteractionWorkflow click dispatch regressions', () => {
  it('picks blocks only when their hit is in front of a decoration', () => {
    const { block, editor, selection, signTextSide, decorations, workflow } =
      createWorkflowFixture();
    const faceNormal = { x: 0, y: 0, z: 1 };
    const blockHit: ViewportHit = {
      block: block.position,
      faceNormal,
      blockDistance: 1,
      decorationDistance: 2,
    };

    expect(workflow.pickBlock(blockHit, '3d')).toBe(true);
    expect(editor.pick).toHaveBeenCalledWith(block.position);
    expect(selection.selectLogical).toHaveBeenCalledOnce();
    expect(signTextSide.setFromHit).toHaveBeenCalledWith(block, faceNormal);

    const closerDecorationHit: ViewportHit = {
      ...blockHit,
      decoration: { instanceId: 'frame' } as never,
      blockDistance: 2,
      decorationDistance: 1,
    };
    expect(workflow.pickBlock(closerDecorationHit, '3d')).toBe(false);
    expect(editor.pick).toHaveBeenCalledOnce();

    workflow.applyClick(closerDecorationHit, 'pick-block', 'select', '3d');
    expect(decorations.pick).toHaveBeenCalledWith('frame');
    expect(editor.pick).toHaveBeenCalledOnce();
    workflow.applyClick(closerDecorationHit, 'primary-action', 'select', '3d');
    expect(decorations.select).toHaveBeenCalledWith('frame');
    workflow.applyClick(closerDecorationHit, 'delete-target', 'select', '3d');
    expect(decorations.delete).toHaveBeenCalledWith('frame');
    expect(editor.delete).not.toHaveBeenCalled();
  });

  it('stacks a candle on the hit voxel before normal placement', () => {
    const { block, editor, workflow } = createWorkflowFixture();
    const hit: ViewportHit = {
      block: block.position,
      target: block.position,
      placement: { status: 'valid' },
    };
    editor.canStackCandle.mockReturnValue(true);

    workflow.applyClick(hit, 'primary-action', 'place', '3d');

    expect(editor.stackCandle).toHaveBeenCalledWith(hit.block);
    expect(editor.place).not.toHaveBeenCalled();
  });

  it('places active decorations from valid support and stops at an invalid plan', () => {
    const { block, editor, decorations, workflow, setActiveDecoration } = createWorkflowFixture();
    setActiveDecoration({ kind: 'painting' });
    const hit: ViewportHit = {
      block: block.position,
      faceNormal: { x: 0, y: 1, z: 0 },
      target: { x: 1, y: 3, z: 3 },
      placement: { status: 'valid' },
      decorationPlan: { status: 'valid' } as never,
    };

    workflow.applyClick(hit, 'primary-action', 'place', '3d');
    expect(decorations.placeFromSupport).toHaveBeenCalledWith(block.position, 'up');
    expect(editor.place).not.toHaveBeenCalled();

    decorations.placeFromSupport.mockClear();
    const invalidHit = { ...hit, decorationPlan: { status: 'invalid' } as never };
    workflow.applyClick(invalidHit, 'primary-action', 'place', 'y-layer');
    expect(decorations.placeFromSupport).not.toHaveBeenCalled();
    expect(editor.place).not.toHaveBeenCalled();
  });

  it('uses decoration placement status in 3D and block placement status in Y-layer', () => {
    const { editor, workflow, setActiveDecoration } = createWorkflowFixture();
    setActiveDecoration({ kind: 'painting' });
    const hit: ViewportHit = {
      target: { x: 1, y: 2, z: 3 },
      placement: { status: 'valid' },
      decorationPlan: { status: 'invalid' } as never,
    };

    workflow.applyClick(hit, 'primary-action', 'place', '3d');
    expect(editor.place).not.toHaveBeenCalled();

    workflow.applyClick(hit, 'primary-action', 'place', 'y-layer');
    expect(editor.place).toHaveBeenCalledWith(hit.target, undefined);
  });

  it('dispatches block deletion and clears an empty block selection', () => {
    const { block, editor, selection, decorations, workflow, setActiveDecoration } =
      createWorkflowFixture();

    workflow.applyClick({ block: block.position }, 'delete-target', 'select', '3d');
    expect(editor.delete).toHaveBeenCalledWith(block.position);

    workflow.applyClick({}, 'primary-action', 'select', '3d');
    expect(selection.clear).toHaveBeenCalledOnce();

    setActiveDecoration({ kind: 'painting' });
    workflow.applyClick({ block: block.position }, 'primary-action', 'select', '3d');
    expect(decorations.select).toHaveBeenCalledWith(undefined);
    decorations.select.mockClear();
    workflow.applyClick({ block: block.position }, 'primary-action', 'select', 'y-layer');
    expect(decorations.select).not.toHaveBeenCalled();
  });
});

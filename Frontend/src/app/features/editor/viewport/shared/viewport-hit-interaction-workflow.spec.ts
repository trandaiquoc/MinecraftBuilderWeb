import type { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import type { SignTextSideService } from '../../../../core/block-entities/sign/sign-text-side.service';
import type { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import type { SelectionService } from '../../../../core/editor/selection/selection.service';
import type { DecorationService } from '../../../../core/decorations/decoration.service';
import type { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ViewportHit } from '../../../../core/renderer/engine/viewport-engine-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportHitInteractionWorkflow } from './viewport-hit-interaction-workflow';

describe('ViewportHitInteractionWorkflow', () => {
  const project = {
    blocks: [
      {
        kind: 'resolved',
        id: 'minecraft:oak_sign',
        namespace: 'minecraft',
        position: { x: 1, y: 2, z: 3 },
        state: {},
      },
    ],
  } as never;
  const editor = {
    pick: vi.fn(),
    place: vi.fn(),
    delete: vi.fn(),
    canStackCandle: vi.fn(() => false),
    stackCandle: vi.fn(),
  };
  const selection = { selectLogical: vi.fn(), clear: vi.fn() };
  const decorations = {
    active: vi.fn(() => undefined),
    clearSelection: vi.fn(),
    delete: vi.fn(),
    pick: vi.fn(),
    select: vi.fn(),
    placeFromSupport: vi.fn(),
  };
  const workspace = { project: vi.fn(() => project) };
  const library = {
    get: vi.fn((id: string) => (id === 'minecraft:oak_sign' ? { kind: 'sign' } : undefined)),
  };
  const signTextSide = { setFromHit: vi.fn() };
  let workflow: ViewportHitInteractionWorkflow;

  beforeEach(() => {
    vi.clearAllMocks();
    decorations.active.mockReturnValue(undefined);
    editor.canStackCandle.mockReturnValue(false);
    workflow = new ViewportHitInteractionWorkflow(
      editor as unknown as StructureEditorService,
      selection as unknown as SelectionService,
      decorations as unknown as DecorationService,
      workspace as unknown as WorkspaceStateService,
      library as unknown as BlockLibraryService,
      signTextSide as unknown as SignTextSideService,
    );
  });

  it('picks and selects a block only when its hit is in front of a decoration', () => {
    const hit = { block: { x: 1, y: 2, z: 3 }, blockDistance: 1, decorationDistance: 2 };

    expect(workflow.pickBlock(hit, '3d')).toBe(true);
    expect(editor.pick).toHaveBeenCalledWith(hit.block);
    expect(selection.selectLogical).toHaveBeenCalledOnce();
    expect(signTextSide.setFromHit).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(
      workflow.pickBlock(
        {
          ...hit,
          blockDistance: 2,
          decorationDistance: 1,
          decoration: { instanceId: 'deco' } as never,
        },
        '3d',
      ),
    ).toBe(false);
    expect(editor.pick).not.toHaveBeenCalled();
  });

  it('preserves mode-specific sign text-side behavior for block selection', () => {
    const hit: ViewportHit = { block: { x: 1, y: 2, z: 3 }, faceNormal: { x: 0, y: 0, z: 1 } };

    workflow.applyClick(hit, 'primary-action', 'select', '3d');
    expect(signTextSide.setFromHit).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    workflow.applyClick(hit, 'primary-action', 'select', 'y-layer');
    expect(selection.selectLogical).toHaveBeenCalledOnce();
    expect(signTextSide.setFromHit).not.toHaveBeenCalled();
  });

  it('stacks candles before normal placement and retains the hit voxel', () => {
    const hit: ViewportHit = {
      block: { x: 4, y: 5, z: 6 },
      target: { x: 4, y: 5, z: 6 },
      placement: { status: 'valid' },
    };
    editor.canStackCandle.mockReturnValue(true);

    workflow.applyClick(hit, 'primary-action', 'place', '3d');

    expect(editor.stackCandle).toHaveBeenCalledWith(hit.block);
    expect(editor.place).not.toHaveBeenCalled();
  });

  it('keeps active-decoration support placement and invalid-plan early return', () => {
    const active = { kind: 'painting' } as never;
    decorations.active.mockReturnValue(active);
    const hit: ViewportHit = {
      block: { x: 0, y: 1, z: 0 },
      faceNormal: { x: 0, y: 1, z: 0 },
      target: { x: 0, y: 2, z: 0 },
      placement: { status: 'valid' },
      decorationPlan: { status: 'invalid' } as never,
    };

    workflow.applyClick(hit, 'primary-action', 'place', 'y-layer');

    expect(decorations.placeFromSupport).not.toHaveBeenCalled();
    expect(editor.place).not.toHaveBeenCalled();
  });

  it('preserves distinct placement-status selection for 3D and Y-layer', () => {
    decorations.active.mockReturnValue({ kind: 'painting' } as never);
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
});

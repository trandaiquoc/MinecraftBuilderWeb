import { Injectable } from '@angular/core';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { SignTextSideService } from '../../../../core/block-entities/sign/sign-text-side.service';
import { isSignDefinition, isSignId } from '../../../../core/block-entities/sign/sign-block-entity';
import type { VoxelCoordinate } from '../../../../core/domain/project.types';
import type { EditorTool } from '../../../../core/editor/state/tool.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import {
  blockHitWinsOverDecoration,
  pickAndSelectBlockFromViewportHit,
} from '../../../../core/editor/viewport/pick-block';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { facingFromNormal } from '../../../../core/decorations/placement/decoration-placement';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ViewportHit } from '../../../../core/renderer/engine/viewport-engine-contracts';
import type { MouseAction } from '../../../../core/editor/input/mouse-bindings';

export type ViewportKind = '3d' | 'y-layer';

@Injectable({ providedIn: 'root' })
export class ViewportHitInteractionWorkflow {
  constructor(
    private readonly editor: StructureEditorService,
    private readonly selection: SelectionService,
    private readonly decorations: DecorationService,
    private readonly workspace: WorkspaceStateService,
    private readonly library: BlockLibraryService,
    private readonly signTextSide: SignTextSideService,
    private readonly blockIndex: ProjectBlockRuntimeIndex,
  ) {}

  pickBlock(hit: ViewportHit, viewport: ViewportKind): boolean {
    if (!blockHitWinsOverDecoration(hit)) return false;
    return pickAndSelectBlockFromViewportHit(
      hit,
      (position) => this.editor.pick(position),
      (picked) => this.selectBlock(picked.block!, picked.faceNormal, viewport),
    );
  }

  applyClick(
    hit: ViewportHit,
    action: MouseAction,
    tool: EditorTool,
    viewport: ViewportKind,
  ): void {
    const activeDecoration = this.decorations.active();
    const decorationWins = !!hit.decoration && !blockHitWinsOverDecoration(hit);
    if (hit.decoration && decorationWins && (action !== 'primary-action' || tool === 'select')) {
      if (action === 'delete-target') this.decorations.delete(hit.decoration.instanceId);
      else if (action === 'pick-block') this.decorations.pick(hit.decoration.instanceId);
      else if (tool === 'select') this.decorations.select(hit.decoration.instanceId);
      return;
    }

    if (
      activeDecoration &&
      hit.block &&
      hit.faceNormal &&
      tool === 'place' &&
      action === 'primary-action'
    ) {
      const facing = facingFromNormal(hit.faceNormal);
      if (facing && hit.decorationPlan?.status === 'valid')
        this.decorations.placeFromSupport(hit.block, facing);
      return;
    }

    if (viewport === '3d' && activeDecoration && hit.block && tool === 'select')
      this.decorations.select(undefined);

    const status =
      viewport === '3d' && activeDecoration
        ? (hit.decorationPlan?.status ?? 'invalid')
        : (hit.placement?.status ?? 'invalid');
    if (
      tool === 'place' &&
      action === 'primary-action' &&
      hit.block &&
      this.editor.canStackCandle(hit.block)
    ) {
      this.editor.stackCandle(hit.block);
      return;
    }

    if (action === 'pick-block' && this.pickBlock(hit, viewport)) return;
    if (action === 'delete-target' && hit.block) this.editor.delete(hit.block);
    else if (action === 'primary-action' && tool === 'select' && hit.block)
      this.selectBlock(hit.block, hit.faceNormal, viewport);
    else if (action === 'primary-action' && tool === 'select') this.selection.clear();
    else if (action === 'primary-action' && tool === 'place' && hit.target && status !== 'invalid')
      this.editor.place(hit.target, hit.placementContext);
  }

  private selectBlock(
    position: VoxelCoordinate,
    faceNormal: ViewportHit['faceNormal'],
    viewport: ViewportKind,
  ): void {
    this.decorations.clearSelection();
    const project = this.workspace.project();
    if (!project) return;
    this.blockIndex.ensure(project);
    this.selection.selectLogical(position, project, (id) => this.library.get(id));
    if (viewport !== '3d') return;

    const selected = this.blockIndex.get(position);
    if (selected && (isSignDefinition(this.library.get(selected.id)) || isSignId(selected.id)))
      this.signTextSide.setFromHit(selected, faceNormal);
  }
}

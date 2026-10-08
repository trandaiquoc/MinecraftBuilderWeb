import { Injectable, inject } from '@angular/core';
import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { SelectionService } from '../selection/selection.service';
import { HistoryService } from '../history/history.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { BlockModelResolver } from '../../blocks/resolver/block-model-resolver';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { isBlockLocked as hasLockedMembership } from '../groups/group-membership';
import { BlockRuleEngine, nextCandleState, overlayBlockLookup, RuleValidation } from '../../block-behavior/rules/block-rule-engine';
import { expandLogicalObjectClosure, resolveLogicalObjectPartsFromLookup, transformPairedHorizontal } from '../../block-behavior/logical-objects/logical-object';
import { logicalPlacementForBehavior, logicalPlacementParts } from '../../block-behavior/logical-objects/logical-placement';
import { PlacementContext } from '../placement/placement';
import { planPlacement, PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { pruneInvalidDecorations } from '../../decorations/placement/decoration-placement';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import { blockMutationHint, ProjectMutationHint } from '../mutations/project-mutation-hint';
import { projectMutationChanges } from '../mutations/project-mutation-diff';
import { defaultProjectBlockRuntimeIndex, ProjectBlockRuntimeIndex } from '../runtime/project-block-runtime-index';
import { ProjectBlockArrayMutator } from '../runtime/project-block-array-mutator';
import { BlockEntityEditTransaction } from './block-entity-edit-transaction';
import { DecoratedPotBlockEntityEditor } from './decorated-pot-block-entity-editor';
import { ItemHostBlockEntityEditor } from './item-host-block-entity-editor';
import { SignBlockEntityEditor } from './sign-block-entity-editor';
import type { ItemStackData } from '../../items/item-stack.types';

@Injectable({ providedIn: 'root' })
export class StructureEditorService {
  private lastValidation?: RuleValidation;
  private readonly signEditor: SignBlockEntityEditor;
  private readonly decoratedPotEditor: DecoratedPotBlockEntityEditor;
  private readonly itemHostEditor: ItemHostBlockEntityEditor;

  constructor(private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService), private readonly activeBlock: ActiveBlockService = inject(ActiveBlockService), private readonly selection: SelectionService = inject(SelectionService), private readonly history: HistoryService = inject(HistoryService), private readonly library: BlockLibraryService = inject(BlockLibraryService), private readonly runtimeIndex: ProjectBlockRuntimeIndex = defaultProjectBlockRuntimeIndex) {
    const blockEntityTransaction = new BlockEntityEditTransaction(history, runtimeIndex);
    this.signEditor = new SignBlockEntityEditor(blockEntityTransaction, library);
    this.decoratedPotEditor = new DecoratedPotBlockEntityEditor(blockEntityTransaction, library);
    this.itemHostEditor = new ItemHostBlockEntityEditor(blockEntityTransaction, library);
  }

  place(position: VoxelCoordinate, context?: PlacementContext): boolean {
    let mutationHint: ProjectMutationHint | undefined;
    return this.history.executeWithMutation('Place', (project) => {
      const active = this.activeBlock.active();
      if (!active || !isWithinBounds(position, project.size) || this.find(project, position) || this.isLocked(project, position)) return undefined;
      const plan = planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id), this.runtimeIndex, true);
      this.lastValidation = plan.validation;
      if (!plan.project) return undefined;
      const placedBlocks = plan.blocks.map((block) => {
        const signData = this.signEditor.defaultData(block.id);
        if (signData) return { ...block, blockEntityData: signData };
        const potData = this.decoratedPotEditor.defaultData(block.id);
        if (potData) return { ...block, blockEntityData: potData };
        const itemHostData = this.itemHostEditor.defaultData(block.id);
        if (itemHostData) return { ...block, blockEntityData: itemHostData };
        return block;
      });
      const entityChanged = placedBlocks.some((block, index) => block !== plan.blocks[index]);
      const placedByKey = new Map(placedBlocks.map((block) => [coordinateKey(block.position), block] as const));
      const next = pruneInvalidDecorations({ ...plan.project, ...(entityChanged ? { blocks: plan.project.blocks.map((block) => placedByKey.get(coordinateKey(block.position)) ?? block) } : {}) });
      const derivedByKey = new Map((plan.changedBlocks ?? []).map((block) => [coordinateKey(block.position), block] as const));
      const afterByKey = new Map([...placedByKey, ...derivedByKey]);
      mutationHint = blockMutationHint([...afterByKey.values()].map((after) => ({ position: after.position, before: this.runtimeIndex.get(after.position), after })), 'place');
      return next;
    }, () => mutationHint);
  }

  canStackCandle(position: VoxelCoordinate): boolean {
    const project = this.workspace.project();
    const active = this.activeBlock.active();
    const existing = project && this.find(project, position);
    return !!(active && existing && nextCandleState(existing, active.id, (id) => this.library.get(id)));
  }

  stackCandle(position: VoxelCoordinate): boolean {
    let mutationHint: ProjectMutationHint | undefined;
    return this.history.executeWithMutation('Stack candle', (project) => {
      const active = this.activeBlock.active();
      const existing = this.find(project, position);
      if (!active || !existing || hasLockedMembership(existing, project.groups)) return undefined;
      const state = nextCandleState(existing, active.id, (id) => this.library.get(id));
      if (!state) return undefined;
      this.lastValidation = { status: 'valid', reason: 'ok', affectedPositions: [position] };
      const after = {
        ...existing,
        state,
      };
      mutationHint = blockMutationHint([{ position, before: existing, after }], 'candle-stack');
      return {
        ...project,
        blocks: ProjectBlockArrayMutator.replaceAtPosition(project, position, after, this.runtimeIndex),
        metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
      };
    }, () => mutationHint);
  }

  delete(position: VoxelCoordinate): boolean {
    const changed = this.deletePositions([position], 'Delete');
    if (changed) this.selection.clearIf(position);
    return changed;
  }

  deleteSelection(): boolean {
    const project = this.workspace.project();
    if (!project) return false;
    const selected = this.selection.selectedBlocks(project);
    if (!selected.length) return false;
    const changed = this.deletePositions(selected.map((block) => block.position), 'Delete selection');
    if (changed) this.selection.clear();
    return changed;
  }

  deletePositions(positions: readonly VoxelCoordinate[], label = 'Delete'): boolean {
    let mutationHint: ProjectMutationHint | undefined;
    return this.history.executeWithMutation(label, (project) => {
      const seeds = positions.map((position) => this.find(project, position)).filter((block): block is PlacedBlock => !!block);
      // A complete selection already contains every logical part. Avoid
      // resolving each pair with a full-array lookup for large select-all
      // deletes; the rule engine still enforces closure for partial deletes.
      const expanded = seeds.length === project.blocks.length
        ? [...project.blocks]
        : expandLogicalObjectClosure(this.runtimeIndex, seeds, (id) => this.library.get(id));
      if (!expanded.length || expanded.some((block) => hasLockedMembership(block, project.groups))) return undefined;
      const result = this.rules().deleteMany(project, expanded.map((block) => block.position), this.runtimeIndex);
      this.lastValidation = result.validation;
      if (!result.project) return result.project;
      const removedChanges = expanded.map((block) => ({ position: block.position, before: block, after: undefined }));
      const derivedChanges = (result.changedBlocks ?? []).map((block) => ({ position: block.position, before: this.runtimeIndex.get(block.position), after: block }));
      mutationHint = blockMutationHint([...removedChanges, ...derivedChanges], label.toLowerCase());
      return pruneInvalidDecorations(result.project);
    }, () => mutationHint);
  }

  pick(position: VoxelCoordinate): void {
    const project = this.workspace.project();
    const block = project && this.find(project, position);
    if (block) {
      const item = this.library.itemForBlock(block.id);
      if (item) this.activeBlock.pick(block, this.library.get(block.id), item);
      else this.activeBlock.pick(block, this.library.get(block.id));
    }
  }

  updateBlockState(position: VoxelCoordinate, property: string, value: string): boolean {
    const before = this.workspace.project(); const selectedBefore = before && this.find(before, position); const selectedWasHead = selectedBefore?.state['part'] === 'head';
    let mutationHint: ProjectMutationHint | undefined;
    const changed = this.history.executeWithMutation('BlockState edit', (project) => {
      const block = this.find(project, position); const definition = block && this.library.get(block.id); const options = definition?.stateDefinitions.find((entry) => entry.name === property)?.values;
      const rules = this.rules();
      const parts = block ? resolveLogicalObjectPartsFromLookup(this.runtimeIndex, position, (id) => this.library.get(id)) : [];
      if (!block || !options?.includes(value) || parts.some((part) => hasLockedMembership(part, project.groups)) || rules.isDerivedProperty(block.id, property)) return undefined;
      if (definition?.behavior?.kind === 'paired-horizontal' && property === definition.behavior.facingProperty) {
        const transformed = transformPairedHorizontal(project, position, value, (id) => this.library.get(id));
        if (!transformed) return undefined;
        mutationHint = hintForPositions(project, transformed, pairedMutationPositions(parts, value, definition.behavior));
        return { ...transformed, metadata: { ...transformed.metadata, updatedAt: new Date().toISOString() } };
      }
      const changedState = { ...block.state, [property]: value };
      const directAfter = parts.map((part) => ({ ...part, state: logicalPartState(part, changedState, definition?.behavior) }));
      const blocks = ProjectBlockArrayMutator.replace(project, directAfter, this.runtimeIndex);
        const result = rules.refresh({ ...project, blocks }, [position], overlayBlockLookup(this.runtimeIndex, directAfter)); this.lastValidation = result.validation;
        if (!result.project) return undefined;
        const invariant = rules.validateMutation(result.project, directAfter.map((part) => part.position), result.project.blocks);
        if (invariant) { this.lastValidation = invariant; return undefined; }
        mutationHint = blockMutationHint([...directAfter, ...(result.changedBlocks ?? [])].map((after) => ({ position: after.position, before: this.runtimeIndex.get(after.position), after })), 'blockstate-edit');
        return pruneInvalidDecorations({ ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } });
    }, () => mutationHint);
    if (changed && selectedWasHead && this.selection.single()) {
      const after = this.workspace.project(); const nextHead = after?.blocks.find((block) => block.id === selectedBefore?.id && block.state['part'] === 'head' && block.state['facing'] === (after.blocks.find((entry) => entry.state['part'] === 'foot' && entry.id === selectedBefore?.id)?.state['facing'] ?? ''));
      if (nextHead) this.selection.selectLogical(nextHead.position, after!, (id) => this.library.get(id));
    }
    return changed;
  }

  rotateBlock(position: VoxelCoordinate, quarterTurns = 1): boolean {
    const before = this.workspace.project(); const selectedBefore = before && this.find(before, position); const selectedWasHead = selectedBefore?.state['part'] === 'head';
    let mutationHint: ProjectMutationHint | undefined;
    const changed = this.history.executeWithMutation('Rotate block', (project) => {
      const block = this.find(project, position); const definition = block && this.library.get(block.id);
      const parts = block ? resolveLogicalObjectPartsFromLookup(this.runtimeIndex, position, (id) => this.library.get(id)) : [];
      if (!block || !definition || parts.some((part) => hasLockedMembership(part, project.groups))) return undefined;
      const rotated = new BlockModelResolver({ readJson: () => undefined }).rotateState(block.state, definition.stateDefinitions, quarterTurns);
      if (!rotated.supported || !rotated.state) return undefined;
      if (definition.behavior?.kind === 'paired-horizontal' && rotated.state[definition.behavior.facingProperty]) {
        const transformed = transformPairedHorizontal(project, position, rotated.state[definition.behavior.facingProperty]!, (id) => this.library.get(id));
        if (!transformed) return undefined;
        mutationHint = hintForPositions(project, transformed, pairedMutationPositions(parts, rotated.state[definition.behavior.facingProperty]!, definition.behavior));
        return { ...transformed, metadata: { ...transformed.metadata, updatedAt: new Date().toISOString() } };
      }
      const directAfter = parts.map((part) => ({ ...part, state: logicalPartState(part, rotated.state!, definition.behavior) }));
      const updated = { ...project, blocks: ProjectBlockArrayMutator.replace(project, directAfter, this.runtimeIndex) };
      const rules = this.rules();
      const result = rules.refresh(updated, [position], overlayBlockLookup(this.runtimeIndex, directAfter)); this.lastValidation = result.validation;
      if (!result.project) return undefined;
      const invariant = rules.validateMutation(result.project, directAfter.map((part) => part.position), result.project.blocks);
      if (invariant) { this.lastValidation = invariant; return undefined; }
      mutationHint = blockMutationHint([...directAfter, ...(result.changedBlocks ?? [])].map((after) => ({ position: after.position, before: this.runtimeIndex.get(after.position), after })), 'rotate-block');
      return pruneInvalidDecorations({ ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } });
    }, () => mutationHint);
    if (changed && selectedWasHead && this.selection.single()) {
      const after = this.workspace.project(); const nextHead = after?.blocks.find((block) => block.id === selectedBefore?.id && block.state['part'] === 'head');
      if (nextHead) this.selection.selectLogical(nextHead.position, after!, (id) => this.library.get(id));
    }
    return changed;
  }

  validation(): RuleValidation | undefined { return this.lastValidation; }
  planPlacement(position: VoxelCoordinate, context?: PlacementContext, lookup?: ReadonlyBlockLookup, activeOverride?: ActiveBlock, projectOverride?: ProjectDocument): PlacementPlan | undefined {
    const project = projectOverride ?? this.workspace.project(); const active = activeOverride ?? this.activeBlock.active();
    return project && active ? planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id), lookup) : undefined;
  }
  updateSignText(position: VoxelCoordinate, side: 'front' | 'back', value: string): boolean {
    return this.signEditor.updateText(position, side, value);
  }
  updateSignAppearance(position: VoxelCoordinate, side: 'front' | 'back', patch: { readonly color?: string; readonly glowing?: boolean }): boolean {
    return this.signEditor.updateAppearance(position, side, patch);
  }
  updateSignWaxed(position: VoxelCoordinate, waxed: boolean): boolean {
    return this.signEditor.updateWaxed(position, waxed);
  }
  updateDecoratedPotDecoration(position: VoxelCoordinate, side: 'back' | 'left' | 'right' | 'front', sherd: string): boolean {
    return this.decoratedPotEditor.updateDecoration(position, side, sherd);
  }
  setDecoratedPotItem(position: VoxelCoordinate, stack: ItemStackData | undefined): boolean { return this.decoratedPotEditor.setItem(position, stack); }
  setBlockItemSlot(position: VoxelCoordinate, slot: number, stack: ItemStackData | undefined): boolean { return this.itemHostEditor.setSlot(position, slot, stack); }
  validatePlacement(position: VoxelCoordinate, context?: PlacementContext): RuleValidation {
    const project = this.workspace.project(); const active = this.activeBlock.active();
    if (!project || !active) return { status: 'invalid', reason: 'out-of-bounds', affectedPositions: [position] };
    return planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id)).validation;
  }
  private rules(): BlockRuleEngine { return new BlockRuleEngine((id) => this.library.get(id)); }

  private find(project: ProjectDocument, position: VoxelCoordinate): PlacedBlock | undefined { this.runtimeIndex.ensure(project); return this.runtimeIndex.get(position); }
  private isLocked(project: ProjectDocument, position: VoxelCoordinate): boolean {
    const block = this.find(project, position);
    return !!block && hasLockedMembership(block, project.groups);
  }
}

function hintForPositions(before: ProjectDocument, after: ProjectDocument, positions: readonly VoxelCoordinate[]): ProjectMutationHint {
  return blockMutationHint(projectMutationChanges(before, after, positions));
}
function uniqueCoordinates(positions: readonly VoxelCoordinate[]): readonly VoxelCoordinate[] {
  const result = new Map<string, VoxelCoordinate>();
  for (const position of positions) result.set(coordinateKey(position), position);
  return [...result.values()];
}
function pairedMutationPositions(parts: readonly PlacedBlock[], facing: string, behavior: Extract<NonNullable<BlockDefinition['behavior']>, { readonly kind: 'paired-horizontal' }>): readonly VoxelCoordinate[] {
  const metadata = logicalPlacementForBehavior(behavior);
  const foot = metadata && parts.find((part) => part.state[metadata.identityProperty] === metadata.firstIdentity);
  if (!foot) return parts.map((part) => part.position);
  const offsets = logicalPlacementParts(metadata!, { ...foot.state, [metadata!.facingProperty!]: facing });
  const second = offsets.find((part) => part.identityValue === metadata!.secondIdentity);
  return second ? uniqueCoordinates([...parts.map((part) => part.position), { x: foot.position.x + second.offset.x, y: foot.position.y + second.offset.y, z: foot.position.z + second.offset.z }]) : parts.map((part) => part.position);
}
function logicalPartState(part: PlacedBlock, source: Readonly<Record<string, string>>, behavior: BlockDefinition['behavior']): Readonly<Record<string, string>> {
  const metadata = logicalPlacementForBehavior(behavior);
  if (metadata) return { ...source, [metadata.identityProperty]: part.state[metadata.identityProperty] ?? source[metadata.identityProperty] };
  return source;
}

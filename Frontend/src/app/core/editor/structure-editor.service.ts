import { Injectable, inject } from '@angular/core';
import { coordinateKey } from '../domain/coordinates';
import { PlacedBlock, ProjectDocument, SignBlockEntityData, SignSide, VoxelCoordinate } from '../domain/project.types';
import { ActiveBlockService } from '../blocks/active-block.service';
import { SelectionService } from './selection.service';
import { HistoryService } from './history.service';
import { BlockLibraryService } from '../blocks/block-library.service';
import { BlockModelResolver } from '../blocks/resolver/block-model-resolver';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { isBlockLocked as hasLockedMembership } from './group-membership';
import { BlockRuleEngine, nextCandleState, RuleValidation } from '../behavior/block-rule-engine';
import { expandLogicalObjectClosure, resolveLogicalObjectParts, synchronizeLogicalObjectState, transformPairedHorizontal } from '../behavior/logical-object';
import { PlacementContext } from './placement';
import { fallbackMinecraftTextWidth, NORMAL_SIGN_TEXT_METRICS } from './sign-text-metrics';
import { planPlacement, PlacementPlan } from '../behavior/placement-plan';

@Injectable({ providedIn: 'root' })
export class StructureEditorService {
  private lastValidation?: RuleValidation;
  constructor(private readonly workspace: WorkspaceStateService = inject(WorkspaceStateService), private readonly activeBlock: ActiveBlockService = inject(ActiveBlockService), private readonly selection: SelectionService = inject(SelectionService), private readonly history: HistoryService = inject(HistoryService), private readonly library: BlockLibraryService = inject(BlockLibraryService)) {}

  place(position: VoxelCoordinate, context?: PlacementContext): boolean {
    return this.history.execute('Place', (project) => {
      const active = this.activeBlock.active();
      if (!active || !this.inBounds(position, project) || this.find(project, position) || isBlockLocked(project, position)) return undefined;
      const plan = planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id));
      this.lastValidation = plan.validation;
      if (!plan.project) return undefined;
      const placedKeys = new Set(plan.blocks.map((block) => coordinateKey(block.position)));
      return { ...plan.project, blocks: plan.project.blocks.map((block) => placedKeys.has(coordinateKey(block.position)) && isSignId(block.id) ? { ...block, blockEntityData: defaultSignData() } : block) };
    });
  }

  canStackCandle(position: VoxelCoordinate): boolean {
    const project = this.workspace.project();
    const active = this.activeBlock.active();
    const existing = project && this.find(project, position);
    return !!(active && existing && nextCandleState(existing, active.id, (id) => this.library.get(id)));
  }

  stackCandle(position: VoxelCoordinate): boolean {
    return this.history.execute('Stack candle', (project) => {
      const active = this.activeBlock.active();
      const existing = this.find(project, position);
      if (!active || !existing || hasLockedMembership(existing, project.groups)) return undefined;
      const state = nextCandleState(existing, active.id, (id) => this.library.get(id));
      if (!state) return undefined;
      this.lastValidation = { status: 'valid', reason: 'ok', affectedPositions: [position] };
      return {
        ...project,
        blocks: project.blocks.map((block) => coordinateKey(block.position) === coordinateKey(position) ? { ...block, state } : block),
        metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
      };
    });
  }

  delete(position: VoxelCoordinate): boolean {
    const changed = this.deletePositions([position], 'Delete');
    if (changed) this.selection.clearIf(position);
    return changed;
  }

  deleteSelection(): boolean {
    const project = this.workspace.project();
    if (!project) return false;
    const positions = this.selection.logicalPositions();
    if (!positions.length) return false;
    const changed = this.deletePositions(positions, 'Delete selection');
    if (changed) this.selection.clear();
    return changed;
  }

  deletePositions(positions: readonly VoxelCoordinate[], label = 'Delete'): boolean {
    return this.history.execute(label, (project) => {
      const requested = new Set(positions.map(coordinateKey));
      const seeds = project.blocks.filter((block) => requested.has(coordinateKey(block.position)));
      const expanded = expandLogicalObjectClosure(project.blocks, seeds, (id) => this.library.get(id));
      if (!expanded.length || expanded.some((block) => hasLockedMembership(block, project.groups))) return undefined;
      const result = this.rules().deleteMany(project, expanded.map((block) => block.position));
      this.lastValidation = result.validation;
      return result.project;
    });
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
    const changed = this.history.execute('BlockState edit', (project) => {
      const block = this.find(project, position); const definition = block && this.library.get(block.id); const options = definition?.stateDefinitions.find((entry) => entry.name === property)?.values;
      const rules = this.rules();
      const parts = block ? resolveLogicalObjectParts(project.blocks, position, (id) => this.library.get(id)) : [];
      if (!block || !options?.includes(value) || parts.some((part) => hasLockedMembership(part, project.groups)) || rules.isDerivedProperty(block.id, property)) return undefined;
      if (definition?.behavior?.kind === 'paired-horizontal' && property === definition.behavior.facingProperty) {
        const transformed = transformPairedHorizontal(project, position, value, (id) => this.library.get(id));
        return transformed ? { ...transformed, metadata: { ...transformed.metadata, updatedAt: new Date().toISOString() } } : undefined;
      }
      const changedState = { ...block.state, [property]: value };
      const directlyChanged = project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, state: changedState } : entry);
      const blocks = synchronizeLogicalObjectState(directlyChanged, position, changedState, (id) => this.library.get(id));
      const result = rules.refresh({ ...project, blocks }, [position]); this.lastValidation = result.validation; return result.project ? { ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } } : undefined;
    });
    if (changed && selectedWasHead && this.selection.single()) {
      const after = this.workspace.project(); const nextHead = after?.blocks.find((block) => block.id === selectedBefore?.id && block.state['part'] === 'head' && block.state['facing'] === (after.blocks.find((entry) => entry.state['part'] === 'foot' && entry.id === selectedBefore?.id)?.state['facing'] ?? ''));
      if (nextHead) this.selection.selectLogical(nextHead.position, after!, (id) => this.library.get(id));
    }
    return changed;
  }

  rotateBlock(position: VoxelCoordinate, quarterTurns = 1): boolean {
    const before = this.workspace.project(); const selectedBefore = before && this.find(before, position); const selectedWasHead = selectedBefore?.state['part'] === 'head';
    const changed = this.history.execute('Rotate block', (project) => {
      const block = this.find(project, position); const definition = block && this.library.get(block.id);
      const parts = block ? resolveLogicalObjectParts(project.blocks, position, (id) => this.library.get(id)) : [];
      if (!block || !definition || parts.some((part) => hasLockedMembership(part, project.groups))) return undefined;
      const rotated = new BlockModelResolver({ readJson: () => undefined }).rotateState(block.state, definition.stateDefinitions, quarterTurns);
      if (!rotated.supported || !rotated.state) return undefined;
      if (definition.behavior?.kind === 'paired-horizontal' && rotated.state[definition.behavior.facingProperty]) {
        const transformed = transformPairedHorizontal(project, position, rotated.state[definition.behavior.facingProperty]!, (id) => this.library.get(id));
        return transformed ? { ...transformed, metadata: { ...transformed.metadata, updatedAt: new Date().toISOString() } } : undefined;
      }
      const directlyChanged = project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, state: rotated.state! } : entry);
      const updated = { ...project, blocks: synchronizeLogicalObjectState(directlyChanged, position, rotated.state, (id) => this.library.get(id)) };
      const result = this.rules().refresh(updated, [position]); this.lastValidation = result.validation; return result.project ? { ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } } : undefined;
    });
    if (changed && selectedWasHead && this.selection.single()) {
      const after = this.workspace.project(); const nextHead = after?.blocks.find((block) => block.id === selectedBefore?.id && block.state['part'] === 'head');
      if (nextHead) this.selection.selectLogical(nextHead.position, after!, (id) => this.library.get(id));
    }
    return changed;
  }

  validation(): RuleValidation | undefined { return this.lastValidation; }
  planPlacement(position: VoxelCoordinate, context?: PlacementContext): PlacementPlan | undefined {
    const project = this.workspace.project(); const active = this.activeBlock.active();
    return project && active ? planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id)) : undefined;
  }
  updateSignText(position: VoxelCoordinate, side: 'front' | 'back', value: string): boolean {
    return this.history.execute('Sign text edit', (project) => {
      const block = this.find(project, position); if (!block || !isSignId(block.id)) return undefined;
      const current = signData(block.blockEntityData); const target = current[side]; const lines = signLines(value);
      const data: SignBlockEntityData = { ...current, [side]: { ...target, lines } };
      return { ...project, blocks: project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, blockEntityData: data } : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  validatePlacement(position: VoxelCoordinate, context?: PlacementContext): RuleValidation {
    const project = this.workspace.project(); const active = this.activeBlock.active();
    if (!project || !active) return { status: 'invalid', reason: 'out-of-bounds', affectedPositions: [position] };
    return planPlacement(project, active, position, context, (id) => this.library.get(id), this.library.getItem(active.itemId ?? active.id)).validation;
  }
  private rules(): BlockRuleEngine { return new BlockRuleEngine((id) => this.library.get(id)); }

  private find(project: ProjectDocument, position: VoxelCoordinate): PlacedBlock | undefined { return project.blocks.find((block) => coordinateKey(block.position) === coordinateKey(position)); }
  private inBounds(position: VoxelCoordinate, project: ProjectDocument): boolean { return position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < project.size.x && position.y < project.size.y && position.z < project.size.z && Number.isInteger(position.x) && Number.isInteger(position.y) && Number.isInteger(position.z); }
}

export function isSignId(id: string): boolean { return /(?:^|_)(?:wall_)?sign$/.test(id.split(':').at(-1) ?? id) || id.endsWith('_hanging_sign') || id.endsWith('_wall_hanging_sign'); }
export function defaultSignData(): SignBlockEntityData { const side: SignSide = { lines: ['', '', '', ''], color: 'black', glowing: false }; return { kind: 'sign', front: side, back: { ...side, lines: [...side.lines] as SignSide['lines'] }, waxed: false }; }
export function signData(value: unknown): SignBlockEntityData {
  if (value && typeof value === 'object' && (value as SignBlockEntityData).kind === 'sign') return value as SignBlockEntityData;
  const raw = value && typeof value === 'object' ? value as Readonly<Record<string, unknown>> : undefined;
  return raw ? { ...defaultSignData(), raw } : defaultSignData();
}
export function signLines(value: string): SignSide['lines'] {
  const values = value.replace(/\r\n?/g, '\n').split('\n').slice(0, 4);
  while (values.length < 4) values.push('');
  return [values[0] ?? '', values[1] ?? '', values[2] ?? '', values[3] ?? ''];
}
export function signLineWidth(value: string): number { return fallbackMinecraftTextWidth(value); }
export function fitsSignWidth(value: string): boolean { return signLineWidth(value) <= NORMAL_SIGN_TEXT_METRICS.maxWidth; }

export function isBlockLocked(project: ProjectDocument, position: VoxelCoordinate): boolean {
  const block = project.blocks.find((entry) => coordinateKey(entry.position) === coordinateKey(position));
  return !!block && hasLockedMembership(block, project.groups);
}

import { Injectable, inject } from '@angular/core';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, SignBlockEntityData, SignSide, VoxelCoordinate } from '../../domain/project.types';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { SelectionService } from '../selection/selection.service';
import { HistoryService } from '../history/history.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { BlockModelResolver } from '../../blocks/resolver/block-model-resolver';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { isBlockLocked as hasLockedMembership } from '../groups/group-membership';
import { BlockRuleEngine, nextCandleState, RuleValidation } from '../../block-behavior/rules/block-rule-engine';
import { expandLogicalObjectClosure, resolveLogicalObjectParts, synchronizeLogicalObjectState, transformPairedHorizontal } from '../../block-behavior/logical-objects/logical-object';
import { PlacementContext } from '../placement/placement';
import { fallbackMinecraftTextWidth, NORMAL_SIGN_TEXT_METRICS } from '../../block-entities/sign/sign-text-metrics';
import { planPlacement, PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { isVanillaSignColor } from '../../block-entities/sign/sign-nbt';
import { decoratedPotData, defaultDecoratedPotData, normalizeDecoratedPotSherd } from '../../block-entities/decorated-pot/decorated-pot';
import { pruneInvalidDecorations } from '../../decorations/placement/decoration-placement';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { BlockEntityKind } from '../../blocks/capabilities/block-capability.types';
import { defaultItemContainerData, setItemContainerSlot } from '../../block-entities/item-display/item-container';
import type { ItemStackData } from '../../items/item-stack.types';

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
      return pruneInvalidDecorations({ ...plan.project, blocks: plan.project.blocks.map((block) => {
        if (!placedKeys.has(coordinateKey(block.position))) return block;
        const entityKind = blockEntityKind(this.library.get(block.id));
        if (entityKind === 'sign' || isSignId(block.id)) return { ...block, blockEntityData: defaultSignData() };
        if (entityKind === 'decorated-pot' || block.id === 'minecraft:decorated_pot') return { ...block, blockEntityData: defaultDecoratedPotData() };
        const itemHost = itemHostCapability(this.library.get(block.id));
        if (itemHost) return { ...block, blockEntityData: defaultItemContainerData(itemHost.kind, itemHost.slotCount) };
        return block;
      }) });
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
      return result.project ? pruneInvalidDecorations(result.project) : result.project;
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
        const result = rules.refresh({ ...project, blocks }, [position]); this.lastValidation = result.validation; return result.project ? pruneInvalidDecorations({ ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } }) : undefined;
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
      const result = this.rules().refresh(updated, [position]); this.lastValidation = result.validation; return result.project ? pruneInvalidDecorations({ ...result.project, metadata: { ...result.project.metadata, updatedAt: new Date().toISOString() } }) : undefined;
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
      const block = this.find(project, position); if (!block || !isSignBlock(block, this.library.get(block.id)) || hasLockedMembership(block, project.groups)) return undefined;
      const current = signData(block.blockEntityData); const target = current[side]; const lines = signLines(value);
      const data: SignBlockEntityData = { ...current, [side]: { ...target, lines } };
      return { ...project, blocks: project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, blockEntityData: data } : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  updateSignAppearance(position: VoxelCoordinate, side: 'front' | 'back', patch: { readonly color?: string; readonly glowing?: boolean }): boolean {
    return this.history.execute('Sign appearance edit', (project) => {
      const block = this.find(project, position); if (!block || !isSignBlock(block, this.library.get(block.id)) || hasLockedMembership(block, project.groups)) return undefined;
      const current = signData(block.blockEntityData); const target = current[side];
      const color = patch.color === undefined ? target.color : patch.color;
      if (!isVanillaSignColor(color)) return undefined;
      const data: SignBlockEntityData = { ...current, [side]: { ...target, color, glowing: patch.glowing ?? target.glowing } };
      return { ...project, blocks: project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, blockEntityData: data } : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  updateSignWaxed(position: VoxelCoordinate, waxed: boolean): boolean {
    return this.history.execute('Sign wax edit', (project) => {
      const block = this.find(project, position); if (!block || !isSignBlock(block, this.library.get(block.id)) || hasLockedMembership(block, project.groups)) return undefined;
      const current = signData(block.blockEntityData); const data: SignBlockEntityData = { ...current, waxed };
      return { ...project, blocks: project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, blockEntityData: data } : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  updateDecoratedPotDecoration(position: VoxelCoordinate, side: 'back' | 'left' | 'right' | 'front', sherd: string): boolean {
    return this.history.execute('Decorated Pot pattern edit', (project) => {
      const block = this.find(project, position);
      if (!block || !(isBlockEntity(this.library.get(block.id), 'decorated-pot') || block.id === 'minecraft:decorated_pot') || hasLockedMembership(block, project.groups)) return undefined;
      const current = decoratedPotData(block.blockEntityData); const data = { ...current, decorations: { ...current.decorations, [side]: normalizeDecoratedPotSherd(sherd) } };
      return { ...project, blocks: project.blocks.map((entry) => coordinateKey(entry.position) === coordinateKey(position) ? { ...entry, blockEntityData: data } : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
  setBlockItemSlot(position: VoxelCoordinate, slot: number, stack: ItemStackData | undefined): boolean {
    return this.history.execute('Item slot edit', (project) => {
      const block = this.find(project, position); const capability = itemHostCapability(block ? this.library.get(block.id) : undefined);
      if (!block || !capability || !Number.isInteger(slot) || slot < 0 || slot >= capability.slotCount || hasLockedMembership(block, project.groups)) return undefined;
      const data = setItemContainerSlot(block.blockEntityData, capability.kind, capability.slotCount, slot, stack);
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

/** Legacy fixture fallback for vanilla signs only; external sources must declare sign capability metadata. */
export function isSignId(id: string): boolean {
  if (!id.startsWith('minecraft:')) return false;
  const path = id.slice('minecraft:'.length);
  return /(?:^|_)(?:wall_)?sign$/.test(path) || path.endsWith('_hanging_sign') || path.endsWith('_wall_hanging_sign');
}
function isSignBlock(block: PlacedBlock, definition: ReturnType<BlockLibraryService['get']>): boolean { return isSignDefinition(definition) || isSignId(block.id); }
function isBlockEntity(definition: ReturnType<BlockLibraryService['get']>, kind: BlockEntityKind): boolean { return blockCapability(definition, 'block-entity')?.entityKind === kind; }
function blockEntityKind(definition: ReturnType<BlockLibraryService['get']>): BlockEntityKind | undefined { return blockCapability(definition, 'block-entity')?.entityKind; }
function itemHostCapability(definition: ReturnType<BlockLibraryService['get']>): Extract<import('../../blocks/capabilities/block-capability.types').BlockCapability, { kind: 'item-display' | 'item-storage-display' }> | undefined {
  return blockCapability(definition, 'item-storage-display') ?? blockCapability(definition, 'item-display');
}
export function isSignDefinition(definition: ReturnType<BlockLibraryService['get']>): boolean { return blockCapability(definition, 'block-entity')?.entityKind === 'sign'; }
export function defaultSignData(): SignBlockEntityData { const side: SignSide = { lines: ['', '', '', ''], color: 'black', glowing: false }; return { kind: 'sign', front: side, back: { ...side, lines: [...side.lines] as SignSide['lines'] }, waxed: false }; }
export function signData(value: unknown): SignBlockEntityData {
  const raw = value && typeof value === 'object' ? value as Readonly<Record<string, unknown>> : undefined;
  if (!raw) return defaultSignData();
  const defaults = defaultSignData();
  return {
    ...defaults,
    ...raw,
    kind: 'sign',
    front: normalizeSignSide(raw['front'], defaults.front),
    back: normalizeSignSide(raw['back'], defaults.back),
    waxed: typeof raw['waxed'] === 'boolean' ? raw['waxed'] : defaults.waxed,
    ...((raw['kind'] === 'sign' || raw['raw']) ? {} : { raw }),
  };
}
function normalizeSignSide(value: unknown, fallback: SignSide): SignSide {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Readonly<Record<string, unknown>>;
  const lines = Array.isArray(source['lines']) ? signLines(source['lines'].filter((line): line is string => typeof line === 'string').join('\n')) : fallback.lines;
  const filteredMessages = Array.isArray(source['filteredMessages']) && source['filteredMessages'].length === 4 && source['filteredMessages'].every((line): line is string => typeof line === 'string')
    ? [source['filteredMessages'][0], source['filteredMessages'][1], source['filteredMessages'][2], source['filteredMessages'][3]] as SignSide['filteredMessages'] : fallback.filteredMessages;
  return {
    ...fallback,
    ...source,
    lines,
    filteredMessages,
    color: typeof source['color'] === 'string' && isVanillaSignColor(source['color']) ? source['color'] : fallback.color,
    glowing: typeof source['glowing'] === 'boolean' ? source['glowing'] : fallback.glowing,
  };
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

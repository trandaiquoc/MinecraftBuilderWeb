import { Injectable, computed, inject, signal } from '@angular/core';
import { ActiveBlockService } from '../blocks/active-block.service';
import { ProjectDocument, VoxelCoordinate } from '../domain/project.types';
import { HistoryService } from '../editor/history/history.service';
import { SelectionService } from '../editor/selection/selection.service';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { planDecorationPlacement, DecorationPlacementPlan } from './decoration-placement';
import { DecorationFacing, DecorationKind, DecorationItemStack, PlacedDecoration, paintingVariant } from './decoration.types';

export interface ActiveDecoration {
  readonly kind: DecorationKind;
  readonly variantId?: string;
  readonly item?: DecorationItemStack;
  readonly fixed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DecorationService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly activeBlock = inject(ActiveBlockService);
  readonly active = signal<ActiveDecoration | undefined>(undefined);
  readonly selectedId = signal<string | undefined>(undefined);
  readonly selected = computed(() => {
    const id = this.selectedId(); const project = this.workspace.project();
    return id && project ? project.decorations?.find((entry) => entry.instanceId === id) : undefined;
  });
  private lastPaintingVariant = 'kebab';

  selectPainting(variantId = this.lastPaintingVariant): void { if (paintingVariant(variantId)) { this.lastPaintingVariant = variantId; this.active.set({ kind: 'painting', variantId }); } this.activeBlock.active.set(undefined); }
  selectRandomPainting(): void { this.active.set({ kind: 'painting' }); this.activeBlock.active.set(undefined); }
  selectFrame(glow = false, fixed = false): void { this.active.set({ kind: glow ? 'glow-item-frame' : 'item-frame', fixed }); this.activeBlock.active.set(undefined); }
  selectItem(item: DecorationItemStack): void { const current = this.active(); if (current?.kind !== 'item-frame' && current?.kind !== 'glow-item-frame') return; if (!item.id) { const { item: _item, ...withoutItem } = current; this.active.set(withoutItem); return; } this.active.set({ ...current, item: { ...item, count: 1 } }); }
  clearActive(): void { this.active.set(undefined); this.selectedId.set(undefined); }
  planFromSupport(support: VoxelCoordinate, facing: DecorationFacing): DecorationPlacementPlan {
    const project = this.workspace.project(); const active = this.active();
    return project && active ? planDecorationPlacement(project, active, support, facing) : { status: 'invalid', reason: 'missing-support' };
  }

  placeFromSupport(support: VoxelCoordinate, facing: DecorationFacing): boolean {
    const active = this.active(); const project = this.workspace.project();
    if (!active || !project) return false;
    const plan = this.planFromSupport(support, facing);
    if (!plan.decoration || plan.status !== 'valid') return false;
    const decoration: PlacedDecoration = { ...plan.decoration, instanceId: newInstanceId() };
    return this.history.execute(active.kind === 'painting' ? 'Place painting' : 'Place item frame', (current) => {
      const decorations = current.decorations ?? [];
      if (decorations.some((entry) => entry.anchor.x === decoration.anchor.x && entry.anchor.y === decoration.anchor.y && entry.anchor.z === decoration.anchor.z && entry.facing === facing)) return undefined;
      return { ...current, decorations: [...decorations, decoration], metadata: { ...current.metadata, updatedAt: new Date().toISOString() } };
    });
  }

  delete(id: string): boolean {
    return this.history.execute('Delete decoration', (project) => {
      if (!project.decorations?.some((entry) => entry.instanceId === id)) return undefined;
      this.selectedId.set(undefined);
      return { ...project, decorations: project.decorations.filter((entry) => entry.instanceId !== id), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }

  pick(id: string): void {
    const decoration = this.workspace.project()?.decorations?.find((entry) => entry.instanceId === id);
    if (!decoration) return;
    this.selectedId.set(id); this.selection.clear();
    this.active.set({ kind: decoration.kind, ...(decoration.variantId ? { variantId: decoration.variantId } : {}), ...(decoration.item ? { item: decoration.item } : {}), ...(decoration.fixed !== undefined ? { fixed: decoration.fixed } : {}) });
    this.activeBlock.active.set(undefined);
  }

  select(id: string | undefined): void { this.selectedId.set(id); if (id) this.selection.clear(); }
  clearSelection(): void { this.selectedId.set(undefined); }

  setFrameItem(id: string, item: DecorationItemStack | undefined): boolean {
    return this.updateSelectedFrame(id, (entry) => {
      if (!item) return removeItem(entry);
      // Re-selecting the same imported item must not discard its custom components.
      if (entry.item?.id === item.id) return { ...entry, item: { ...entry.item, count: 1 } };
      return { ...entry, item: { id: item.id, count: 1 } };
    });
  }
  setFrameRotation(id: string, rotation: number): boolean { const value = clampInteger(rotation, 0, 7); return this.updateSelectedFrame(id, (entry) => ({ ...entry, rotation: value as PlacedDecoration['rotation'] })); }
  setFrameInvisible(id: string, invisible: boolean): boolean { return this.updateSelectedFrame(id, (entry) => ({ ...entry, invisible })); }
  setFrameFixed(id: string, fixed: boolean): boolean { return this.updateSelectedFrame(id, (entry) => ({ ...entry, fixed })); }
  setFrameItemDropChance(id: string, chance: number): boolean { if (!Number.isFinite(chance)) return false; return this.updateSelectedFrame(id, (entry) => ({ ...entry, itemDropChance: Math.max(0, Math.min(1, chance)) })); }
  setPaintingVariant(id: string, variantId: string): boolean {
    const project = this.workspace.project(); const current = project?.decorations?.find((entry) => entry.instanceId === id); const variant = paintingVariant(variantId);
    if (!project || !current || current.kind !== 'painting' || !variant) return false;
    const support = { x: current.anchor.x - (current.facing === 'east' ? 1 : current.facing === 'west' ? -1 : 0), y: current.anchor.y - (current.facing === 'up' ? 1 : current.facing === 'down' ? -1 : 0), z: current.anchor.z - (current.facing === 'south' ? 1 : current.facing === 'north' ? -1 : 0) };
    const plan = planDecorationPlacement({ ...project, decorations: (project.decorations ?? []).filter((entry) => entry.instanceId !== id) }, { kind: 'painting', variantId }, support, current.facing);
    if (plan.status !== 'valid') return false;
    return this.history.execute('Change painting variant', (before) => ({ ...before, decorations: (before.decorations ?? []).map((entry) => entry.instanceId === id ? { ...entry, variantId } : entry), metadata: { ...before.metadata, updatedAt: new Date().toISOString() } }));
  }
  private updateSelectedFrame(id: string, change: (entry: PlacedDecoration) => PlacedDecoration): boolean {
    return this.history.execute('Edit decoration', (project) => {
      const current = project.decorations?.find((entry) => entry.instanceId === id);
      if (!current || (current.kind !== 'item-frame' && current.kind !== 'glow-item-frame')) return undefined;
      return { ...project, decorations: project.decorations!.map((entry) => entry.instanceId === id ? change(entry) : entry), metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
    });
  }
}
function removeItem(entry: PlacedDecoration): PlacedDecoration { const { item: _item, ...withoutItem } = entry; return withoutItem; }
function clampInteger(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value))); }
function newInstanceId(): string { try { return crypto.randomUUID(); } catch { return `decoration-${Date.now()}-${Math.random().toString(36).slice(2)}`; } }

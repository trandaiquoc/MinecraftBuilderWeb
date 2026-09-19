import { Injectable, computed, inject, signal } from '@angular/core';
import { ActiveBlockService } from '../blocks/active-block.service';
import { ProjectDocument, VoxelCoordinate } from '../domain/project.types';
import { HistoryService } from '../editor/history.service';
import { SelectionService } from '../editor/selection.service';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { planDecorationPlacement } from './decoration-placement';
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

  selectPainting(variantId = 'kebab'): void { if (paintingVariant(variantId)) this.active.set({ kind: 'painting', variantId }); this.activeBlock.active.set(undefined); }
  selectRandomPainting(): void { this.active.set({ kind: 'painting' }); this.activeBlock.active.set(undefined); }
  selectFrame(glow = false, fixed = false): void { this.active.set({ kind: glow ? 'glow-item-frame' : 'item-frame', fixed }); this.activeBlock.active.set(undefined); }
  selectItem(item: DecorationItemStack): void { const current = this.active(); if (current?.kind !== 'item-frame' && current?.kind !== 'glow-item-frame') return; if (!item.id) { const { item: _item, ...withoutItem } = current; this.active.set(withoutItem); return; } this.active.set({ ...current, item: { ...item, count: 1 } }); }
  clearActive(): void { this.active.set(undefined); this.selectedId.set(undefined); }

  placeFromSupport(support: VoxelCoordinate, facing: DecorationFacing): boolean {
    const active = this.active(); const project = this.workspace.project();
    if (!active || !project) return false;
    const plan = planDecorationPlacement(project, active, support, facing);
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
}
function newInstanceId(): string { try { return crypto.randomUUID(); } catch { return `decoration-${Date.now()}-${Math.random().toString(36).slice(2)}`; } }

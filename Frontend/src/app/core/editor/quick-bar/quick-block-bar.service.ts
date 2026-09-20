import { Injectable, effect, inject, signal } from '@angular/core';
import { ActiveBlock, ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item';
import { DecorationService } from '../../decorations/decoration.service';

export interface QuickBlockEntry extends ActiveBlock { readonly itemId: string; readonly displayName: string; }
const slots = 10;

@Injectable({ providedIn: 'root' })
export class QuickBlockBarService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly activeBlock = inject(ActiveBlockService);
  private readonly decorations = inject(DecorationService);
  readonly active = this.activeBlock.active;
  readonly entries = signal<readonly QuickBlockEntry[]>([]);
  readonly capacity = slots;
  readonly collapsed = signal(false);
  private activeProjectId?: string;
  constructor() { effect(() => { const id = this.workspace.project()?.id; if (id !== this.activeProjectId) { this.activeProjectId = id; this.entries.set(id ? load(id) : []); } }); }
  has(entry: Pick<QuickBlockEntry, 'itemId' | 'id' | 'state'>): boolean { const itemId = canonicalPlaceableItemId(entry.itemId || entry.id); const state = stateKey(entry.state); return this.entries().some((item) => item.itemId === itemId && stateKey(item.state) === state); }
  canAdd(entry: Pick<QuickBlockEntry, 'itemId' | 'id' | 'state'>): boolean { return this.has(entry) || this.entries().length < slots; }
  isFull(): boolean { return this.entries().length >= slots; }
  add(entry: QuickBlockEntry): boolean {
    const canonical = { ...entry, itemId: canonicalPlaceableItemId(entry.itemId || entry.id) };
    if (this.has(canonical)) return false;
    if (this.isFull()) return false;
    this.save([...this.entries(), canonical]);
    return true;
  }
  remove(index: number): void { this.save(this.entries().filter((_, current) => current !== index)); }
  select(entry: QuickBlockEntry): void { this.decorations.clearActive(); this.activeBlock.set(entry); }
  private save(entries: readonly QuickBlockEntry[]): void { this.entries.set(entries); const id = this.activeProjectId; if (!id) return; try { localStorage.setItem(key(id), JSON.stringify(entries)); } catch { /* The palette remains useful for this session. */ } }
}

function key(projectId: string): string { return `minecraft-builder.quick-blocks.${projectId}`; }
function stateKey(state: Readonly<Record<string, string>>): string { return Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(','); }
function load(projectId: string): readonly QuickBlockEntry[] { try { const raw = localStorage.getItem(key(projectId)); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter(valid).map((entry) => { const itemId = canonicalPlaceableItemId(entry.itemId ?? entry.id); return { ...entry, id: itemId, itemId }; }).slice(0, slots) : []; } catch { return []; } }
function valid(value: unknown): value is QuickBlockEntry { if (!value || typeof value !== 'object') return false; const entry = value as Partial<QuickBlockEntry>; return typeof entry.id === 'string' && typeof entry.displayName === 'string' && !!entry.state && typeof entry.state === 'object'; }

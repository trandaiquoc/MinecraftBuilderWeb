import { Injectable, effect, inject, signal } from '@angular/core';
import { ActiveBlock, ActiveBlockService } from '../blocks/active-block.service';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { canonicalPlaceableItemId } from '../blocks/placeable-item';

export interface QuickBlockEntry extends ActiveBlock { readonly itemId: string; readonly displayName: string; }
const slots = 9;

@Injectable({ providedIn: 'root' })
export class QuickBlockBarService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly activeBlock = inject(ActiveBlockService);
  readonly active = this.activeBlock.active;
  readonly entries = signal<readonly QuickBlockEntry[]>([]);
  readonly collapsed = signal(false);
  private activeProjectId?: string;
  constructor() { effect(() => { const id = this.workspace.project()?.id; if (id !== this.activeProjectId) { this.activeProjectId = id; this.entries.set(id ? load(id) : []); } }); }
  add(entry: QuickBlockEntry): void { const canonical = { ...entry, itemId: canonicalPlaceableItemId(entry.itemId || entry.id) }; const next = [...this.entries().filter((item) => item.itemId !== canonical.itemId || stateKey(item.state) !== stateKey(canonical.state)), canonical].slice(-slots); this.save(next); }
  remove(index: number): void { this.save(this.entries().filter((_, current) => current !== index)); }
  select(entry: QuickBlockEntry): void { this.activeBlock.set(entry); }
  private save(entries: readonly QuickBlockEntry[]): void { this.entries.set(entries); const id = this.activeProjectId; if (!id) return; try { localStorage.setItem(key(id), JSON.stringify(entries)); } catch { /* The palette remains useful for this session. */ } }
}

function key(projectId: string): string { return `minecraft-builder.quick-blocks.${projectId}`; }
function stateKey(state: Readonly<Record<string, string>>): string { return Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(','); }
function load(projectId: string): readonly QuickBlockEntry[] { try { const raw = localStorage.getItem(key(projectId)); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter(valid).map((entry) => { const itemId = canonicalPlaceableItemId(entry.itemId ?? entry.id); return { ...entry, id: itemId, itemId }; }).slice(-slots) : []; } catch { return []; } }
function valid(value: unknown): value is QuickBlockEntry { if (!value || typeof value !== 'object') return false; const entry = value as Partial<QuickBlockEntry>; return typeof entry.id === 'string' && typeof entry.displayName === 'string' && !!entry.state && typeof entry.state === 'object'; }

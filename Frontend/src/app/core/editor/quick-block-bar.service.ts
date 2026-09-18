import { Injectable, effect, inject, signal } from '@angular/core';
import { ActiveBlock, ActiveBlockService } from '../blocks/active-block.service';
import { WorkspaceStateService } from '../ui/workspace-state.service';

export interface QuickBlockEntry extends ActiveBlock { readonly displayName: string; }
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
  add(entry: QuickBlockEntry): void { const next = [...this.entries().filter((item) => item.id !== entry.id || stateKey(item.state) !== stateKey(entry.state)), entry].slice(-slots); this.save(next); }
  remove(index: number): void { this.save(this.entries().filter((_, current) => current !== index)); }
  select(entry: QuickBlockEntry): void { this.activeBlock.set(entry); }
  private save(entries: readonly QuickBlockEntry[]): void { this.entries.set(entries); const id = this.activeProjectId; if (!id) return; try { localStorage.setItem(key(id), JSON.stringify(entries)); } catch { /* The palette remains useful for this session. */ } }
}

function key(projectId: string): string { return `minecraft-builder.quick-blocks.${projectId}`; }
function stateKey(state: Readonly<Record<string, string>>): string { return Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}=${value}`).join(','); }
function load(projectId: string): readonly QuickBlockEntry[] { try { const raw = localStorage.getItem(key(projectId)); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter(valid).slice(-slots) : []; } catch { return []; } }
function valid(value: unknown): value is QuickBlockEntry { return !!value && typeof value === 'object' && typeof (value as QuickBlockEntry).id === 'string' && typeof (value as QuickBlockEntry).displayName === 'string' && typeof (value as QuickBlockEntry).state === 'object'; }

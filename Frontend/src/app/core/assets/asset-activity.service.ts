import { Injectable, signal } from '@angular/core';

export type AssetActivityCategory = 'vanilla' | 'cache' | 'mod' | 'system';
export type AssetActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface AssetActivityProgress { readonly loaded: number; readonly total?: number; }
export interface AssetActivityEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly category: AssetActivityCategory;
  readonly level: AssetActivityLevel;
  readonly operation: string;
  readonly message: string;
  readonly progress?: AssetActivityProgress;
}

export interface ProtectedAssetOperation { readonly id: number; readonly label: string; }

/** Ephemeral activity feed shared by Vanilla and mod source workflows. */
@Injectable({ providedIn: 'root' })
export class AssetActivityService {
  readonly entries = signal<readonly AssetActivityEntry[]>([]);
  readonly current = signal<AssetActivityEntry | undefined>(undefined);
  readonly protectedOperations = signal<readonly ProtectedAssetOperation[]>([]);
  readonly hasProtectedOperation = () => this.protectedOperations().length > 0;
  private nextId = 1;
  private nextProtectedId = 1;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  begin(operation: string, message: string, category: AssetActivityCategory = 'vanilla'): AssetActivityEntry {
    const entry = this.push({ category, level: 'info', operation, message });
    this.current.set(entry);
    return entry;
  }

  update(progress?: AssetActivityProgress, message?: string): void {
    const current = this.current();
    if (!current) return;
    this.current.set({ ...current, ...(message ? { message } : {}), ...(progress ? { progress } : {}) });
  }

  event(operation: string, message: string, level: AssetActivityLevel = 'info', category: AssetActivityCategory = 'vanilla'): AssetActivityEntry { return this.push({ category, level, operation, message }); }

  finish(operation: string, message: string, category: AssetActivityCategory = 'vanilla'): void {
    const entry = this.push({ category, level: 'success', operation, message });
    this.current.set(entry);
    this.current.set(undefined);
  }

  fail(operation: string, message: string, category: AssetActivityCategory = 'vanilla'): void {
    const entry = this.push({ category, level: 'error', operation, message });
    this.current.set(entry);
  }

  clear(): void { this.entries.set([]); }

  protect(label: string): number {
    const id = this.nextProtectedId++;
    this.protectedOperations.update((items) => [...items, { id, label }]);
    return id;
  }

  releaseProtected(id: number): void { this.protectedOperations.update((items) => items.filter((item) => item.id !== id)); }

  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.hasProtectedOperation()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  private push(value: Omit<AssetActivityEntry, 'id' | 'timestamp'>): AssetActivityEntry {
    const entry = { ...value, id: this.nextId++, timestamp: Date.now() };
    this.entries.update((items) => [...items, entry].slice(-100));
    return entry;
  }
}

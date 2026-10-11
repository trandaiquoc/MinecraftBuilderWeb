import { Injectable, signal } from '@angular/core';

export type AssetActivityCategory = 'vanilla' | 'cache' | 'mod' | 'system';
export type AssetActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface AssetActivityProgress {
  readonly loaded: number;
  readonly total?: number;
}
export interface AssetActivityEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly category: AssetActivityCategory;
  readonly level: AssetActivityLevel;
  readonly operation: string;
  readonly message: string;
  readonly progress?: AssetActivityProgress;
}

export interface ProtectedAssetOperation {
  readonly id: number;
  readonly label: string;
}

/** Ephemeral activity feed shared by Vanilla and mod source workflows. */
@Injectable({ providedIn: 'root' })
export class AssetActivityService {
  private readonly entriesState = signal<readonly AssetActivityEntry[]>([]);
  private readonly currentState = signal<AssetActivityEntry | undefined>(undefined);
  private readonly protectedOperationsState = signal<readonly ProtectedAssetOperation[]>([]);
  readonly entries = this.entriesState.asReadonly();
  readonly current = this.currentState.asReadonly();
  readonly protectedOperations = this.protectedOperationsState.asReadonly();
  readonly hasProtectedOperation = () => this.protectedOperations().length > 0;
  private nextId = 1;
  private nextProtectedId = 1;

  constructor() {
    if (typeof window !== 'undefined')
      window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  begin(
    operation: string,
    message: string,
    category: AssetActivityCategory = 'vanilla',
  ): AssetActivityEntry {
    const entry = this.push({ category, level: 'info', operation, message });
    this.currentState.set(entry);
    return entry;
  }

  update(progress?: AssetActivityProgress, message?: string): void {
    const current = this.current();
    if (!current) return;
    this.currentState.set({
      ...current,
      ...(message ? { message } : {}),
      ...(progress ? { progress } : {}),
    });
  }

  event(
    operation: string,
    message: string,
    level: AssetActivityLevel = 'info',
    category: AssetActivityCategory = 'vanilla',
  ): AssetActivityEntry {
    return this.push({ category, level, operation, message });
  }

  finish(operation: string, message: string, category: AssetActivityCategory = 'vanilla'): void {
    const entry = this.push({ category, level: 'success', operation, message });
    this.currentState.set(entry);
    this.currentState.set(undefined);
  }

  fail(operation: string, message: string, category: AssetActivityCategory = 'vanilla'): void {
    const entry = this.push({ category, level: 'error', operation, message });
    this.currentState.set(entry);
  }

  cancel(operation: string, message: string, category: AssetActivityCategory = 'mod'): void {
    this.event(operation, message, 'info', category);
    this.currentState.set(undefined);
  }

  timeout(operation: string, message: string, category: AssetActivityCategory = 'mod'): void {
    this.event(operation, message, 'warning', category);
    this.currentState.set(undefined);
  }

  clear(): void {
    this.entriesState.set([]);
  }

  protect(label: string): number {
    const id = this.nextProtectedId++;
    this.protectedOperationsState.update((items) => [...items, { id, label }]);
    return id;
  }

  releaseProtected(id: number): void {
    this.protectedOperationsState.update((items) => items.filter((item) => item.id !== id));
  }

  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.hasProtectedOperation()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  private push(value: Omit<AssetActivityEntry, 'id' | 'timestamp'>): AssetActivityEntry {
    const entry = { ...value, id: this.nextId++, timestamp: Date.now() };
    this.entriesState.update((items) => [...items, entry].slice(-100));
    return entry;
  }
}

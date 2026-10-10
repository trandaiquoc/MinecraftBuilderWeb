import { Injectable, signal } from '@angular/core';

/** View-only block-type emphasis; never participates in project editing state. */
@Injectable({ providedIn: 'root' })
export class BlockUsageHighlightService {
  private readonly highlightedId = signal<string | undefined>(undefined);
  readonly highlightedBlockId = this.highlightedId.asReadonly();

  set(id: string): void {
    this.highlightedId.set(id);
  }
  toggle(id: string): void {
    this.highlightedId.update((current) => (current === id ? undefined : id));
  }
  clear(): void {
    this.highlightedId.set(undefined);
  }
}

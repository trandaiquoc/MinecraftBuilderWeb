import { Injectable, signal } from '@angular/core';

export type EditorTool = 'place' | 'select';

@Injectable({ providedIn: 'root' })
export class EditorToolService {
  private readonly activeState = signal<EditorTool>('place');
  readonly active = this.activeState.asReadonly();

  select(tool: EditorTool): void {
    this.activeState.set(tool);
  }
}

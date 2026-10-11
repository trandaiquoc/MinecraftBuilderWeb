import { Injectable, computed, type Signal } from '@angular/core';
import { UiPreferencesService } from '../../ui/preferences/ui-preferences.service';

export type EditorMode = '3d' | 'y-layer';

@Injectable({ providedIn: 'root' })
export class EditorModeService {
  readonly mode: Signal<EditorMode>;

  constructor(private readonly preferences: UiPreferencesService) {
    this.mode = computed(() => this.preferences.preferences().editorMode);
  }

  setMode(mode: EditorMode): void {
    this.preferences.update({ editorMode: mode });
  }
}

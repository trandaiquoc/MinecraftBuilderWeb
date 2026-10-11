import { Injectable, Optional, signal, type Signal, type WritableSignal } from '@angular/core';
import { UiPreferencesService } from '../../ui/preferences/ui-preferences.service';

export type EditorMode = '3d' | 'y-layer';

@Injectable({ providedIn: 'root' })
export class EditorModeService {
  readonly mode: Signal<EditorMode>;
  private readonly modeState: WritableSignal<EditorMode>;

  constructor(@Optional() private readonly preferences?: UiPreferencesService) {
    this.modeState = signal<EditorMode>(
      this.preferences?.preferences().editorMode ?? readStoredMode(),
    );
    this.mode = this.modeState.asReadonly();
  }

  setMode(mode: EditorMode): void {
    this.modeState.set(mode);
    this.preferences?.update({ editorMode: mode });
    if (!this.preferences) {
      try {
        localStorage.setItem('minecraft-builder.ui-editor-mode', mode);
      } catch {
        /* Browser storage is optional. */
      }
    }
  }
}

function readStoredMode(): EditorMode {
  try {
    const value = localStorage.getItem('minecraft-builder.ui-editor-mode');
    return value === 'y-layer' ? 'y-layer' : '3d';
  } catch {
    return '3d';
  }
}

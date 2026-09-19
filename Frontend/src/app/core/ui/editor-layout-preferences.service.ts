import { Injectable, computed, inject } from '@angular/core';
import { UiPreferencesService } from './ui-preferences.service';

export interface EditorLayoutPreferences { editorToolbarVisible: boolean; leftSidebarVisible: boolean; rightSidebarVisible: boolean; quickBarVisible: boolean; statusBarVisible: boolean; groupMovePanelX?: number; groupMovePanelY?: number; }
const defaults: EditorLayoutPreferences = { editorToolbarVisible: true, leftSidebarVisible: true, rightSidebarVisible: true, quickBarVisible: true, statusBarVisible: true };

@Injectable({ providedIn: 'root' })
export class EditorLayoutPreferencesService {
  private readonly uiPreferences = inject(UiPreferencesService);
  readonly preferences = computed<EditorLayoutPreferences>(() => this.uiPreferences.preferences().layout);
  set<K extends keyof EditorLayoutPreferences>(key: K, value: EditorLayoutPreferences[K]): void {
    this.uiPreferences.setLayout({ [key]: value });
  }
  setGroupMovePanelPosition(x: number, y: number): void {
    this.uiPreferences.setLayout({ groupMovePanelX: x, groupMovePanelY: y });
  }
  reset(): void { this.uiPreferences.setLayout(defaults); }
}

import { Injectable, inject, signal } from '@angular/core';
import { UiPreferencesService } from './ui-preferences.service';

export interface EditorLayoutPreferences { editorToolbarVisible: boolean; leftSidebarVisible: boolean; rightSidebarVisible: boolean; quickBarVisible: boolean; statusBarVisible: boolean; groupMovePanelX?: number; groupMovePanelY?: number; }
const defaults: EditorLayoutPreferences = { editorToolbarVisible: true, leftSidebarVisible: true, rightSidebarVisible: true, quickBarVisible: true, statusBarVisible: true };

@Injectable({ providedIn: 'root' })
export class EditorLayoutPreferencesService {
  private readonly uiPreferences = inject(UiPreferencesService);
  readonly preferences = signal<EditorLayoutPreferences>(this.uiPreferences.preferences().layout);
  set<K extends keyof EditorLayoutPreferences>(key: K, value: EditorLayoutPreferences[K]): void {
    this.uiPreferences.setLayout({ [key]: value });
    this.preferences.set(this.uiPreferences.preferences().layout);
  }
  setGroupMovePanelPosition(x: number, y: number): void {
    this.uiPreferences.setLayout({ groupMovePanelX: x, groupMovePanelY: y });
    this.preferences.set(this.uiPreferences.preferences().layout);
  }
  reset(): void { this.uiPreferences.setLayout(defaults); this.preferences.set(defaults); }
}

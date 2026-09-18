import { Injectable, signal } from '@angular/core';

export interface EditorLayoutPreferences { editorToolbarVisible: boolean; leftSidebarVisible: boolean; rightSidebarVisible: boolean; quickBarVisible: boolean; statusBarVisible: boolean; groupMovePanelX?: number; groupMovePanelY?: number; }
const defaults: EditorLayoutPreferences = { editorToolbarVisible: true, leftSidebarVisible: true, rightSidebarVisible: true, quickBarVisible: true, statusBarVisible: true };

@Injectable({ providedIn: 'root' })
export class EditorLayoutPreferencesService {
  readonly preferences = signal<EditorLayoutPreferences>(this.read());
  set<K extends keyof EditorLayoutPreferences>(key: K, value: EditorLayoutPreferences[K]): void { this.preferences.update((current) => { const next = { ...current, [key]: value }; this.write(next); return next; }); }
  setGroupMovePanelPosition(x: number, y: number): void { this.preferences.update((current) => { const next = { ...current, groupMovePanelX: x, groupMovePanelY: y }; this.write(next); return next; }); }
  reset(): void { this.preferences.set({ ...defaults }); this.write(defaults); }
  private read(): EditorLayoutPreferences { try { const raw = localStorage.getItem('minecraft-builder.editor-layout'); return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }; } catch { return { ...defaults }; } }
  private write(value: EditorLayoutPreferences): void { try { localStorage.setItem('minecraft-builder.editor-layout', JSON.stringify(value)); } catch { /* storage is optional */ } }
}

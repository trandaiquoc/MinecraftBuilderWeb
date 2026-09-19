import { Injectable, signal } from '@angular/core';

export type UiLocale = 'en' | 'vi';
export type ThemePreset = 'dark' | 'light' | 'craft' | 'custom';
export type BaseTheme = 'dark' | 'light';
export type UiFont = 'geist' | 'minecraft-style';

export interface UiPreferences {
  readonly version: 1;
  readonly locale: UiLocale;
  readonly appearance: {
    readonly preset: ThemePreset;
    readonly base: BaseTheme;
    readonly font: UiFont;
  };
  readonly controls: {
    readonly orbitSensitivity: number;
    readonly panSensitivity: number;
    readonly zoomSensitivity: number;
    readonly cameraMoveSpeed: number;
    readonly verticalMoveSpeed: number;
    readonly clickDragThreshold: number;
  };
  readonly layout: {
    readonly editorToolbarVisible: boolean;
    readonly leftSidebarVisible: boolean;
    readonly rightSidebarVisible: boolean;
    readonly quickBarVisible: boolean;
    readonly statusBarVisible: boolean;
    readonly groupMovePanelX?: number;
    readonly groupMovePanelY?: number;
  };
}

const KEY = 'minecraft-builder.ui-preferences';
const LEGACY_LAYOUT_KEY = 'minecraft-builder.editor-layout';
const defaults: UiPreferences = {
  version: 1,
  locale: 'en',
  appearance: { preset: 'dark', base: 'dark', font: 'geist' },
  controls: { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 1, cameraMoveSpeed: 9, verticalMoveSpeed: 9, clickDragThreshold: 5 },
  layout: { editorToolbarVisible: true, leftSidebarVisible: true, rightSidebarVisible: true, quickBarVisible: true, statusBarVisible: true },
};

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  readonly preferences = signal<UiPreferences>(this.read());

  update(patch: Partial<UiPreferences>): void {
    this.commit({ ...this.preferences(), ...patch, version: 1 });
  }

  setLocale(locale: UiLocale): void { this.commit({ ...this.preferences(), locale }); }

  setAppearance(patch: Partial<UiPreferences['appearance']>): void {
    this.commit({ ...this.preferences(), appearance: { ...this.preferences().appearance, ...patch } });
  }

  setControls(patch: Partial<UiPreferences['controls']>): void {
    this.commit({ ...this.preferences(), controls: { ...this.preferences().controls, ...patch } });
  }

  setLayout(patch: Partial<UiPreferences['layout']>): void {
    this.commit({ ...this.preferences(), layout: { ...this.preferences().layout, ...patch } });
  }

  reset(): void { this.commit(defaults); }

  private commit(value: UiPreferences): void {
    this.preferences.set(value);
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Browser storage is optional. */ }
  }

  private read(): UiPreferences {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      const legacy = localStorage.getItem(LEGACY_LAYOUT_KEY);
      const layout = legacy ? normalizeLayout(JSON.parse(legacy)) : defaults.layout;
      const migrated = { ...defaults, layout };
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch { return defaults; }
  }
}

function normalize(value: unknown): UiPreferences {
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<UiPreferences>;
  return {
    ...defaults,
    ...candidate,
    appearance: { ...defaults.appearance, ...(candidate.appearance ?? {}) },
    controls: { ...defaults.controls, ...(candidate.controls ?? {}) },
    layout: { ...defaults.layout, ...(candidate.layout ?? {}) },
    version: 1,
  };
}

function normalizeLayout(value: unknown): UiPreferences['layout'] {
  if (!value || typeof value !== 'object') return defaults.layout;
  return { ...defaults.layout, ...(value as Partial<UiPreferences['layout']>) };
}

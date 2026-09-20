import { Injectable, signal } from '@angular/core';
import { DEFAULT_KEYBINDINGS, KeyboardAction, normalizeBindings } from '../editor/keyboard-bindings';
import { DEFAULT_MOUSE_BINDINGS, MouseAction, normalizeMouseBindings } from '../editor/mouse-bindings';

export type UiLocale = 'en' | 'vi';
export type ThemePreset = 'dark' | 'light' | 'craft' | 'custom';
export type BaseTheme = 'dark' | 'light';
export type UiFont = 'geist' | 'minecraft-style';
export type PersistedEditorMode = '3d' | 'y-layer';

export interface UiPreferences {
  readonly version: 1;
  readonly locale: UiLocale;
  readonly editorMode: PersistedEditorMode;
  readonly appearance: {
    readonly preset: ThemePreset;
    readonly base: BaseTheme;
    readonly font: UiFont;
    readonly editorBackground: BaseTheme;
  };
  readonly controls: {
    readonly orbitSensitivity: number;
    readonly panSensitivity: number;
    readonly zoomSensitivity: number;
    readonly cameraMoveSpeed: number;
    readonly verticalMoveSpeed: number;
    readonly clickDragThreshold: number;
  };
  readonly shortcuts: Readonly<Record<KeyboardAction, string>>;
  readonly mouseBindings: Readonly<Record<MouseAction, string>>;
  readonly layout: {
    readonly editorToolbarVisible: boolean;
    readonly leftSidebarVisible: boolean;
    readonly rightSidebarVisible: boolean;
    readonly quickBarVisible: boolean;
    readonly statusBarVisible: boolean;
    readonly leftSidebarWidth: number;
    readonly rightSidebarWidth: number;
    readonly groupMovePanelX?: number;
    readonly groupMovePanelY?: number;
  };
}

const KEY = 'minecraft-builder.ui-preferences';
const LEGACY_LAYOUT_KEY = 'minecraft-builder.editor-layout';
const defaults: UiPreferences = {
  version: 1,
  locale: 'en',
  editorMode: '3d',
  appearance: { preset: 'craft', base: 'dark', font: 'minecraft-style', editorBackground: 'dark' },
  controls: { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 1, cameraMoveSpeed: 9, verticalMoveSpeed: 9, clickDragThreshold: 5 },
  shortcuts: DEFAULT_KEYBINDINGS,
  mouseBindings: DEFAULT_MOUSE_BINDINGS,
  layout: { editorToolbarVisible: true, leftSidebarVisible: true, rightSidebarVisible: true, quickBarVisible: true, statusBarVisible: true, leftSidebarWidth: 220, rightSidebarWidth: 260 },
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

  defaultPreferences(): UiPreferences { return clonePreferences(defaults); }

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
  const appearance = candidate.appearance && typeof candidate.appearance === 'object' ? candidate.appearance : {};
  const controls = candidate.controls && typeof candidate.controls === 'object' ? candidate.controls : {};
  const shortcuts = normalizeBindings(candidate.shortcuts);
  const mouseBindings = normalizeMouseBindings(candidate.mouseBindings);
  const layout = candidate.layout && typeof candidate.layout === 'object' ? candidate.layout : {};
  return {
    ...defaults,
    ...candidate,
    locale: isLocale(candidate.locale) ? candidate.locale : defaults.locale,
    editorMode: isEditorMode(candidate.editorMode) ? candidate.editorMode : defaults.editorMode,
    appearance: {
      preset: isPreset((appearance as Partial<UiPreferences['appearance']>).preset) ? (appearance as Partial<UiPreferences['appearance']>).preset! : defaults.appearance.preset,
      base: isBase((appearance as Partial<UiPreferences['appearance']>).base) ? (appearance as Partial<UiPreferences['appearance']>).base! : defaults.appearance.base,
      font: isFont((appearance as Partial<UiPreferences['appearance']>).font) ? (appearance as Partial<UiPreferences['appearance']>).font! : defaults.appearance.font,
      editorBackground: isBase((appearance as Partial<UiPreferences['appearance']>).editorBackground) ? (appearance as Partial<UiPreferences['appearance']>).editorBackground! : defaults.appearance.editorBackground,
    },
    controls: {
      orbitSensitivity: numberInRange((controls as Partial<UiPreferences['controls']>).orbitSensitivity, .1, 3, defaults.controls.orbitSensitivity),
      panSensitivity: numberInRange((controls as Partial<UiPreferences['controls']>).panSensitivity, .1, 3, defaults.controls.panSensitivity),
      zoomSensitivity: numberInRange((controls as Partial<UiPreferences['controls']>).zoomSensitivity, .1, 3, defaults.controls.zoomSensitivity),
      cameraMoveSpeed: numberInRange((controls as Partial<UiPreferences['controls']>).cameraMoveSpeed, 1, 30, defaults.controls.cameraMoveSpeed),
      verticalMoveSpeed: numberInRange((controls as Partial<UiPreferences['controls']>).verticalMoveSpeed, 1, 30, defaults.controls.verticalMoveSpeed),
      clickDragThreshold: numberInRange((controls as Partial<UiPreferences['controls']>).clickDragThreshold, 1, 20, defaults.controls.clickDragThreshold),
    },
    shortcuts,
    mouseBindings,
    layout: {
      ...defaults.layout,
      ...layout,
      leftSidebarWidth: numberInRange((layout as Partial<UiPreferences['layout']>).leftSidebarWidth, 180, 520, defaults.layout.leftSidebarWidth),
      rightSidebarWidth: numberInRange((layout as Partial<UiPreferences['layout']>).rightSidebarWidth, 200, 520, defaults.layout.rightSidebarWidth),
    },
    version: 1,
  };
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function isLocale(value: unknown): value is UiLocale { return value === 'en' || value === 'vi'; }
function isPreset(value: unknown): value is ThemePreset { return value === 'dark' || value === 'light' || value === 'craft' || value === 'custom'; }
function isBase(value: unknown): value is BaseTheme { return value === 'dark' || value === 'light'; }
function isFont(value: unknown): value is UiFont { return value === 'geist' || value === 'minecraft-style'; }
function isEditorMode(value: unknown): value is PersistedEditorMode { return value === '3d' || value === 'y-layer'; }

function normalizeLayout(value: unknown): UiPreferences['layout'] {
  if (!value || typeof value !== 'object') return defaults.layout;
  const candidate = value as Partial<UiPreferences['layout']>;
  return {
    editorToolbarVisible: typeof candidate.editorToolbarVisible === 'boolean' ? candidate.editorToolbarVisible : defaults.layout.editorToolbarVisible,
    leftSidebarVisible: typeof candidate.leftSidebarVisible === 'boolean' ? candidate.leftSidebarVisible : defaults.layout.leftSidebarVisible,
    rightSidebarVisible: typeof candidate.rightSidebarVisible === 'boolean' ? candidate.rightSidebarVisible : defaults.layout.rightSidebarVisible,
    quickBarVisible: typeof candidate.quickBarVisible === 'boolean' ? candidate.quickBarVisible : defaults.layout.quickBarVisible,
    statusBarVisible: typeof candidate.statusBarVisible === 'boolean' ? candidate.statusBarVisible : defaults.layout.statusBarVisible,
    leftSidebarWidth: numberInRange(candidate.leftSidebarWidth, 180, 520, defaults.layout.leftSidebarWidth),
    rightSidebarWidth: numberInRange(candidate.rightSidebarWidth, 200, 520, defaults.layout.rightSidebarWidth),
    ...(typeof candidate.groupMovePanelX === 'number' && Number.isFinite(candidate.groupMovePanelX) ? { groupMovePanelX: candidate.groupMovePanelX } : {}),
    ...(typeof candidate.groupMovePanelY === 'number' && Number.isFinite(candidate.groupMovePanelY) ? { groupMovePanelY: candidate.groupMovePanelY } : {}),
  };
}

function clonePreferences(value: UiPreferences): UiPreferences {
  return { ...value, appearance: { ...value.appearance }, controls: { ...value.controls }, shortcuts: { ...value.shortcuts }, mouseBindings: { ...value.mouseBindings }, layout: { ...value.layout } };
}

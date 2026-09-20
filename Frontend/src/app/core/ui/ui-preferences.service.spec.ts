import { afterEach, describe, expect, it } from 'vitest';
import { UiPreferencesService } from './ui-preferences.service';

const key = 'minecraft-builder.ui-preferences';
const legacyKey = 'minecraft-builder.editor-layout';

describe('UiPreferencesService', () => {
  afterEach(() => {
    localStorage.removeItem(key);
    localStorage.removeItem(legacyKey);
  });

  it('uses safe defaults and persists updates', () => {
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    preferences.setAppearance({ preset: 'craft', base: 'dark' });
    preferences.setAppearance({ editorBackground: 'light' });
    preferences.setLocale('vi');
    expect(preferences.preferences().appearance.editorBackground).toBe('light');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ locale: 'vi', appearance: { preset: 'craft', editorBackground: 'light' } });
  });

  it('persists resizable sidebar widths and clamps invalid stored values', () => {
    const preferences = new UiPreferencesService();
    preferences.setLayout({ leftSidebarWidth: 340, rightSidebarWidth: 300 });
    expect(preferences.preferences().layout).toMatchObject({ leftSidebarWidth: 340, rightSidebarWidth: 300 });
    localStorage.setItem(key, JSON.stringify({ layout: { leftSidebarWidth: 20, rightSidebarWidth: 900 } }));
    expect(new UiPreferencesService().preferences().layout).toMatchObject({ leftSidebarWidth: 180, rightSidebarWidth: 520 });
  });

  it('migrates the legacy layout key', () => {
    localStorage.setItem(legacyKey, JSON.stringify({ leftSidebarVisible: false }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().layout.leftSidebarVisible).toBe(false);
    expect(preferences.preferences().layout.rightSidebarVisible).toBe(true);
  });

  it('normalizes corrupt enum and numeric values', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'fr', appearance: { preset: 'neon', font: 'comic' }, controls: { orbitSensitivity: 99, clickDragThreshold: -2 } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    expect(preferences.preferences().appearance.preset).toBe('craft');
    expect(preferences.preferences().appearance.font).toBe('minecraft-style');
    expect(preferences.preferences().controls.orbitSensitivity).toBe(3);
    expect(preferences.preferences().controls.clickDragThreshold).toBe(1);
  });

  it('migrates a missing font size to normal without resetting appearance', () => {
    localStorage.setItem(key, JSON.stringify({ appearance: { preset: 'light', font: 'geist' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().appearance.fontSize).toBe('normal');
    expect(preferences.preferences().appearance.preset).toBe('light');
    preferences.setAppearance({ fontSize: 'large' });
    expect(new UiPreferencesService().preferences().appearance.fontSize).toBe('large');
  });

  it('migrates mouse defaults without losing saved keyboard overrides', () => {
    localStorage.setItem(key, JSON.stringify({ shortcuts: { 'move-forward': 'E' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().shortcuts['move-forward']).toBe('E');
    expect(preferences.preferences().mouseBindings['primary-action']).toBe('LeftClick');
  });
});

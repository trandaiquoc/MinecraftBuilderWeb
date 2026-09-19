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
    preferences.setLocale('vi');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ locale: 'vi', appearance: { preset: 'craft' } });
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
    expect(preferences.preferences().appearance.preset).toBe('dark');
    expect(preferences.preferences().appearance.font).toBe('geist');
    expect(preferences.preferences().controls.orbitSensitivity).toBe(3);
    expect(preferences.preferences().controls.clickDragThreshold).toBe(1);
  });
});

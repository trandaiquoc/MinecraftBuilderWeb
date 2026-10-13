import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UiPreferencesService } from '../preferences/ui-preferences.service';
import { ThemeService } from './theme.service';

const preferencesKey = 'the-block-laundromat.ui-preferences';

describe('ThemeService font state', () => {
  afterEach(() => localStorage.removeItem(preferencesKey));

  beforeEach(() => {
    localStorage.removeItem(preferencesKey);
    TestBed.configureTestingModule({ providers: [ThemeService, UiPreferencesService] });
  });

  it('uses Comfortaa by default and applies the root font attribute', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    TestBed.flushEffects();
    expect(theme.font()).toBe('comfortaa');
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Comfortaa');
  });

  it('keeps Craft and base theme changes from changing the font choice', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    theme.setPreset('craft');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    theme.setPreset('light');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    theme.setFont('chakra-petch');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('chakra-petch');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Chakra Petch');
    theme.setPreset('dark');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('chakra-petch');
  });

  it('supports every theme and font independently without changing the workspace background', () => {
    const theme = TestBed.inject(ThemeService);
    const preferences = TestBed.inject(UiPreferencesService);
    const document = TestBed.inject(DOCUMENT);
    const themes = ['craft', 'light', 'raccoon', 'dark'] as const;
    const fonts = ['comfortaa', 'chakra-petch', 'pangolin'] as const;
    const familyNames = ['Comfortaa', 'Chakra Petch', 'Pangolin'] as const;

    theme.setEditorBackground('light');
    for (const preset of themes) {
      theme.setPreset(preset);
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe(preset);
      expect(preferences.preferences().appearance.editorBackground).toBe('light');
      for (const [index, font] of fonts.entries()) {
        theme.setFont(font);
        TestBed.flushEffects();
        expect(theme.font()).toBe(font);
        expect(document.documentElement.dataset['font']).toBe(font);
        expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain(
          familyNames[index],
        );
      }
    }
    expect(document.documentElement.style.getPropertyValue('--editor-viewport-bg')).toBe('#e3e8ee');
  });

  it('applies custom legacy theme appearance through its selected base', () => {
    const theme = TestBed.inject(ThemeService);
    const preferences = TestBed.inject(UiPreferencesService);
    const document = TestBed.inject(DOCUMENT);
    preferences.setAppearance({ preset: 'custom', base: 'light' });
    TestBed.flushEffects();
    expect(theme.selectedPreset()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});

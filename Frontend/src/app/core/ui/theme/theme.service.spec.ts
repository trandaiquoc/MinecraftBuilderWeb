import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiPreferencesService } from '../preferences/ui-preferences.service';
import { ThemeService } from './theme.service';

const preferencesKey = 'minecraft-builder.ui-preferences';

describe('ThemeService font state', () => {
  beforeEach(() => {
    localStorage.removeItem(preferencesKey);
    TestBed.configureTestingModule({ providers: [ThemeService, UiPreferencesService] });
  });

  it('uses Geist by default and applies the root font attribute', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    TestBed.flushEffects();
    expect(theme.font()).toBe('geist');
    expect(document.documentElement.dataset['font']).toBe('geist');
  });

  it('keeps Craft and base theme changes from changing the font choice', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    theme.setPreset('craft');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('geist');
    theme.setPreset('light');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('geist');
    theme.setFont('minecraft-style');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('minecraft-style');
    theme.setPreset('dark');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('minecraft-style');
  });
});

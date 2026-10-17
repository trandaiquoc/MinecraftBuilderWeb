import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../../core/ui/localization/translation-catalogs';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import type { UiLocale } from '../../../core/ui/preferences/ui-preferences.service';
import { ThemeService, type Theme } from '../../../core/ui/theme/theme.service';
import { ProjectScreenControlsComponent } from './project-screen-controls.component';

describe('ProjectScreenControlsComponent', () => {
  it('switches the actual locale and theme preferences and opens Settings', async () => {
    const locale = signal<UiLocale>('en');
    const theme = signal<Theme>('craft');
    const setLocale = vi.fn((next: UiLocale) => locale.set(next));
    const setTheme = vi.fn((next: Theme) => theme.set(next));
    const i18n = {
      locale,
      t: (key: TranslationKey) => key,
      setLocale,
    } as unknown as I18nService;
    const themeService = {
      theme,
      setPreset: setTheme,
    } as unknown as ThemeService;

    await TestBed.configureTestingModule({
      imports: [ProjectScreenControlsComponent],
      providers: [
        { provide: I18nService, useValue: i18n },
        { provide: ThemeService, useValue: themeService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProjectScreenControlsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const settingsRequested = vi.fn();
    fixture.componentInstance.settingsRequested.subscribe(settingsRequested);

    expect(host.querySelector('[data-locale="en"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-theme="craft"]')?.getAttribute('aria-pressed')).toBe('true');

    (host.querySelector('[data-locale="vi"]') as HTMLButtonElement).click();
    (host.querySelector('[data-theme="raccoon"]') as HTMLButtonElement).click();
    (host.querySelector('.settings-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(setLocale).toHaveBeenCalledWith('vi');
    expect(setTheme).toHaveBeenCalledWith('raccoon');
    expect(settingsRequested).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-locale="vi"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-theme="raccoon"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});

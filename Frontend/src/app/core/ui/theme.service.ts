import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject } from '@angular/core';
import { ThemePreset, UiFont, UiPreferencesService } from './ui-preferences.service';

export type Theme = 'light' | 'dark' | 'craft';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly preset = computed<ThemePreset>(() => this.preferences.preferences().appearance.preset);
  readonly theme = computed<Theme>(() => {
    const appearance = this.preferences.preferences().appearance;
    return appearance.preset === 'craft' ? 'craft' : appearance.base;
  });
  readonly effectiveBase = computed(() => this.preferences.preferences().appearance.base);
  readonly font = computed<UiFont>(() => this.preferences.preferences().appearance.font);

  constructor() {
    effect(() => this.apply(this.preset(), this.effectiveBase(), this.font()));
  }

  toggle(): void {
    this.setPreset(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setPreset(preset: ThemePreset): void {
    if (preset === 'craft') this.preferences.setAppearance({ preset, base: 'dark' });
    else if (preset === 'dark' || preset === 'light') this.preferences.setAppearance({ preset, base: preset });
    else this.preferences.setAppearance({ preset });
  }

  setTheme(theme: 'light' | 'dark'): void { this.setPreset(theme); }

  setFont(font: UiFont): void {
    this.preferences.setAppearance({ font });
  }

  private apply(preset: ThemePreset, base: 'dark' | 'light', font: UiFont): void {
    this.document.documentElement.dataset['theme'] = preset === 'custom' ? base : preset;
    this.document.documentElement.dataset['font'] = font;
    this.document.documentElement.style.setProperty('--font-ui', font === 'minecraft-style' ? "'Pixelify Sans Variable'" : "'Geist Variable'");
    this.document.documentElement.style.setProperty('--font-readable', "'Geist Variable'");
    this.document.documentElement.style.setProperty('--font-mono', 'ui-monospace, SFMono-Regular, Consolas, monospace');
  }
}

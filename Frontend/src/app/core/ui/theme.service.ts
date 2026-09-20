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
  readonly editorBackground = computed(() => this.preferences.preferences().appearance.editorBackground);
  readonly font = computed<UiFont>(() => this.preferences.preferences().appearance.font);

  readonly fontSize = computed(() => this.preferences.preferences().appearance.fontSize);

  constructor() {
    effect(() => this.apply(this.preset(), this.effectiveBase(), this.font(), this.fontSize(), this.editorBackground()));
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

  setEditorBackground(background: 'dark' | 'light'): void { this.preferences.setAppearance({ editorBackground: background }); }

  private apply(preset: ThemePreset, base: 'dark' | 'light', font: UiFont, fontSize: 'small' | 'normal' | 'large', editorBackground: 'dark' | 'light'): void {
    this.document.documentElement.dataset['theme'] = preset === 'custom' ? base : preset;
    this.document.documentElement.dataset['font'] = font;
    this.document.documentElement.dataset['fontSize'] = fontSize;
    const baseSize = font === 'minecraft-style' ? { small: '16px', normal: '18px', large: '20px' } : { small: '14px', normal: '16px', large: '18px' };
    this.document.documentElement.style.setProperty('--font-root-size', baseSize[fontSize]);
    this.document.documentElement.style.setProperty('--font-ui', font === 'minecraft-style' ? "'VT323', 'Geist Variable'" : "'Geist Variable'");
    this.document.documentElement.style.setProperty('--font-readable', font === 'minecraft-style' ? "'VT323', 'Geist Variable'" : "'Geist Variable'");
    this.document.documentElement.style.setProperty('--editor-viewport-bg', editorBackground === 'light' ? '#e3e8ee' : '#0c1015');
  }
}

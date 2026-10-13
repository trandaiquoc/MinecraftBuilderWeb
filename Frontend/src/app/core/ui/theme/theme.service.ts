import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject } from '@angular/core';
import { ThemePreset, UiFont, UiPreferencesService } from '../preferences/ui-preferences.service';

export type Theme = 'light' | 'dark' | 'craft' | 'raccoon';

const fontFamilies: Record<UiFont, string> = {
  comfortaa: "'Comfortaa Variable', ui-sans-serif, system-ui, sans-serif",
  'chakra-petch': "'Chakra Petch', ui-sans-serif, system-ui, sans-serif",
  pangolin: "'Pangolin', ui-sans-serif, system-ui, sans-serif",
};

const fontMetrics: Record<UiFont, { body: string; heading: string; control: string }> = {
  comfortaa: { body: '1.4', heading: '1.15', control: '1.2' },
  'chakra-petch': { body: '1.35', heading: '1.1', control: '1.15' },
  pangolin: { body: '1.45', heading: '1.2', control: '1.25' },
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly preset = computed<ThemePreset>(() => this.preferences.preferences().appearance.preset);
  readonly selectedPreset = computed(() =>
    this.preset() === 'custom' ? this.effectiveBase() : this.preset(),
  );
  readonly theme = computed<Theme>(() => {
    const appearance = this.preferences.preferences().appearance;
    return appearance.preset === 'craft' || appearance.preset === 'raccoon'
      ? appearance.preset
      : appearance.base;
  });
  readonly effectiveBase = computed(() => this.preferences.preferences().appearance.base);
  readonly editorBackground = computed(
    () => this.preferences.preferences().appearance.editorBackground,
  );
  readonly font = computed<UiFont>(() => this.preferences.preferences().appearance.font);

  readonly fontSize = computed(() => this.preferences.preferences().appearance.fontSize);

  constructor() {
    effect(() =>
      this.apply(
        this.preset(),
        this.effectiveBase(),
        this.font(),
        this.fontSize(),
        this.editorBackground(),
      ),
    );
  }

  toggle(): void {
    this.setPreset(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setPreset(preset: ThemePreset): void {
    if (preset === 'craft') this.preferences.setAppearance({ preset, base: 'dark' });
    else if (preset === 'dark' || preset === 'light')
      this.preferences.setAppearance({ preset, base: preset });
    else this.preferences.setAppearance({ preset });
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.setPreset(theme);
  }

  setFont(font: UiFont): void {
    this.preferences.setAppearance({ font });
  }

  setEditorBackground(background: 'dark' | 'light'): void {
    this.preferences.setAppearance({ editorBackground: background });
  }

  private apply(
    preset: ThemePreset,
    base: 'dark' | 'light',
    font: UiFont,
    fontSize: 'small' | 'normal' | 'large',
    editorBackground: 'dark' | 'light',
  ): void {
    this.document.documentElement.dataset['theme'] = preset === 'custom' ? base : preset;
    this.document.documentElement.dataset['font'] = font;
    this.document.documentElement.dataset['fontSize'] = fontSize;
    const rootSizes = { small: '14px', normal: '16px', large: '18px' } as const;
    const metrics = fontMetrics[font];
    this.document.documentElement.style.setProperty('--font-root-size', rootSizes[fontSize]);
    this.document.documentElement.style.setProperty('--font-ui', fontFamilies[font]);
    this.document.documentElement.style.setProperty('--font-readable', fontFamilies[font]);
    this.document.documentElement.style.setProperty('--line-height-body', metrics.body);
    this.document.documentElement.style.setProperty('--line-height-heading', metrics.heading);
    this.document.documentElement.style.setProperty('--line-height-control', metrics.control);
    this.document.documentElement.style.setProperty(
      '--editor-viewport-bg',
      editorBackground === 'light' ? '#e3e8ee' : '#0c1015',
    );
  }
}

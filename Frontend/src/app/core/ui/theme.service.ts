import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { UiPreferencesService } from './ui-preferences.service';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly theme = signal<Theme>(this.preferences.preferences().appearance.base);
  readonly font = signal(this.preferences.preferences().appearance.font);

  constructor() {
    this.apply(this.theme(), this.font());
  }

  toggle(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.preferences.setAppearance({ base: theme, preset: theme });
    this.apply(theme, this.font());
  }

  setFont(font: 'geist' | 'minecraft-style'): void {
    this.font.set(font);
    this.preferences.setAppearance({ font });
    this.apply(this.theme(), font);
  }

  private apply(theme: Theme, font: 'geist' | 'minecraft-style'): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.dataset['font'] = font;
  }
}

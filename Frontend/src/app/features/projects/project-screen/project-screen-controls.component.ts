import { Component, inject, output } from '@angular/core';
import { LucideGlobe, LucideSettings } from '@lucide/angular';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import type { TranslationKey } from '../../../core/ui/localization/translation-catalogs';
import { ThemeService, type Theme } from '../../../core/ui/theme/theme.service';
import type { UiLocale } from '../../../core/ui/preferences/ui-preferences.service';

interface ProjectScreenThemeOption {
  readonly id: Theme;
  readonly labelKey: TranslationKey;
}

const themeOptions: readonly ProjectScreenThemeOption[] = [
  { id: 'craft', labelKey: 'themeMinecraft' },
  { id: 'raccoon', labelKey: 'themeRaccoon' },
  { id: 'light', labelKey: 'themeLight' },
  { id: 'dark', labelKey: 'themeDark' },
];

interface ProjectScreenLocaleOption {
  readonly id: UiLocale;
  readonly shortLabel: string;
  readonly labelKey: TranslationKey;
}

const localeOptions: readonly ProjectScreenLocaleOption[] = [
  { id: 'en', shortLabel: 'EN', labelKey: 'languageEnglish' },
  { id: 'vi', shortLabel: 'VI', labelKey: 'languageVietnamese' },
];

@Component({
  selector: 'app-project-screen-controls',
  imports: [LucideGlobe, LucideSettings],
  templateUrl: './project-screen-controls.component.html',
  styleUrl: './project-screen-controls.component.scss',
})
export class ProjectScreenControlsComponent {
  readonly settingsRequested = output<void>();

  protected readonly i18n = inject(I18nService);
  protected readonly themeService = inject(ThemeService);
  protected readonly themeOptions = themeOptions;
  protected readonly localeOptions = localeOptions;

  protected setLocale(locale: UiLocale): void {
    this.i18n.setLocale(locale);
  }

  protected setTheme(theme: Theme): void {
    this.themeService.setPreset(theme);
  }
}

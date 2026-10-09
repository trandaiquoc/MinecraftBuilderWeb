import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject } from '@angular/core';
import { UiPreferencesService, UiLocale } from '../preferences/ui-preferences.service';
import { behaviorSupportTranslations, signColorTranslations, statePropertyTranslations, stateValueTranslations, supportLevelTranslations, translateDomainLabel, visualSupportTranslations } from './domain-label-translations';
import { translateModDiagnostic } from './mod-diagnostic-translations';
import {
  BehaviorSupportLevel,
  BlockSupportLevel,
  VisualSupportLevel,
} from '../../blocks/catalog/block-definition.types';

import { supplementalTranslations, structureExportUiTranslations, structureJsonProjectUiTranslations, structureJsonValidationTranslations, translations } from './translation-catalogs';
import type { Locale, TranslationKey } from './translation-catalogs';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly locale = computed<Locale>(() => this.preferences.preferences().locale);

  constructor() { this.applyLocale(this.locale()); }

  t(key: TranslationKey): string {
    const locale = this.locale();
    const exportTranslation = (structureExportUiTranslations[locale] as Readonly<Record<string, string>>)[key];
    if (exportTranslation) return exportTranslation;
    const projectImportTranslation = (structureJsonProjectUiTranslations[locale] as Readonly<Record<string, string>>)[key];
    if (projectImportTranslation) return projectImportTranslation;
    const validationTranslation = (structureJsonValidationTranslations[locale] as Readonly<Record<string, string>>)[key];
    if (validationTranslation) return validationTranslation;
    return (translations[locale] as Readonly<Record<string, string>>)[key] ?? (supplementalTranslations[locale] as Readonly<Record<string, string>>)[key] ?? key;
  }

  toggleLocale(): void {
    this.setLocale(this.locale() === 'en' ? 'vi' : 'en');
  }

  setLocale(locale: UiLocale): void {
    this.preferences.setLocale(locale);
    this.applyLocale(locale);
  }

  private applyLocale(locale: Locale): void {
    this.document.documentElement.lang = locale;
  }

  stateProperty(value: string): string {
    return translateDomainLabel(value, this.locale(), statePropertyTranslations);
  }
  stateValue(value: string): string {
    return translateDomainLabel(value, this.locale(), stateValueTranslations);
  }
  signColorLabel(value: string): string {
    return translateDomainLabel(value, this.locale(), signColorTranslations);
  }
  supportLevel(value: BlockSupportLevel | 'unknown'): string {
    return translateDomainLabel(value, this.locale(), supportLevelTranslations);
  }
  behaviorSupport(value: BehaviorSupportLevel): string {
    return translateDomainLabel(value, this.locale(), behaviorSupportTranslations);
  }
  visualSupport(value: VisualSupportLevel): string {
    return translateDomainLabel(value, this.locale(), visualSupportTranslations);
  }
  modDiagnostic(code: string, fallback: string, parameters: Readonly<Record<string, string | number>> = {}): string {
    return translateModDiagnostic(code, fallback, parameters, this.locale());
  }
  modDiagnosticGroup(kind: 'blocking' | 'warning' | 'info'): string { return kind === 'blocking' ? this.t('assetManagerBlocking') : kind === 'warning' ? this.t('assetManagerWarnings') : this.t('info'); }
}

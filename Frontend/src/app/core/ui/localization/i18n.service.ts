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

import { supplementalTranslations, structureExportUiTranslations, structureJsonValidationTranslations, translations } from './translation-catalogs';
import type { Locale, TranslationKey } from './translation-catalogs';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly locale = computed<Locale>(() => this.preferences.preferences().locale);

  constructor() { this.applyLocale(this.locale()); }

  t(key: TranslationKey | string): string {
    const locale = this.locale();
    const exportTranslation = structureExportUiTranslations[locale][key as keyof typeof structureExportUiTranslations.en];
    if (exportTranslation) return exportTranslation;
    const validationTranslation = structureJsonValidationTranslations[locale][key];
    if (validationTranslation) return validationTranslation;
    if (key === 'structureJsonCurrentFormat') return locale === 'en' ? 'MinecraftBuilder Structure JSON' : 'Structure JSON MinecraftBuilder';
    if (key === 'structureJsonLimitations') return locale === 'en' ? 'Structure JSON includes blocks, decorations, and verified semantic block entities. Unsupported opaque data may require Project Backup for full fidelity.' : 'Structure JSON bao gom block, do trang tri va block entity semantic da xac minh. Du lieu raw khong duoc ho tro co the can Ban sao luu du an de giu nguyen.';
    if (key === 'structureJsonImportStale') return locale === 'en' ? 'The project changed while this import was waiting. Validate again before applying.' : 'Dự án đã thay đổi trong khi chờ nhập. Hãy kiểm tra lại trước khi áp dụng.';
    if (key === 'structureJsonImportDescription') return locale === 'en' ? 'Paste or load the current Structure JSON format to inspect it before any project changes.' : 'Dán hoặc tải Structure JSON hiện tại để kiểm tra trước khi thay đổi dự án.';
    if (key === 'structureJsonValidationShape') return locale === 'en' ? 'The document does not match the current Structure JSON shape.' : 'Tai lieu khong dung cau truc Structure JSON hien tai.';
    return (translations[locale] as Record<string, string>)[key] ?? supplementalTranslations[locale][key as keyof typeof supplementalTranslations[typeof locale]] ?? key;
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

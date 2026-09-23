import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nService, supplementalTranslations, translationKeySets } from './i18n.service';

afterEach(() => localStorage.removeItem('minecraft-builder.ui-preferences'));

describe('translation dictionaries', () => {
  it('keep exact English and Vietnamese key parity', () => {
    expect(translationKeySets.en).toEqual(translationKeySets.vi);
  });

  it('keeps supplemental Vietnamese UI text readable and localized', () => {
    const values = Object.values(supplementalTranslations.vi);
    const mojibake = /Ãƒ|Ã„|Ã†|Ã‚|Ã¡Âº|Ã¡Â»/;
    expect(Object.keys(supplementalTranslations.en).sort()).toEqual(Object.keys(supplementalTranslations.vi).sort());
    expect(values.some((value) => mojibake.test(value))).toBe(false);
    expect(supplementalTranslations.vi.assetManagerTabVanilla).toBe('Phiên bản Minecraft');
    expect(supplementalTranslations.vi.assetManagerShowTechnicalProgress).toBe('Hiện tiến trình kỹ thuật');
  });

  it('localizes known diagnostics and preserves unknown fallback text', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('vi');
    expect(service.modDiagnostic('nested-jar-skipped', 'raw', { count: 8 })).toContain('8');
    expect(service.modDiagnostic('custom-model-loader', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('minecraft-version-incompatible', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('resource-conflict', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('block-id-conflict', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('unsupported-minecraft-predicate', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('future-code', 'Original diagnostic')).toBe('Original diagnostic');
  });
});

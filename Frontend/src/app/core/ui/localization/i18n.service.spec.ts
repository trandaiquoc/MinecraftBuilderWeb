import { describe, expect, it } from 'vitest';
import { supplementalTranslations, translationKeySets } from './i18n.service';

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
});

import { describe, expect, it } from 'vitest';
import { translationKeySets } from './i18n.service';

describe('translation dictionaries', () => {
  it('keep exact English and Vietnamese key parity', () => {
    expect(translationKeySets.en).toEqual(translationKeySets.vi);
  });
});

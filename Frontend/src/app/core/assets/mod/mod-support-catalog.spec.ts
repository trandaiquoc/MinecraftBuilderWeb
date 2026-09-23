import { describe, expect, it } from 'vitest';
import { matchesModSupportCertification, ModSupportCertification } from './mod-support-catalog';

const record: ModSupportCertification = { modId: 'example', modVersion: '1.0.0', minecraftVersion: '1.21.1', loader: 'fabric', supportLevel: 'fully-supported', fingerprint: 'abc' };
const lookup = (overrides: Partial<{ modId: string; modVersion: string; minecraftVersion: string; loader: 'fabric' | 'forge'; fingerprint: string }> = {}) => ({ metadata: { modId: overrides.modId ?? 'example', modVersion: overrides.modVersion ?? '1.0.0', loader: overrides.loader ?? 'fabric' }, minecraftVersion: overrides.minecraftVersion ?? '1.21.1', fingerprint: overrides.fingerprint ?? 'abc' });

describe('ModSupportCatalog matching', () => {
  it('requires the exact mod/version/Minecraft/loader tuple', () => {
    expect(matchesModSupportCertification(record, lookup())).toBe(true);
    expect(matchesModSupportCertification(record, lookup({ modVersion: '1.0.1' }))).toBe(false);
    expect(matchesModSupportCertification(record, lookup({ minecraftVersion: '1.20.1' }))).toBe(false);
    expect(matchesModSupportCertification(record, lookup({ loader: 'forge' }))).toBe(false);
    expect(matchesModSupportCertification(record, lookup({ modId: 'other' }))).toBe(false);
  });

  it('requires a matching fingerprint when certification includes one', () => {
    expect(matchesModSupportCertification(record, lookup({ fingerprint: 'different' }))).toBe(false);
    expect(matchesModSupportCertification({ ...record, fingerprint: undefined }, lookup({ fingerprint: 'different' }))).toBe(true);
  });
});

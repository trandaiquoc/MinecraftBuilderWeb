import { describe, expect, it } from 'vitest';
import { adoptCommittedHydrationKeys } from './hydration-generation-adoption';

describe('hydration generation adoption', () => {
  it('adopts only visible entries with an equivalent committed signature', () => {
    expect(adoptCommittedHydrationKeys([
      { key: '0,0,0', signature: 'stone|normal', committedSignature: 'stone|normal', visible: true, committed: true },
      { key: '1,0,0', signature: 'oak|normal', committedSignature: 'old|normal', visible: true, committed: true },
      { key: '2,0,0', signature: 'stone|normal', committedSignature: 'stone|normal', visible: false, committed: true },
    ])).toEqual(['0,0,0']);
  });
});

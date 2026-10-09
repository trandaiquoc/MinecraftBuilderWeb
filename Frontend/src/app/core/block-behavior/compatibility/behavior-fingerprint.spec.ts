import { describe, expect, it } from 'vitest';
import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import { extractBehaviorFingerprint } from './behavior-fingerprint';

describe('behavior evidence extraction', () => {
  it('keeps canonical state, model predicates and external evidence policy in the fingerprint', () => {
    const record: AssetBlockRecord = {
      id: 'example:wall_panel', displayName: 'Wall Panel', defaultState: { north: 'none' },
      stateDefinitions: [{ name: 'north', values: ['none', 'low', 'tall'] }],
      resources: { blockstate: 'assets/example/blockstates/wall_panel.json', model: 'example:block/panel', textures: [] },
      behaviorEvidenceRequired: true,
    };
    const fingerprint = extractBehaviorFingerprint(record, { readJson: (path) => path.includes('/blockstates/') ? { variants: { 'north=none': { model: 'example:block/panel' } } } : undefined });
    expect(fingerprint.defaultState).toEqual({ north: 'none' });
    expect(fingerprint.behaviorEvidenceRequired).toBe(true);
    expect(fingerprint.modelChangingProperties).toContain('north');
    expect(fingerprint.evidence.map((entry) => entry.source)).toContain('blockstate');
  });
});

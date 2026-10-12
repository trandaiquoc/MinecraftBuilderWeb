import { describe, expect, it } from 'vitest';
import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import { extractBehaviorFingerprint } from './behavior-fingerprint';

describe('behavior evidence extraction', () => {
  it('keeps canonical state, model predicates and external evidence policy in the fingerprint', () => {
    const record: AssetBlockRecord = {
      id: 'example:wall_panel',
      displayName: 'Wall Panel',
      defaultState: { north: 'none' },
      stateDefinitions: [{ name: 'north', values: ['none', 'low', 'tall'] }],
      resources: {
        blockstate: 'assets/example/blockstates/wall_panel.json',
        model: 'example:block/panel',
        textures: [],
      },
      behaviorEvidenceRequired: true,
    };
    const fingerprint = extractBehaviorFingerprint(record, {
      readJson: (path) =>
        path.includes('/blockstates/')
          ? { variants: { 'north=none': { model: 'example:block/panel' } } }
          : undefined,
    });
    expect(fingerprint.defaultState).toEqual({ north: 'none' });
    expect(fingerprint.behaviorEvidenceRequired).toBe(true);
    expect(fingerprint.modelChangingProperties).toContain('north');
    expect(fingerprint.evidence.map((entry) => entry.source)).toContain('blockstate');
  });

  it('keeps provider, attachment and requirement contracts semantically separate', () => {
    const record: AssetBlockRecord = {
      id: 'example:attached_provider',
      displayName: 'Attached Provider',
      defaultState: { facing: 'north' },
      stateDefinitions: [
        { name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] },
      ],
      resources: { textures: [] },
      supportContracts: ['six-face-attachment', 'plantable-soil'],
      supportRequirements: [
        { direction: 'below', contractId: 'plantable-soil', evidence: 'verified' },
      ],
      semanticEvidence: [
        {
          contractId: 'six-face-attachment',
          provenance: 'trusted-data',
          strength: 'strong',
          supportingTags: [],
          supportingProperties: ['facing'],
          supportingResources: ['data/minecraftbuilder/semantic-manifest.json'],
        },
      ],
    };

    const fingerprint = extractBehaviorFingerprint(record);

    expect(fingerprint.supportContracts).toEqual(['six-face-attachment', 'plantable-soil']);
    expect(fingerprint.verifiedAttachmentContracts).toEqual(['six-face-attachment']);
    expect(fingerprint.supportRequirements).toEqual(['below:plantable-soil']);
    expect(fingerprint.evidence).toContainEqual(
      expect.objectContaining({
        source: 'attachment',
        strength: 'strong',
        provenance: 'trusted-data',
      }),
    );
    expect(fingerprint.evidence).toContainEqual(
      expect.objectContaining({
        source: 'support',
        detail: 'provider contracts:six-face-attachment,plantable-soil',
      }),
    );
    expect(fingerprint.traits).toContain('floor-support');
    expect(fingerprint.traits).toContain('face-attachment');

    const providerOnly = extractBehaviorFingerprint({
      ...record,
      semanticEvidence: [],
      supportRequirements: [],
    });
    expect(providerOnly.verifiedAttachmentContracts).toEqual([]);
    expect(providerOnly.traits).not.toContain('face-attachment');
    expect(providerOnly.traits).not.toContain('floor-support');

    const requirementOnly = extractBehaviorFingerprint({
      ...record,
      supportContracts: [],
      semanticEvidence: [],
    });
    expect(requirementOnly.supportContracts).toEqual([]);
    expect(requirementOnly.verifiedAttachmentContracts).toEqual([]);
    expect(requirementOnly.supportRequirements).toEqual(['below:plantable-soil']);
    expect(requirementOnly.traits).toContain('floor-support');
    expect(requirementOnly.traits).not.toContain('face-attachment');
  });
});

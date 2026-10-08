import { describe, expect, it } from 'vitest';
import { evaluateMinecraftRequirement } from './minecraft-version-predicate';
import { buildExternalModImportReport } from './external-mod-import-report';
import { parseFabricModMetadata, normalizeFabricMetadata } from './mod-loader';

describe('external mod import report', () => {
  it('derives import counts and activation from retained resources and diagnostics', () => {
    const rawMetadata = { id: 'sample', name: 'Sample Mod', version: '1.0.0', depends: { minecraft: '1.21.x' } };
    const normalizedMetadata = normalizeFabricMetadata(rawMetadata);
    const metadata = parseFabricModMetadata(rawMetadata);
    const json = {
      'assets/sample/blockstates/stone.json': { variants: { '': { model: 'sample:block/stone' } } },
      'assets/sample/items/gem.json': { model: 'sample:item/gem' },
      'data/sample/painting_variant/tiny.json': { width: 1, height: 1, asset_id: 'sample:tiny' },
    };

    const report = buildExternalModImportReport({
      sourceId: 'mod:sample',
      metadata,
      normalizedMetadata,
      namespaces: ['sample'],
      json,
      binaryResourceCount: 2,
      minecraftVersion: '1.21.1',
      compatibility: evaluateMinecraftRequirement(normalizedMetadata.minecraftRequirement, '1.21.1'),
      diagnostics: [
        { severity: 'warning', code: 'custom-model-loader', message: 'Not executed' },
        { severity: 'error', code: 'resource-conflict', message: 'Conflicting resource' },
      ],
    });

    expect(report).toMatchObject({
      canActivate: false,
      retainedResourceCount: 5,
      candidateBlockCount: 1,
      blocks: { detected: 1, imported: 1, partial: 1 },
      items: { detected: 1, indexed: 1 },
      decorations: { detected: 1, imported: 1 },
      conflicts: [{ code: 'resource-conflict' }],
      warnings: [{ code: 'custom-model-loader' }],
    });
  });

  it('allows activation only for supported, compatible metadata without blocking diagnostics', () => {
    const normalizedMetadata = normalizeFabricMetadata({ id: 'safe', version: '1.0.0', depends: { minecraft: '1.21.1' } });
    const report = buildExternalModImportReport({
      sourceId: 'mod:safe',
      metadata: parseFabricModMetadata({ id: 'safe', version: '1.0.0', depends: { minecraft: '1.21.1' } }),
      normalizedMetadata,
      namespaces: ['safe'],
      json: {},
      binaryResourceCount: 0,
      minecraftVersion: '1.21.1',
      compatibility: evaluateMinecraftRequirement(normalizedMetadata.minecraftRequirement, '1.21.1'),
      diagnostics: [],
    });
    expect(report.canActivate).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MissingProjectContentSummaryCache,
  summarizeMissingProjectContent,
} from './missing-project-content-summary';
import type { ProjectDocument } from '../../domain/project.types';
import type { ImportedModSummary } from '../../assets/content-asset-runtime.service';

const project = (blocks: ProjectDocument['blocks']): ProjectDocument => ({
  schemaVersion: 3,
  id: 'missing-summary-project',
  metadata: {
    name: 'Missing summary',
    minecraftVersion: '1.21.1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks,
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: 0.28 },
});

describe('summarizeMissingProjectContent', () => {
  it('groups current Missing project blocks by namespace and maps known sources', () => {
    const result = summarizeMissingProjectContent(
      project([
        {
          kind: 'missing',
          id: 'cobblemon:apricorn',
          namespace: 'cobblemon',
          position: { x: 0, y: 0, z: 0 },
          state: {},
        },
        {
          kind: 'missing',
          id: 'cobblemon:apricorn',
          namespace: 'cobblemon',
          position: { x: 1, y: 0, z: 0 },
          state: {},
        },
        {
          kind: 'missing',
          id: 'othermod:machine',
          namespace: 'othermod',
          position: { x: 2, y: 0, z: 0 },
          state: {},
        },
        {
          kind: 'resolved',
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 3, y: 0, z: 0 },
          state: {},
        },
      ]),
      [
        {
          id: 'source-cobblemon',
          kind: 'external',
          displayName: 'Cobblemon',
          minecraftVersion: '1.21.1',
          namespaces: ['cobblemon'],
        },
      ],
      [],
    );
    expect(result.totalMissingBlocks).toBe(3);
    expect(result.groups).toEqual([
      expect.objectContaining({
        namespace: 'cobblemon',
        blockCount: 2,
        uniqueBlockCount: 1,
        sourceName: 'Cobblemon',
      }),
      expect.objectContaining({ namespace: 'othermod', blockCount: 1, uniqueBlockCount: 1 }),
    ]);
  });

  it('reacts to the current project shape rather than retaining old counts', () => {
    expect(
      summarizeMissingProjectContent(
        project([
          {
            kind: 'missing',
            id: 'cobblemon:a',
            namespace: 'cobblemon',
            position: { x: 0, y: 0, z: 0 },
            state: {},
          },
        ]),
      ).totalMissingBlocks,
    ).toBe(1);
    expect(
      summarizeMissingProjectContent(
        project([
          {
            kind: 'resolved',
            id: 'cobblemon:a',
            namespace: 'cobblemon',
            position: { x: 0, y: 0, z: 0 },
            state: {},
          },
        ]),
      ).totalMissingBlocks,
    ).toBe(0);
  });

  it('reuses the summary when only editor settings change', () => {
    const cache = new MissingProjectContentSummaryCache();
    const blocks = [
      {
        kind: 'missing' as const,
        id: 'cobblemon:a',
        namespace: 'cobblemon',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      },
    ];
    const initial = project(blocks);
    const sources = [
      {
        id: 'source-cobblemon',
        kind: 'external' as const,
        displayName: 'Cobblemon',
        minecraftVersion: '1.21.1',
        namespaces: ['cobblemon'],
      },
    ];
    const importedMods: ImportedModSummary[] = [];
    const summary = cache.get(initial, sources, importedMods, 1);

    const settingsOnly = { ...initial, editorSettings: { ...initial.editorSettings, currentY: 3 } };
    expect(cache.get(settingsOnly, sources, importedMods, 1)).toBe(summary);
    expect(cache.get({ ...settingsOnly, blocks: [...blocks] }, sources, importedMods, 1)).not.toBe(
      summary,
    );
  });
});

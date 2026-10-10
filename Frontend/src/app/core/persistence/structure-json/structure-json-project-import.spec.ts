import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { StructureJson } from './structure-json';
import {
  prepareStructureJsonProjectImport,
  proposedStructureProjectName,
} from './structure-json-project-import';

const stone: BlockDefinition = {
  id: 'minecraft:stone',
  namespace: 'minecraft',
  displayName: 'Stone',
  defaultState: {},
  stateDefinitions: [],
  resources: { textures: [] },
  support: 'full',
  behaviorSupport: 'full',
  visualSupport: 'real',
  visualClassification: 'standard-json',
  defaultStateSource: 'authoritative-report',
};
const definitions = (id: string): BlockDefinition | undefined =>
  id === stone.id ? stone : undefined;
const source = (
  blocks: StructureJson['blocks'],
  decorations: StructureJson['decorations'] = [],
  name?: string,
  minecraftVersion = '1.21.1',
): StructureJson => ({
  format: 'minecraftbuilder-structure',
  minecraftVersion,
  ...(name ? { name } : {}),
  blocks,
  decorations,
});
const options = (
  value: StructureJson,
  overrides: Partial<Parameters<typeof prepareStructureJsonProjectImport>[0]> = {},
) =>
  prepareStructureJsonProjectImport({
    source: value,
    filename: 'fallback-name.json',
    fallbackName: 'Untitled structure',
    projectId: 'imported-project',
    autoUseHuge: false,
    getDefinition: definitions,
    ...overrides,
  });

describe('Structure JSON project creation preparation', () => {
  it('infers a Vanilla project from zero-based coordinates', async () => {
    const result = await options(source([{ id: stone.id, x: 15, y: 9, z: 15 }]));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.preview).toMatchObject({
        size: { x: 16, y: 10, z: 16 },
        structureMode: 'vanilla-structure-block',
      });
  });

  it('uses the Huge mode boundary without clipping', async () => {
    const result = await options(source([{ id: stone.id, x: 511, y: 0, z: 511 }]));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.preview).toMatchObject({
        size: { x: 512, y: 1, z: 512 },
        requiresHugeConfirmation: true,
      });
  });

  it('blocks sizes beyond the Huge Structure Blocks limit', async () => {
    expect(await options(source([{ id: stone.id, x: 512, y: 0, z: 0 }]))).toEqual({
      ok: false,
      code: 'unsupported-size',
    });
  });

  it('rejects negative coordinates and empty content without shifting or guessing', async () => {
    expect(await options(source([{ id: stone.id, x: -1, y: 0, z: 0 }]))).toEqual({
      ok: false,
      code: 'negative-coordinates',
    });
    expect(await options(source([]))).toEqual({ ok: false, code: 'empty-structure' });
  });

  it('prefers source name, then filename, while preserving Minecraft version', async () => {
    expect(proposedStructureProjectName(source([], [], '  Named  '), 'file.json', 'Fallback')).toBe(
      'Named',
    );
    expect(proposedStructureProjectName(source([]), 'Cresselia.json', 'Fallback')).toBe(
      'Cresselia',
    );
    const result = await options(
      source([{ id: stone.id, x: 0, y: 0, z: 0 }], [], undefined, '1.20.4'),
    );
    expect(result.ok && result.preview.minecraftVersion).toBe('1.20.4');
  });

  it('automatically marks supported oversized imports as Huge when enabled', async () => {
    const result = await options(source([{ id: stone.id, x: 48, y: 0, z: 0 }]), {
      autoUseHuge: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.preview).toMatchObject({
        structureMode: 'huge-structure-blocks',
        requiresHugeConfirmation: false,
      });
  });

  it('preserves unresolved blocks and decorations in the complete project', async () => {
    const value = source(
      [
        { id: stone.id, x: 0, y: 0, z: 0 },
        { id: 'mod:marble', x: 1, y: 0, z: 0, state: { variant: 'polished' } },
      ],
      [
        {
          kind: 'item-frame',
          anchor: { x: 0, y: 0, z: 1 },
          facing: 'south',
          item: { id: 'minecraft:diamond', count: 1 },
        },
      ],
    );
    const result = await options(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.project).toMatchObject({
        blocks: [
          { kind: 'resolved', id: stone.id },
          { kind: 'missing', id: 'mod:marble', state: { variant: 'polished' } },
        ],
        decorations: [
          {
            kind: 'item-frame',
            anchor: { x: 0, y: 0, z: 1 },
            item: { id: 'minecraft:diamond', count: 1 },
          },
        ],
      });
      expect(result.preview.project?.groups).toEqual([]);
    }
  });
});

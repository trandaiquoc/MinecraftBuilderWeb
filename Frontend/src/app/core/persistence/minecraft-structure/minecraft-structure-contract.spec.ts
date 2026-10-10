import { describe, expect, it } from 'vitest';
import {
  canonicalPaletteEntry,
  classifyStructureSize,
  MINECRAFT_JAVA_1_21_1_DATA_VERSION,
  structureBlockSource,
  structureStateIdentity,
  validateMinecraftStructureProject,
  validateStructureTemplate,
} from './minecraft-structure-contract';
import type { ProjectDocument } from '../../domain/project.types';

const project = (overrides: Partial<ProjectDocument> = {}): ProjectDocument => ({
  schemaVersion: 3,
  id: 'contract-test',
  metadata: { name: 'Contract test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  ...overrides,
});

describe('Minecraft Java Structure NBT contract boundary', () => {
  it('pins Java 1.21.1 to the verified DataVersion', () => {
    expect(MINECRAFT_JAVA_1_21_1_DATA_VERSION).toBe(3955);
    expect(
      validateStructureTemplate({
        dataVersion: 3955,
        size: { x: 1, y: 1, z: 1 },
        palette: [{ name: 'minecraft:stone' }],
        blocks: [],
        entities: [],
      }).valid,
    ).toBe(true);
  });

  it('rejects unsupported project versions without changing the project', () => {
    const value = project({ metadata: { ...project().metadata, minecraftVersion: '26.3' } });
    expect(
      validateMinecraftStructureProject(value).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('unsupported-version');
    expect(value.metadata.minecraftVersion).toBe('26.3');
  });

  it('reports invalid IDs and coordinates at the export boundary', () => {
    const value = project({
      blocks: [
        {
          kind: 'missing',
          id: 'Example:bad path',
          namespace: 'Example',
          position: { x: 4, y: 0, z: 0 },
          state: {},
        },
      ],
    });
    expect(
      validateMinecraftStructureProject(value).diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual(expect.arrayContaining(['invalid-resource-location', 'out-of-bounds']));
  });

  it('does not silently infer arbitrary block entity JSON as NBT', () => {
    const value = project({
      blocks: [
        {
          kind: 'resolved',
          id: 'minecraft:chest',
          namespace: 'minecraft',
          position: { x: 0, y: 0, z: 0 },
          state: {},
          blockEntityData: { custom: true },
        },
      ],
    });
    expect(
      validateMinecraftStructureProject(value).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('unsupported-raw-nbt');
  });

  it('classifies current product size limits without splitting structures', () => {
    expect(classifyStructureSize({ x: 48, y: 48, z: 48 })).toBe('vanilla');
    expect(classifyStructureSize({ x: 49, y: 1, z: 1 })).toBe('huge');
    expect(classifyStructureSize({ x: 513, y: 1, z: 1 })).toBe('unsupported');
    expect(
      validateMinecraftStructureProject(project({ size: { x: 513, y: 1, z: 1 } })).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('unsupported-size');
  });

  it('keeps palette identity stable across property insertion order', () => {
    expect(
      canonicalPaletteEntry('minecraft:oak_stairs', { waterlogged: 'false', facing: 'north' }),
    ).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', waterlogged: 'false' },
    });
    expect(
      structureStateIdentity('minecraft:oak_stairs', { facing: 'north', waterlogged: 'false' }),
    ).toBe(
      structureStateIdentity('minecraft:oak_stairs', { waterlogged: 'false', facing: 'north' }),
    );
    expect(structureStateIdentity('minecraft:oak_stairs', { facing: 'south' })).not.toBe(
      structureStateIdentity('minecraft:oak_stairs', { facing: 'north' }),
    );
  });

  it('preserves missing blocks as their canonical ID/state source', () => {
    const block = {
      kind: 'missing' as const,
      id: 'example:unknown_block',
      namespace: 'example',
      position: { x: 1, y: 2, z: 3 },
      state: { variant: 'raw' },
    };
    expect(structureBlockSource(block)).toEqual({
      id: 'example:unknown_block',
      state: { variant: 'raw' },
      position: { x: 1, y: 2, z: 3 },
      unresolved: true,
    });
    expect(structureBlockSource(block).id).not.toBe('minecraft:air');
  });

  it('keeps the codec port separate from semantic structure validation', () => {
    const document = {
      dataVersion: 3955,
      size: { x: 1, y: 1, z: 1 },
      palette: [{ name: 'minecraft:stone' }],
      blocks: [{ pos: [0, 0, 0] as const, state: 0 }],
      entities: [],
    };
    expect(validateStructureTemplate(document).valid).toBe(true);
    expect(
      validateStructureTemplate({
        ...document,
        blocks: [{ pos: [1, 0, 0] as const, state: 0 }],
      }).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('out-of-bounds');
  });

  it('validates typed block/entity NBT and entity coordinate shapes before encoding', () => {
    const valid = {
      dataVersion: 3955,
      size: { x: 1, y: 1, z: 1 },
      palette: [{ name: 'minecraft:stone' }],
      blocks: [
        {
          pos: [0, 0, 0] as const,
          state: 0,
          nbt: {
            type: 'compound' as const,
            value: { id: { type: 'string' as const, value: 'minecraft:sign' } },
          },
        },
      ],
      entities: [
        {
          pos: [0.5, 0.5, 0.5] as const,
          blockPos: [0, 0, 0] as const,
          nbt: {
            type: 'compound' as const,
            value: { id: { type: 'string' as const, value: 'minecraft:painting' } },
          },
        },
      ],
    };
    expect(validateStructureTemplate(valid).valid).toBe(true);
    const invalid = validateStructureTemplate({
      ...valid,
      blocks: [
        { ...valid.blocks[0], nbt: { type: 'compound', value: { id: 'minecraft:sign' } } as never },
      ],
      entities: [
        {
          ...valid.entities[0],
          pos: [Number.NaN, 0, 0] as never,
          blockPos: [0, 0.5, 0] as never,
          nbt: { type: 'compound', value: { id: 'minecraft:painting' } } as never,
        },
      ],
    });
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['invalid-block-entity', 'invalid-coordinate', 'unsupported-entity']),
    );
  });
});

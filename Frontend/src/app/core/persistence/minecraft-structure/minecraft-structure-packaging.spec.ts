import { describe, expect, it } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import {
  deriveStructureExportDefaults,
  MINECRAFT_JAVA_1_21_1_PACK_FORMAT,
  prepareStandaloneStructureNbt,
  prepareStructureExport,
  validateArchiveName,
  validateStructureExportInput,
  validateStructureNamespace,
  validateStructurePath,
  writeDatapackArchive,
} from './minecraft-structure-packaging';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';

const project = (overrides: Partial<ProjectDocument> = {}): ProjectDocument => ({
  schemaVersion: 3,
  id: 'packaging-test',
  metadata: { name: 'Castle House', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 2, y: 1, z: 1 },
  structureMode: 'vanilla-structure-block',
  blocks: [
    {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: {},
    },
  ],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  ...overrides,
});

describe('Structure NBT packaging contract', () => {
  it('keeps namespace, path and archive validation separate and rejects traversal', () => {
    expect(validateStructureNamespace('minecraftbuilder')).toEqual([]);
    expect(validateStructureNamespace('Example')).toHaveLength(1);
    expect(validateStructureNamespace('..')).toHaveLength(1);
    expect(validateStructureNamespace('../evil')).toHaveLength(1);
    expect(validateStructurePath('houses/castle')).toEqual([]);
    for (const value of [
      '../evil',
      'foo/../evil',
      'foo/../../evil',
      '/absolute',
      'foo\\bar',
      'C:\\evil',
      'foo//bar',
      'foo/./bar',
    ])
      expect(validateStructurePath(value)).toHaveLength(1);
    expect(validateArchiveName('castle-pack')).toEqual([]);
    expect(validateArchiveName('Castle Pack')).toEqual([]);
    for (const value of [' castle', 'castle ', 'castle.', '   ', 'CON.txt', 'LPT1', 'COM9'])
      expect(validateArchiveName(value)).toHaveLength(1);
    expect(validateArchiveName('castle.zip')).toHaveLength(1);
    expect(validateArchiveName('../castle')).toHaveLength(1);
    expect(validateArchiveName('CON')).toHaveLength(1);
  });

  it('derives project-specific paths while reusing only valid cached preferences', () => {
    const defaults = deriveStructureExportDefaults(project());
    expect(defaults).toMatchObject({
      namespace: 'minecraftbuilder',
      structurePath: 'castle-house',
      archiveName: 'castle-house',
      archiveFilename: 'castle-house.zip',
    });
    expect(
      deriveStructureExportDefaults(
        project({ metadata: { ...project().metadata, name: 'Nhà !!!' } }),
        { namespace: 'example_mod', archiveName: 'shared-pack', description: 'Bản xuất UTF-8' },
      ),
    ).toMatchObject({
      namespace: 'example_mod',
      structurePath: 'nha',
      archiveName: 'shared-pack',
      description: 'Bản xuất UTF-8',
    });
    expect(
      deriveStructureExportDefaults(project(), {
        namespace: 'Bad Namespace',
        archiveName: '../bad',
        description: 3 as unknown as string,
      }),
    ).toMatchObject({ namespace: 'minecraftbuilder', archiveName: 'castle-house' });
  });

  it('generates deterministic UTF-8 pack.mcmeta with Java 1.21.1 pack_format', async () => {
    const result = await prepareStructureExport(project(), new NbtifyMinecraftJavaCodec(), {
      namespace: 'minecraftbuilder',
      structurePath: 'houses/castle',
      archiveName: 'castle-pack',
      description: 'Nhà đá',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.datapack.packMcmeta).toBe(
      JSON.stringify({
        pack: { pack_format: MINECRAFT_JAVA_1_21_1_PACK_FORMAT, description: 'Nhà đá' },
      }),
    );
    expect(JSON.parse(result.datapack.packMcmeta)).toEqual({
      pack: { pack_format: 48, description: 'Nhà đá' },
    });
    expect(result.datapack.packMcmeta).not.toContain('"name"');
  });

  it('supports standalone NBT packaging without requiring datapack-only fields', async () => {
    const result = await prepareStandaloneStructureNbt(project(), new NbtifyMinecraftJavaCodec(), {
      namespace: 'minecraftbuilder',
      structurePath: 'houses/castle',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.standalone.resourceLocation).toBe('minecraftbuilder:houses/castle');
    expect(result.standalone.suggestedDownloadFilename).toBe('castle.nbt');
    expect(result.standalone.worldInstallPath).toBe(
      'generated/minecraftbuilder/structures/houses/castle.nbt',
    );
  });

  it('plans exact root datapack entries and reuses the production NBT bytes', async () => {
    const result = await prepareStructureExport(project(), new NbtifyMinecraftJavaCodec(), {
      namespace: 'minecraftbuilder',
      structurePath: 'houses/castle',
      archiveName: 'castle-pack',
      description: 'Smoke',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.standalone.resourceLocation).toBe('minecraftbuilder:houses/castle');
    expect(result.standalone.suggestedDownloadFilename).toBe('castle.nbt');
    expect(result.standalone.worldInstallPath).toBe(
      'generated/minecraftbuilder/structures/houses/castle.nbt',
    );
    expect(result.datapack.datapackEntryPath).toBe(
      'data/minecraftbuilder/structure/houses/castle.nbt',
    );
    expect(result.datapack.entries.map((entry) => entry.path)).toEqual([
      'pack.mcmeta',
      'data/minecraftbuilder/structure/houses/castle.nbt',
    ]);
    expect(result.datapack.entries[1].compression).toBe('store');
    expect(result.datapack.entries[1].bytes).toBe(result.standalone.bytes);
    expect(result.datapack.embeddedNbtBytes).toBe(result.standalone.bytes);
  });

  it('writes a nested datapack ZIP with exactly the planned entries and the same NBT bytes', async () => {
    const result = await prepareStructureExport(project(), new NbtifyMinecraftJavaCodec(), {
      namespace: 'minecraftbuilder',
      structurePath: 'houses/castle',
      archiveName: 'castle-pack',
      description: 'Nhà smoke',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const archive = await writeDatapackArchive(result.datapack);
    expect(archive.ok).toBe(true);
    if (!archive.ok) return;
    expect(archive.archiveFilename).toBe('castle-pack.zip');
    expect(archive.resourceLocation).toBe('minecraftbuilder:houses/castle');
    expect(archive.datapackInstallPath).toBe('<world>/datapacks/castle-pack.zip');
    expect([...archive.embeddedNbtBytes]).toEqual([...result.standalone.bytes]);
    expect(archive.bytes.byteLength).toBeGreaterThan(0);
  });

  it('does not produce ZIP bytes when the exporter rejects unsupported raw data', async () => {
    const result = await prepareStructureExport(
      project({ blocks: [{ ...project().blocks[0], blockEntityData: { raw: true } }] }),
      new NbtifyMinecraftJavaCodec(),
      {
        namespace: 'minecraftbuilder',
        structurePath: 'raw',
        archiveName: 'raw',
        description: 'Raw',
      },
    );
    expect(result.ok).toBe(false);
  });

  it('rejects invalid archive inputs before a ZIP plan can be written', async () => {
    const codec = new NbtifyMinecraftJavaCodec();
    for (const archiveName of [' castle', 'castle ', 'castle.', '   ', 'CON.txt']) {
      const result = await prepareStructureExport(project(), codec, {
        namespace: 'minecraftbuilder',
        structurePath: 'valid',
        archiveName,
        description: 'Invalid archive',
      });
      expect(result.ok).toBe(false);
    }
    const version = await prepareStructureExport(
      project({ metadata: { ...project().metadata, minecraftVersion: '26.3' } }),
      codec,
      {
        namespace: 'minecraftbuilder',
        structurePath: 'valid',
        archiveName: 'valid',
        description: 'Invalid version',
      },
    );
    expect(version.ok).toBe(false);
    const path = await prepareStructureExport(project(), codec, {
      namespace: 'minecraftbuilder',
      structurePath: '../unsafe',
      archiveName: 'valid',
      description: 'Invalid path',
    });
    expect(path.ok).toBe(false);
  });

  it('keeps size compatibility metadata without claiming ZIP adds vanilla capacity', async () => {
    const result = await prepareStructureExport(
      project({ size: { x: 49, y: 1, z: 1 } }),
      new NbtifyMinecraftJavaCodec(),
      {
        namespace: 'minecraftbuilder',
        structurePath: 'large',
        archiveName: 'large',
        description: 'Large',
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.standalone.sizeClass).toBe('huge');
    expect(result.standalone.vanillaStructureBlockCompatible).toBe(false);
    expect(result.standalone.hugeStructureBlocksCompatible).toBe(true);
  });

  it('shares the exporter failure boundary for unsupported raw block data and versions', async () => {
    const raw = await prepareStructureExport(
      project({ blocks: [{ ...project().blocks[0], blockEntityData: { raw: true } }] }),
      new NbtifyMinecraftJavaCodec(),
      {
        namespace: 'minecraftbuilder',
        structurePath: 'raw',
        archiveName: 'raw',
        description: 'Raw',
      },
    );
    expect(raw.ok).toBe(false);
    if (!raw.ok)
      expect(raw.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unsupported-raw-nbt');
    expect(
      validateStructureExportInput(
        project({ metadata: { ...project().metadata, minecraftVersion: '26.3' } }),
        { namespace: 'minecraftbuilder', structurePath: 'x', archiveName: 'x', description: 'x' },
      ).map((diagnostic) => diagnostic.code),
    ).toContain('unsupported-packaging-version');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import { prepareAndDownloadStructure, preflightStructureExport, type StructureExportDownloadPort } from './minecraft-structure-export.service';
import { BrowserDownloadService } from './browser-download.service';
import { MinecraftStructureExportService } from './minecraft-structure-export.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { UiPreferencesService } from '../../ui/preferences/ui-preferences.service';

const project = (): ProjectDocument => ({
  schemaVersion: 3,
  id: 'export-ui-test',
  metadata: { name: 'Castle House', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 2, y: 1, z: 1 },
  structureMode: 'vanilla-structure-block',
  blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} }],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
});

describe('Minecraft structure export application boundary', () => {
  it('preflights standalone mode without requiring ZIP-only fields', () => {
    const result = preflightStructureExport(project(), 'standalone', { namespace: 'minecraftbuilder', structurePath: 'houses/castle', archiveName: 'bad.zip', description: '' });
    expect(result.ok).toBe(true);
    expect(result.metadata?.worldInstallPath).toBe('generated/minecraftbuilder/structures/houses/castle.nbt');
  });

  it('downloads standalone bytes with the exact filename and MIME', async () => {
    const downloads: Array<{ bytes: Uint8Array; filename: string; mimeType: string }> = [];
    const sink: StructureExportDownloadPort = { download: (bytes, filename, mimeType) => downloads.push({ bytes, filename, mimeType }) };
    const result = await prepareAndDownloadStructure(project(), 'standalone', { namespace: 'minecraftbuilder', structurePath: 'houses/castle', archiveName: 'ignored', description: '' }, new NbtifyMinecraftJavaCodec(), sink);
    expect(result.ok).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ filename: 'castle.nbt', mimeType: 'application/octet-stream' });
    const decoded = await new NbtifyMinecraftJavaCodec().decode(downloads[0].bytes);
    expect(decoded.value.value['DataVersion']).toMatchObject({ type: 'int', value: 3955 });
  });

  it('downloads one ZIP with the production archive path and MIME', async () => {
    const downloads: Array<{ bytes: Uint8Array; filename: string; mimeType: string }> = [];
    const sink: StructureExportDownloadPort = { download: (bytes, filename, mimeType) => downloads.push({ bytes, filename, mimeType }) };
    const result = await prepareAndDownloadStructure(project(), 'datapack', { namespace: 'minecraftbuilder', structurePath: 'houses/castle', archiveName: 'castle-pack', description: 'Smoke' }, new NbtifyMinecraftJavaCodec(), sink);
    expect(result.ok).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('castle-pack.zip');
    expect(downloads[0].mimeType).toBe('application/zip');
    expect(downloads[0].bytes.byteLength).toBeGreaterThan(0);
  });

  it('does not download diagnostics for invalid input', async () => {
    let count = 0;
    const sink: StructureExportDownloadPort = { download: () => { count += 1; } };
    const result = await prepareAndDownloadStructure(project(), 'datapack', { namespace: 'MinecraftBuilder', structurePath: 'houses/castle', archiveName: 'castle-pack', description: '' }, new NbtifyMinecraftJavaCodec(), sink);
    expect(result.ok).toBe(false);
    expect(count).toBe(0);
  });

  it('persists only the fields allowed by the successful export mode', async () => {
    const download = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: BrowserDownloadService, useValue: { download } }] });
    const workspace = TestBed.inject(WorkspaceStateService);
    const preferences = TestBed.inject(UiPreferencesService);
    workspace.activate(project(), undefined);
    const service = TestBed.inject(MinecraftStructureExportService);
    const form = { namespace: 'example_mod', structurePath: 'houses/castle', archiveName: 'castle-pack', description: 'Unicode mô tả' };
    expect((await service.download('standalone', form)).ok).toBe(true);
    expect(preferences.preferences().structureExport).toMatchObject({ namespace: 'example_mod', archiveName: '', description: '' });
    expect((await service.download('datapack', form)).ok).toBe(true);
    expect(preferences.preferences().structureExport).toMatchObject({ namespace: 'example_mod', archiveName: 'castle-pack', description: 'Unicode mô tả' });
    expect(download).toHaveBeenCalledTimes(2);
  });
});

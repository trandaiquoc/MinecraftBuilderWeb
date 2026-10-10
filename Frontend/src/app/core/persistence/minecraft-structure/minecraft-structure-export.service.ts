import { Injectable, inject } from '@angular/core';
import type { ProjectDocument } from '../../domain/project.types';
import { UiPreferencesService } from '../../ui/preferences/ui-preferences.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { BrowserDownloadService } from './browser-download.service';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import type { MinecraftJavaNbtCodec } from './minecraft-structure-codec';
import {
  deriveStructureExportDefaults,
  createStructureExportMetadata,
  prepareStandaloneStructureNbt,
  prepareStructureExport,
  validateStructureExportInput,
  validateStructureNamespace,
  validateStructurePath,
  writeDatapackArchive,
  type StandaloneStructureNbtInput,
  type StructureExportMetadata,
  type StructurePackagingDiagnostic,
} from './minecraft-structure-packaging';
import {
  classifyStructureSize,
  MINECRAFT_JAVA_1_21_1,
  HUGE_STRUCTURE_AXIS_LIMIT,
} from './minecraft-structure-contract';
import { ItemCatalogService } from '../../items/catalog/item-catalog.service';

export type StructureExportMode = 'standalone' | 'datapack';

export interface StructureExportForm {
  readonly namespace: string;
  readonly structurePath: string;
  readonly archiveName: string;
  readonly description: string;
}

export interface StructureExportPreflight {
  readonly ok: boolean;
  readonly diagnostics: readonly StructurePackagingDiagnostic[];
  readonly metadata?: StructureExportMetadata;
}

export interface StructureExportDownloadResult {
  readonly ok: boolean;
  readonly diagnostics: readonly StructurePackagingDiagnostic[];
  readonly metadata?: StructureExportMetadata;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly byteLength?: number;
}

export interface StructureExportDownloadPort {
  download(bytes: Uint8Array, filename: string, mimeType: string): void;
}

export function preflightStructureExport(
  project: ProjectDocument | undefined,
  mode: StructureExportMode,
  form: StructureExportForm,
): StructureExportPreflight {
  if (!project)
    return {
      ok: false,
      diagnostics: [
        { code: 'invalid-size', message: 'No active project is available.', path: 'project' },
      ],
    };
  const diagnostics: StructurePackagingDiagnostic[] = [
    ...(mode === 'standalone'
      ? [
          ...validateStructureNamespace(form.namespace),
          ...validateStructurePath(form.structurePath),
        ]
      : validateStructureExportInput(project, form)),
  ];
  if (
    project.metadata.minecraftVersion !== MINECRAFT_JAVA_1_21_1 &&
    !diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-packaging-version')
  )
    diagnostics.push({
      code: 'unsupported-packaging-version',
      message: `Export supports Minecraft Java ${MINECRAFT_JAVA_1_21_1} only.`,
      path: 'project.metadata.minecraftVersion',
    });
  if (classifyStructureSize(project.size) === 'unsupported')
    diagnostics.push({
      code: 'unsupported-size',
      message: `Structure axes must be at most ${HUGE_STRUCTURE_AXIS_LIMIT} blocks for the current export workflow.`,
      path: 'size',
    });
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, diagnostics: [], metadata: metadataForPreview(project, mode, form) };
}

export async function prepareAndDownloadStructure(
  project: ProjectDocument | undefined,
  mode: StructureExportMode,
  form: StructureExportForm,
  codec: MinecraftJavaNbtCodec,
  downloadPort: StructureExportDownloadPort,
  resolveMaxStackSize?: (id: string) => number | undefined,
): Promise<StructureExportDownloadResult> {
  const preflight = preflightStructureExport(project, mode, form);
  if (!project) return { ok: false, diagnostics: preflight.diagnostics };
  if (!preflight.ok) return { ok: false, diagnostics: preflight.diagnostics };
  try {
    if (mode === 'standalone') {
      const result = await prepareStandaloneStructureNbt(
        project,
        codec,
        form satisfies StandaloneStructureNbtInput,
        resolveMaxStackSize,
      );
      if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
      const metadata = result.standalone;
      downloadPort.download(
        metadata.bytes,
        metadata.suggestedDownloadFilename,
        'application/octet-stream',
      );
      return {
        ok: true,
        diagnostics: [],
        metadata,
        filename: metadata.suggestedDownloadFilename,
        mimeType: 'application/octet-stream',
        byteLength: metadata.bytes.byteLength,
      };
    }
    const prepared = await prepareStructureExport(project, codec, form, resolveMaxStackSize);
    if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics };
    const archive = await writeDatapackArchive(prepared.datapack);
    if (!archive.ok) return { ok: false, diagnostics: archive.diagnostics };
    downloadPort.download(archive.bytes, archive.archiveFilename, 'application/zip');
    return {
      ok: true,
      diagnostics: [],
      metadata: archive,
      filename: archive.archiveFilename,
      mimeType: 'application/zip',
      byteLength: archive.bytes.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'archive-write-failed',
          message: error instanceof Error ? error.message : 'Structure export failed.',
        },
      ],
    };
  }
}

/** Application boundary for export packaging and browser download. */
@Injectable({ providedIn: 'root' })
export class MinecraftStructureExportService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly browserDownload = inject(BrowserDownloadService);
  private readonly codec = new NbtifyMinecraftJavaCodec();
  private readonly itemCatalog = inject(ItemCatalogService);

  defaults(
    project = this.workspace.project(),
  ): ReturnType<typeof deriveStructureExportDefaults> | undefined {
    return project
      ? deriveStructureExportDefaults(project, this.preferences.preferences().structureExport)
      : undefined;
  }

  preflight(
    mode: StructureExportMode,
    form: StructureExportForm,
    project = this.workspace.project(),
  ): StructureExportPreflight {
    return preflightStructureExport(project, mode, form);
  }

  async download(
    mode: StructureExportMode,
    form: StructureExportForm,
    project = this.workspace.project(),
  ): Promise<StructureExportDownloadResult> {
    const result = await prepareAndDownloadStructure(
      project,
      mode,
      form,
      this.codec,
      this.browserDownload,
      (id) => this.itemCatalog.get(id)?.maxStackSize,
    );
    if (result.ok)
      this.preferences.setStructureExport(
        mode === 'standalone'
          ? { namespace: form.namespace }
          : {
              namespace: form.namespace,
              archiveName: form.archiveName,
              description: form.description,
            },
      );
    return result;
  }
}

function metadataForPreview(
  project: ProjectDocument,
  mode: StructureExportMode,
  form: StructureExportForm,
): StructureExportMetadata {
  return createStructureExportMetadata(
    {
      ...form,
      archiveName:
        mode === 'datapack'
          ? form.archiveName
          : form.structurePath.slice(form.structurePath.lastIndexOf('/') + 1),
      description: mode === 'datapack' ? form.description : '',
    },
    project,
  );
}

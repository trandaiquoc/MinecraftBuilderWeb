import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { CURRENT_PROJECT_SCHEMA_VERSION, type ProjectDocument, type ProjectSize } from '../../domain/project.types';
import { canonicalStructureModeForSize } from '../../domain/structure-size-policy';
import { validateProject } from '../../domain/validation';
import { buildStructureJsonImportPlan, prepareStructureJsonImportPlan, type StructureJsonImportPlan } from './structure-json-import-plan';
import { inspectStructureJsonBounds, inferRequiredStructureJsonSize } from './structure-json-bounds';
import { validateParsedStructureJsonPreviewAsync, type StructureJsonValidationCancellation, type StructureJsonValidationPreview } from './structure-json-import';
import type { StructureJson } from './structure-json';

export type StructureJsonProjectImportError = 'empty-structure' | 'negative-coordinates' | 'unsupported-size' | 'validation' | 'invalid-project';

export interface StructureJsonProjectImportPreview {
  readonly source: StructureJson;
  readonly filename: string;
  readonly projectName: string;
  readonly minecraftVersion: string;
  readonly size: ProjectSize;
  readonly structureMode: 'vanilla-structure-block' | 'huge-structure-blocks';
  readonly requiresHugeConfirmation: boolean;
  readonly totalBlocks: number;
  readonly missingBlocks: number;
  readonly totalDecorations: number;
  readonly missingDecorationAssets: number;
  readonly validation: StructureJsonValidationPreview;
  readonly plan: StructureJsonImportPlan;
  readonly project?: ProjectDocument;
}

export type StructureJsonProjectImportResult =
  | { readonly ok: true; readonly preview: StructureJsonProjectImportPreview & { readonly project: ProjectDocument } }
  | { readonly ok: false; readonly code: StructureJsonProjectImportError; readonly preview?: StructureJsonProjectImportPreview };

export interface PrepareStructureJsonProjectImportOptions {
  readonly source: StructureJson;
  readonly filename: string;
  readonly fallbackName: string;
  readonly projectId: string;
  readonly autoUseHuge: boolean;
  readonly getDefinition: (id: string) => BlockDefinition | undefined;
  readonly cancellation?: StructureJsonValidationCancellation;
  readonly onProgress?: (completed: number, total: number) => void;
}

export async function prepareStructureJsonProjectImport(options: PrepareStructureJsonProjectImportOptions): Promise<StructureJsonProjectImportResult> {
  const { source } = options;
  const bounds = inspectStructureJsonBounds(source, { x: 1, y: 1, z: 1 });
  if (!bounds.hasCoordinateContent) return { ok: false, code: 'empty-structure' };
  if (bounds.hasNegativeCoordinates) return { ok: false, code: 'negative-coordinates' };
  const size = inferRequiredStructureJsonSize(source);
  const structureMode = size ? canonicalStructureModeForSize(size) : undefined;
  if (!size || !structureMode) return { ok: false, code: 'unsupported-size' };

  const now = new Date().toISOString();
  const projectName = proposedStructureProjectName(source, options.filename, options.fallbackName);
  const baseProject: ProjectDocument = {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: options.projectId,
    metadata: { name: projectName, minecraftVersion: source.minecraftVersion, createdAt: now, updatedAt: now },
    size,
    structureMode,
    blocks: [],
    groups: [],
    decorations: [],
    editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  };
  const validation = await validateParsedStructureJsonPreviewAsync(source, size, options.getDefinition, options.onProgress, options.cancellation, baseProject);
  if (!validation) return { ok: false, code: 'validation' };
  const plan = buildStructureJsonImportPlan(source, validation, baseProject, options.getDefinition, 'replace');
  const preview: StructureJsonProjectImportPreview = {
    source,
    filename: options.filename,
    projectName,
    minecraftVersion: source.minecraftVersion,
    size,
    structureMode,
    requiresHugeConfirmation: structureMode === 'huge-structure-blocks' && !options.autoUseHuge,
    totalBlocks: plan.importedBlockCount,
    missingBlocks: plan.missingBlockCount,
    totalDecorations: plan.importedDecorationCount,
    missingDecorationAssets: plan.missingDecorationAssetCount,
    validation,
    plan,
  };
  if (!plan.applicable) return { ok: false, code: 'validation', preview };
  const project = prepareStructureJsonImportPlan(baseProject, plan);
  if (!project || !validateProject(project).valid) return { ok: false, code: 'invalid-project', preview: { ...preview, project: undefined } };
  return { ok: true, preview: { ...preview, project } };
}

export function proposedStructureProjectName(source: StructureJson, filename: string, fallbackName: string): string {
  const sourceName = source.name?.trim();
  if (sourceName) return sourceName;
  const filenameName = filename.replace(/\.json$/i, '').trim();
  return filenameName || fallbackName;
}

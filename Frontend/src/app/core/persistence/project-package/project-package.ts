import { migrateProject } from '../../domain/migrations';
import { ProjectDocument, CURRENT_PROJECT_SCHEMA_VERSION } from '../../domain/project.types';
import { validateProject } from '../../domain/validation';

export const PROJECT_PACKAGE_FORMAT = 'minecraftbuilder-project' as const;
export const CURRENT_PROJECT_PACKAGE_VERSION = 1 as const;

export interface ProjectPackage {
  readonly format: typeof PROJECT_PACKAGE_FORMAT;
  readonly formatVersion: typeof CURRENT_PROJECT_PACKAGE_VERSION;
  readonly project: ProjectDocument;
}

export type ProjectPackageErrorCategory = 'invalid-json' | 'not-project-package' | 'unsupported-package-version' | 'unsupported-project-schema' | 'invalid-project-data';

export class ProjectPackageError extends Error {
  readonly category: ProjectPackageErrorCategory;
  readonly details?: readonly string[];
  constructor(category: ProjectPackageErrorCategory, message: string, details?: readonly string[]) {
    super(message); this.name = 'ProjectPackageError'; this.category = category; this.details = details;
  }
}

export function serializeProjectPackage(project: ProjectDocument): string {
  return JSON.stringify({ format: PROJECT_PACKAGE_FORMAT, formatVersion: CURRENT_PROJECT_PACKAGE_VERSION, project: migrateProject(project) } satisfies ProjectPackage);
}

export function parseProjectPackage(serialized: string): ProjectDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new ProjectPackageError('invalid-json', `Invalid project package JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (!isRecord(value) || value['format'] !== PROJECT_PACKAGE_FORMAT || !('project' in value)) throw new ProjectPackageError('not-project-package', 'Not a MinecraftBuilder Project Package');
  if (value['formatVersion'] !== CURRENT_PROJECT_PACKAGE_VERSION) throw new ProjectPackageError('unsupported-package-version', `Unsupported project package version: ${String(value['formatVersion'])}`);
  const projectValue = value['project'];
  if (!isProjectShape(projectValue)) throw new ProjectPackageError('invalid-project-data', 'Invalid MinecraftBuilder project data');
  if (projectValue.schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION) throw new ProjectPackageError('unsupported-project-schema', `Project schema ${projectValue.schemaVersion} is newer than supported schema ${CURRENT_PROJECT_SCHEMA_VERSION}`);
  let project: ProjectDocument;
  try { project = migrateProject(projectValue); } catch (error) { throw new ProjectPackageError('unsupported-project-schema', error instanceof Error ? error.message : 'Unsupported project schema'); }
  const validation = validateProject(project);
  if (!validation.valid) throw new ProjectPackageError('invalid-project-data', `Invalid project package data: ${validation.issues.slice(0, 20).map((issue) => issue.message).join('; ')}`, validation.issues.slice(0, 50).map((issue) => `${issue.path ?? 'project'}: ${issue.message}`));
  return project;
}

function isProjectPackage(value: unknown): value is ProjectPackage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProjectPackage>;
  const project = candidate.project;
  return candidate.format === PROJECT_PACKAGE_FORMAT &&
    candidate.formatVersion === CURRENT_PROJECT_PACKAGE_VERSION &&
    !!project &&
    (project.schemaVersion === 1 || project.schemaVersion === 2 || project.schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION) &&
    typeof project.id === 'string' &&
    !!project.metadata &&
    !!project.size &&
    Array.isArray(project.blocks) &&
    Array.isArray(project.groups) &&
    !!project.editorSettings;
}

function isProjectShape(value: unknown): value is ProjectDocument {
  if (!isRecord(value)) return false;
  return typeof value['schemaVersion'] === 'number' && Number.isInteger(value['schemaVersion']) && value['schemaVersion'] > 0 &&
    typeof value['id'] === 'string' && isRecord(value['metadata']) && isRecord(value['size']) && Array.isArray(value['blocks']) && Array.isArray(value['groups']) && isRecord(value['editorSettings']);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

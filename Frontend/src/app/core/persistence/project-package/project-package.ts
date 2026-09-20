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

export function serializeProjectPackage(project: ProjectDocument): string {
  return JSON.stringify({ format: PROJECT_PACKAGE_FORMAT, formatVersion: CURRENT_PROJECT_PACKAGE_VERSION, project: migrateProject(project) } satisfies ProjectPackage);
}

export function parseProjectPackage(serialized: string): ProjectDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error(`Invalid project package JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (!isProjectPackage(value)) throw new Error('Invalid MinecraftBuilder project package');
  const project = migrateProject(value.project);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Invalid project package data: ${validation.issues.map((issue) => issue.message).join('; ')}`);
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

import { migrateProject } from '../domain/migrations';
import { ProjectDocument, ProjectMetadata } from '../domain/project.types';
import { validateProject } from '../domain/validation';
import { parseProjectPackage, serializeProjectPackage } from './project-package/project-package';
import {
  ProjectPersistenceMetadata,
  ProjectRecord,
  ProjectStore,
} from './project-store/project-store.port';

/** Owns explicit project-store operations and persistence-format validation. */
export class ProjectPersistenceService {
  constructor(private readonly store: ProjectStore) {}

  assertProjectValid(project: ProjectDocument): void {
    const result = validateProject(project);
    if (!result.valid)
      throw new Error(`Invalid project: ${result.issues.map((issue) => issue.message).join('; ')}`);
  }

  async create(project: ProjectDocument): Promise<void> {
    this.assertProjectValid(project);
    await this.store.create(migrateProject(project), persistenceMetadata());
  }

  /** Contract for a package that completed migration and validation before persistence. */
  async createValidatedImportedProject(project: ProjectDocument): Promise<void> {
    await this.store.create(migrateProject(project), persistenceMetadata());
  }

  exists(id: string): Promise<boolean> {
    return this.store.exists(id);
  }

  open(id: string): Promise<ProjectDocument | undefined> {
    return this.store.open(id);
  }

  openRecord(id: string): Promise<ProjectRecord | undefined> {
    return this.store.openRecord
      ? this.store.openRecord(id)
      : this.store.open(id).then((project) => (project ? { project, metadata: {} } : undefined));
  }

  async save(project: ProjectDocument): Promise<ProjectSaveResult> {
    this.assertProjectValid(project);
    await this.store.save(migrateProject(project), persistenceMetadata());
    try {
      await this.store.deleteRecoverySnapshot(project.id);
      return {};
    } catch (error) {
      return { recoveryCleanupError: error };
    }
  }

  async saveAs(project: ProjectDocument, newId: string, name?: string): Promise<ProjectDocument> {
    const now = new Date().toISOString();
    const metadata: ProjectMetadata = {
      ...project.metadata,
      name: name?.trim() || project.metadata.name,
      updatedAt: now,
    };
    const copy: ProjectDocument = { ...project, id: newId, metadata };
    this.assertProjectValid(copy);
    await this.store.create(copy, persistenceMetadata());
    return copy;
  }

  list() {
    return this.store.list();
  }

  delete(id: string): Promise<void> {
    return this.store.delete(id);
  }

  exportPackage(project: ProjectDocument): string {
    return serializeProjectPackage(project);
  }

  importPackage(serialized: string): ProjectDocument {
    return parseProjectPackage(serialized);
  }

  openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> {
    return this.store.openRecoverySnapshot(id);
  }

  openRecoveryRecord(id: string): Promise<ProjectRecord | undefined> {
    return this.store.openRecoveryRecord
      ? this.store.openRecoveryRecord(id)
      : this.store
          .openRecoverySnapshot(id)
          .then((project) => (project ? { project, metadata: {} } : undefined));
  }

  deleteRecoverySnapshot(id: string): Promise<void> {
    return this.store.deleteRecoverySnapshot(id);
  }
}

export interface ProjectSaveResult {
  recoveryCleanupError?: unknown;
}

function persistenceMetadata(): ProjectPersistenceMetadata {
  const persistenceToken =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `persist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { persistenceToken, persistedAt: new Date().toISOString() };
}

import { EditorSettings, ProjectDocument, ProjectSize, StructureMode } from '../../domain/project.types';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly minecraftVersion: string;
  readonly size: ProjectSize;
  readonly structureMode: StructureMode;
  readonly updatedAt: string;
}

export interface ProjectPersistenceMetadata {
  readonly persistenceToken?: string;
  readonly persistedAt?: string;
}

export interface ProjectRecord {
  readonly project: ProjectDocument;
  readonly metadata: ProjectPersistenceMetadata;
}

export interface ProjectStore {
  create(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void>;
  exists(id: string): Promise<boolean>;
  open(id: string): Promise<ProjectDocument | undefined>;
  openRecord?(id: string): Promise<ProjectRecord | undefined>;
  save(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void>;
  saveEditorSettings?(projectId: string, settings: EditorSettings): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<readonly ProjectSummary[]>;
  saveRecoverySnapshot(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void>;
  openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined>;
  openRecoveryRecord?(id: string): Promise<ProjectRecord | undefined>;
  deleteRecoverySnapshot(id: string): Promise<void>;
}

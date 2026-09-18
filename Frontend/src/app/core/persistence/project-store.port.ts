import { ProjectDocument } from '../domain/project.types';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface ProjectStore {
  create(project: ProjectDocument): Promise<void>;
  open(id: string): Promise<ProjectDocument | undefined>;
  save(project: ProjectDocument): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<readonly ProjectSummary[]>;
  saveRecoverySnapshot(project: ProjectDocument): Promise<void>;
  openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined>;
  deleteRecoverySnapshot(id: string): Promise<void>;
}

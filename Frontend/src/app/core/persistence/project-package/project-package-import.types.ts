import { ProjectDocument } from '../../domain/project.types';
import { ProjectPackageErrorCategory } from './project-package';

export type ProjectPackageImportStage = 'idle' | 'saving-current' | 'reading-file' | 'parsing' | 'validating' | 'checking-destination' | 'storing' | 'activating' | 'success' | 'error';

export interface ProjectPackageImportState {
  readonly stage: ProjectPackageImportStage;
  readonly filename?: string;
  readonly fileSize?: number;
  readonly projectName?: string;
  readonly blockCount?: number;
  readonly errorCategory?: ProjectPackageErrorCategory | 'read-failed' | 'storage-failed' | 'unexpected';
  readonly errorMessage?: string;
  readonly errorDetails?: readonly string[];
}

export interface ProjectPackageWorkerRequest { readonly type: 'parse'; readonly text?: string; readonly buffer?: ArrayBuffer; }
export interface ProjectPackageWorkerSuccess { readonly ok: true; readonly project: ProjectDocument; }
export interface ProjectPackageWorkerFailure { readonly ok: false; readonly category: ProjectPackageErrorCategory; readonly message: string; readonly details?: readonly string[]; }
export type ProjectPackageWorkerResponse = ProjectPackageWorkerSuccess | ProjectPackageWorkerFailure;

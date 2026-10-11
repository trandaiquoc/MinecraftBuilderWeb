import { ErrorHandler, Inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DEFAULT_MINECRAFT_VERSION,
  ProjectDocument,
  ProjectSize,
  StructureMode,
} from '../../../core/domain/project.types';
import {
  DEFAULT_STRUCTURE_MODE,
  evaluateStructureSize,
  isStructureCreationAllowed,
} from '../../../core/domain/structure-size-policy';
import { validateProject } from '../../../core/domain/validation';
import { EditorSessionService } from '../../../core/editor/state/editor-session.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ProjectDeletionService } from '../../../core/persistence/project-deletion.service';
import { ProjectPersistenceService } from '../../../core/persistence/project-persistence.service';
import { PROJECT_STORE } from '../../../core/persistence/project-store/project-store.token';
import type {
  ProjectStore,
  ProjectSummary,
} from '../../../core/persistence/project-store/project-store.port';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { navigateToEditor } from './editor-navigation';

export interface NewProjectInput {
  readonly name: string;
  readonly minecraftVersion: string;
  readonly size: ProjectSize;
  readonly structureMode: StructureMode;
}

@Injectable()
export class ProjectScreenWorkflow {
  private readonly projectList = signal<readonly ProjectSummary[]>([]);
  private readonly workflowError = signal<string | undefined>(undefined);
  private readonly projectListError = signal(false);
  private readonly projectLoadStatus = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly projectCreationInProgress = signal(false);
  private readonly projectOpeningId = signal<string | undefined>(undefined);
  private readonly projectDeletionsInProgress = signal<ReadonlySet<string>>(new Set());
  private readonly projectDeleteError = signal<string | undefined>(undefined);
  readonly projects = this.projectList.asReadonly();
  readonly error = this.workflowError.asReadonly();
  readonly listError = this.projectListError.asReadonly();
  readonly loadStatus = this.projectLoadStatus.asReadonly();
  readonly creating = this.projectCreationInProgress.asReadonly();
  readonly openingId = this.projectOpeningId.asReadonly();
  readonly deletingProjectIds = this.projectDeletionsInProgress.asReadonly();
  readonly deleteError = this.projectDeleteError.asReadonly();

  private readonly persistence: ProjectPersistenceService;

  constructor(
    @Inject(PROJECT_STORE) store: ProjectStore,
    private readonly workspace: WorkspaceStateService,
    private readonly session: EditorSessionService,
    private readonly router: Router,
    private readonly dialogs: DialogService,
    private readonly i18n: I18nService,
    private readonly errorHandler: ErrorHandler,
    private readonly projectDeletion: ProjectDeletionService,
  ) {
    this.persistence = new ProjectPersistenceService(store);
  }

  clearError(): void {
    this.workflowError.set(undefined);
  }

  async loadProjects(): Promise<void> {
    this.projectLoadStatus.set('loading');
    this.projectListError.set(false);
    try {
      this.projectList.set(await this.persistence.list());
      this.projectLoadStatus.set('ready');
    } catch {
      this.projectList.set([]);
      this.projectListError.set(true);
      this.projectLoadStatus.set('error');
    }
  }

  async createProject(input: NewProjectInput): Promise<void> {
    const guard = projectCreationGuard(
      this.projectCreationInProgress(),
      !!this.projectOpeningId(),
      isStructureCreationAllowed(input.size, input.structureMode),
    );
    if (guard === 'busy') return;
    if (guard === 'invalid') {
      this.workflowError.set(this.creationValidationMessage(input));
      return;
    }

    this.projectCreationInProgress.set(true);
    this.workflowError.set(undefined);
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      schemaVersion: 3,
      id: createId(),
      metadata: {
        name: input.name.trim() || this.i18n.t('untitledStructure'),
        minecraftVersion: input.minecraftVersion,
        createdAt: now,
        updatedAt: now,
      },
      size: input.size,
      structureMode: input.structureMode,
      blocks: [],
      groups: [],
      decorations: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    const validation = validateProject(project);
    if (!validation.valid) {
      const issue = validation.issues[0];
      const detail =
        issue.code === 'invalid-minecraft-version'
          ? this.i18n
              .t('invalidMinecraftVersionValue')
              .replace('{version}', project.metadata.minecraftVersion)
          : issue.message;
      this.workflowError.set(detail);
      await this.dialogs.error(this.i18n.t('createErrorTitle'), detail);
      this.projectCreationInProgress.set(false);
      return;
    }

    try {
      await this.persistence.create(project);
      this.session.resetForProjectChange(project.id);
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch (error) {
      const message = projectCreationFailureMessage(
        error,
        this.i18n.t('createStorageError'),
        this.i18n.t('createError'),
      );
      this.workflowError.set(message);
      await this.dialogs.error(this.i18n.t('createErrorTitle'), message);
    } finally {
      this.projectCreationInProgress.set(false);
    }
  }

  async openProject(id: string): Promise<void> {
    if (this.projectCreationInProgress() || this.projectOpeningId()) return;
    this.projectOpeningId.set(id);
    this.workflowError.set(undefined);
    try {
      const project = await this.persistence.open(id);
      if (!project) throw new Error('Project not found');
      this.session.resetForProjectChange(project.id);
      this.workspace.activate(project);
      await this.router.navigateByUrl('/editor');
    } catch {
      this.workflowError.set(this.i18n.t('openError'));
      await this.dialogs.error(this.i18n.t('openErrorTitle'), this.i18n.t('openError'));
    } finally {
      this.projectOpeningId.set(undefined);
    }
  }

  async deleteProject(summary: ProjectSummary): Promise<void> {
    if (
      this.projectCreationInProgress() ||
      this.projectOpeningId() ||
      !canDeleteProject(this.projectDeletionsInProgress(), summary.id)
    )
      return;

    this.projectDeletionsInProgress.update((ids) => new Set(ids).add(summary.id));
    this.projectDeleteError.set(undefined);
    try {
      const confirmed = await this.dialogs.confirm({
        title: this.i18n.t('deleteProjectTitle'),
        text: this.i18n.t('deleteProjectText').replace('{name}', summary.name),
        confirmButtonText: this.i18n.t('deleteProjectConfirm'),
        cancelButtonText: this.i18n.t('cancel'),
        icon: 'warning',
        destructive: true,
      });
      if (!confirmed) return;

      await this.projectDeletion.deleteProject(summary.id);
      this.projectList.update((items) => items.filter((item) => item.id !== summary.id));
    } catch {
      this.projectDeleteError.set(this.i18n.t('deleteProjectError'));
    } finally {
      this.projectDeletionsInProgress.update((ids) => {
        const next = new Set(ids);
        next.delete(summary.id);
        return next;
      });
    }
  }

  async createImportedProject(project: ProjectDocument): Promise<void> {
    await this.persistence.createValidatedImportedProject(project);
  }

  async activateImportedProject(project: ProjectDocument): Promise<void> {
    this.session.resetForProjectChange(project.id);
    this.workspace.activate(project);
    const navigation = await navigateToEditor(this.router);
    if (navigation.status === 'navigated') return;
    if (navigation.status === 'error') this.errorHandler.handleError(navigation.error);
    const message = this.i18n.t('structureJsonProjectNavigationError');
    this.workflowError.set(message);
    await this.loadProjects();
    await this.dialogs.error(this.i18n.t('openErrorTitle'), message);
  }

  private creationValidationMessage(input: NewProjectInput): string {
    const policy = evaluateStructureSize(input.size, input.structureMode);
    if (!policy.dimensionsValid) return this.i18n.t('invalidProjectSize');
    return !policy.fitsHugeStructureBlocks
      ? this.i18n.t('hugeStructureBlocksLimitExceeded')
      : this.i18n.t('vanillaOversizedWarning');
  }
}

export function projectCreationGuard(
  creating: boolean,
  opening: boolean,
  dimensionsValid: boolean,
): 'busy' | 'invalid' | undefined {
  if (creating || opening) return 'busy';
  return dimensionsValid ? undefined : 'invalid';
}

export function canDeleteProject(
  deletingProjectIds: ReadonlySet<string>,
  projectId: string,
): boolean {
  return !deletingProjectIds.has(projectId);
}

export function projectCreationFailureMessage(
  error: unknown,
  storageMessage: string,
  genericMessage: string,
): string {
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    /indexeddb|storage|quota|transaction/i.test(`${error.name} ${error.message}`)
  )
    return storageMessage;
  if (error instanceof Error && /indexeddb|storage|quota|transaction/i.test(error.message))
    return storageMessage;
  return genericMessage;
}

function createId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`;
}

import type { Router } from '@angular/router';
import type { ProjectDocument } from '../../../core/domain/project.types';
import type { ProjectDeletionService } from '../../../core/persistence/project-deletion.service';
import type {
  ProjectStore,
  ProjectSummary,
} from '../../../core/persistence/project-store/project-store.port';
import type { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import type { EditorSessionService } from '../../../core/editor/state/editor-session.service';
import type { DialogService } from '../../../core/ui/dialog/dialog.service';
import type { I18nService } from '../../../core/ui/localization/i18n.service';
import type { ErrorHandler } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canDeleteProject,
  projectCreationFailureMessage,
  projectCreationGuard,
  ProjectScreenWorkflow,
} from './project-screen-workflow';

const existingProject: ProjectDocument = {
  schemaVersion: 3,
  id: 'existing',
  metadata: {
    name: 'Existing',
    minecraftVersion: '1.21.1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  decorations: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

describe('project screen workflow helpers', () => {
  it('ignores duplicate create/open actions before reporting invalid dimensions', () => {
    expect(projectCreationGuard(true, false, false)).toBe('busy');
    expect(projectCreationGuard(false, true, false)).toBe('busy');
    expect(projectCreationGuard(false, false, false)).toBe('invalid');
    expect(projectCreationGuard(false, false, true)).toBeUndefined();
  });

  it('blocks duplicate deletion for one project without blocking another row', () => {
    expect(canDeleteProject(new Set(['large-project']), 'large-project')).toBe(false);
    expect(canDeleteProject(new Set(['large-project']), 'other-project')).toBe(true);
  });

  it('keeps storage failures distinct from validation failures', () => {
    expect(
      projectCreationFailureMessage(new Error('Invalid Minecraft version'), 'storage', 'generic'),
    ).toBe('generic');
    expect(
      projectCreationFailureMessage(new Error('IndexedDB quota exceeded'), 'storage', 'generic'),
    ).toBe('storage');
  });
});

describe('ProjectScreenWorkflow', () => {
  let store: ProjectStore;
  let stored: Map<string, ProjectDocument>;
  let summaries: ProjectSummary[];
  let workspace: {
    project: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    isRememberedProject: ReturnType<typeof vi.fn>;
    clearRememberedProject: ReturnType<typeof vi.fn>;
  };
  let session: {
    resetForProjectChange: ReturnType<typeof vi.fn>;
    clearActiveProject: ReturnType<typeof vi.fn>;
  };
  let projectDeletion: { deleteProject: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let dialogs: {
    confirm: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let errorHandler: { handleError: ReturnType<typeof vi.fn> };
  let workflow: ProjectScreenWorkflow;

  beforeEach(() => {
    stored = new Map([[existingProject.id, existingProject]]);
    summaries = [summaryFor(existingProject)];
    store = {
      create: vi.fn(async (project) => {
        stored.set(project.id, project);
        summaries.push(summaryFor(project));
      }),
      exists: vi.fn(async (id) => stored.has(id)),
      open: vi.fn(async (id) => stored.get(id)),
      save: vi.fn(async (project) => void stored.set(project.id, project)),
      delete: vi.fn(async (id) => {
        stored.delete(id);
        summaries = summaries.filter((summary) => summary.id !== id);
      }),
      list: vi.fn(async () => [...summaries]),
      saveRecoverySnapshot: vi.fn(async () => undefined),
      openRecoverySnapshot: vi.fn(async () => undefined),
      deleteRecoverySnapshot: vi.fn(async () => undefined),
    };
    workspace = {
      project: vi.fn(() => undefined),
      activate: vi.fn(),
      deactivate: vi.fn(),
      isRememberedProject: vi.fn(() => false),
      clearRememberedProject: vi.fn(),
    };
    session = {
      resetForProjectChange: vi.fn(),
      clearActiveProject: vi.fn(),
    };
    projectDeletion = { deleteProject: vi.fn(async () => undefined) };
    router = { navigateByUrl: vi.fn(async () => true) };
    dialogs = {
      confirm: vi.fn(async () => true),
      error: vi.fn(async () => undefined),
    };
    errorHandler = { handleError: vi.fn() };
    const i18n = { t: (key: string) => key };
    workflow = new ProjectScreenWorkflow(
      store,
      workspace as unknown as WorkspaceStateService,
      session as unknown as EditorSessionService,
      router as unknown as Router,
      dialogs as unknown as DialogService,
      i18n as I18nService,
      errorHandler as unknown as ErrorHandler,
      projectDeletion as unknown as ProjectDeletionService,
    );
  });

  it('creates, persists, activates and navigates as one project workflow', async () => {
    await workflow.createProject({
      name: '  New build  ',
      minecraftVersion: '1.21.1',
      size: { x: 16, y: 16, z: 16 },
      structureMode: 'vanilla-structure-block',
    });

    expect(store.create).toHaveBeenCalledOnce();
    const created = (store.create as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ProjectDocument;
    expect(created.metadata.name).toBe('New build');
    expect(session.resetForProjectChange).toHaveBeenCalledWith(created.id);
    expect(workspace.activate).toHaveBeenCalledWith(created);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/editor');
    expect(workflow.creating()).toBe(false);
  });

  it('loads and opens a project through the same persistence/session boundary', async () => {
    await workflow.loadProjects();
    expect(workflow.projects()).toEqual([summaryFor(existingProject)]);
    expect(workflow.loadStatus()).toBe('ready');

    await workflow.openProject(existingProject.id);

    expect(store.open).toHaveBeenCalledWith(existingProject.id);
    expect(session.resetForProjectChange).toHaveBeenCalledWith(existingProject.id);
    expect(workspace.activate).toHaveBeenCalledWith(existingProject);
    expect(workflow.openingId()).toBeUndefined();
  });

  it('rejects invalid dimensions before persistence', async () => {
    await workflow.createProject({
      name: 'Invalid',
      minecraftVersion: '1.21.1',
      size: { x: 0, y: 16, z: 16 },
      structureMode: 'vanilla-structure-block',
    });

    expect(store.create).not.toHaveBeenCalled();
    expect(workflow.error()).toBe('invalidProjectSize');
  });

  it('does not mutate storage when recent-project deletion is cancelled', async () => {
    dialogs.confirm.mockResolvedValue(false);
    await workflow.loadProjects();

    await workflow.deleteProject(summaryFor(existingProject));

    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(projectDeletion.deleteProject).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(workflow.projects()).toEqual([summaryFor(existingProject)]);
    expect(workflow.deletingProjectIds().size).toBe(0);
  });

  it('delegates confirmed project deletion to the shared lifecycle owner', async () => {
    workspace.project.mockReturnValue(existingProject);
    await workflow.loadProjects();

    await workflow.deleteProject(summaryFor(existingProject));

    expect(projectDeletion.deleteProject).toHaveBeenCalledWith(existingProject.id);
    expect(store.delete).not.toHaveBeenCalled();
    expect(workflow.projects()).toEqual([]);
  });

  it('keeps the project row when the shared deletion owner reports a storage failure', async () => {
    projectDeletion.deleteProject.mockRejectedValue(new Error('storage failed'));
    await workflow.loadProjects();

    await workflow.deleteProject(summaryFor(existingProject));

    expect(workflow.projects()).toEqual([summaryFor(existingProject)]);
    expect(workflow.deleteError()).toBe('deleteProjectError');
    expect(workspace.deactivate).not.toHaveBeenCalled();
  });

  it('restores the prior navigation-error reporting for imported projects', async () => {
    const imported = { ...existingProject, id: 'imported' };
    const navigationFailure = new Error('router rejected navigation');
    router.navigateByUrl.mockRejectedValue(navigationFailure);
    await workflow.loadProjects();

    await workflow.activateImportedProject(imported);

    expect(session.resetForProjectChange).toHaveBeenCalledWith(imported.id);
    expect(workspace.activate).toHaveBeenCalledWith(imported);
    expect(workflow.error()).toBe('structureJsonProjectNavigationError');
    expect(dialogs.error).toHaveBeenCalledWith(
      'openErrorTitle',
      'structureJsonProjectNavigationError',
    );
    expect(errorHandler.handleError).toHaveBeenCalledWith(navigationFailure);
  });

  it('reports cancelled imported-project navigation and refreshes the reopenable list', async () => {
    const imported = { ...existingProject, id: 'imported-cancelled' };
    router.navigateByUrl.mockResolvedValue(false);
    await workflow.loadProjects();

    await workflow.activateImportedProject(imported);

    expect(workspace.activate).toHaveBeenCalledWith(imported);
    expect(workflow.projects()).toEqual([summaryFor(existingProject)]);
    expect(dialogs.error).toHaveBeenCalledWith(
      'openErrorTitle',
      'structureJsonProjectNavigationError',
    );
  });
});

function summaryFor(project: ProjectDocument): ProjectSummary {
  return {
    id: project.id,
    name: project.metadata.name,
    minecraftVersion: project.metadata.minecraftVersion,
    size: project.size,
    structureMode: project.structureMode,
    updatedAt: project.metadata.updatedAt,
  };
}

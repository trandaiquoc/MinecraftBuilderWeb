import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../core/domain/project.types';
import type { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import {
  canDeleteProject,
  projectCreationFailureMessage,
  projectCreationGuard,
  ProjectScreenComponent,
} from './project-screen.component';

describe('projectCreationGuard', () => {
  it('ignores duplicate create/open actions without reporting invalid dimensions', () => {
    expect(projectCreationGuard(true, false, false)).toBe('busy');
    expect(projectCreationGuard(false, true, false)).toBe('busy');
  });

  it('reports invalid dimensions only when the operation is idle', () => {
    expect(projectCreationGuard(false, false, false)).toBe('invalid');
    expect(projectCreationGuard(false, false, true)).toBeUndefined();
  });
});

describe('recent project deletion state', () => {
  it('blocks duplicate deletion for the same summary while allowing another row', () => {
    const deleting = new Set(['large-project']);
    expect(canDeleteProject(deleting, 'large-project')).toBe(false);
    expect(canDeleteProject(deleting, 'other-project')).toBe(true);
  });
});

describe('project creation failure classification', () => {
  it('keeps validation/persistence failures distinct for user-facing messages', () => {
    expect(
      projectCreationFailureMessage(new Error('Invalid Minecraft version'), 'storage', 'generic'),
    ).toBe('generic');
    expect(
      projectCreationFailureMessage(new Error('IndexedDB quota exceeded'), 'storage', 'generic'),
    ).toBe('storage');
  });
});

describe('ProjectScreenComponent Structure JSON navigation', () => {
  it('keeps a persisted import available and reports cancelled navigation', async () => {
    const project = { id: 'persisted-import', metadata: { name: 'Imported' } } as ProjectDocument;
    const summary = { id: project.id, name: 'Imported' } as ProjectSummary;
    const createProject = vi.fn(async () => project);
    const navigateByUrl = vi.fn(async () => false);
    const activate = vi.fn();
    const resetForProjectChange = vi.fn();
    const showError = vi.fn(async () => undefined);
    const handleError = vi.fn();
    const error = signal<string | undefined>(undefined);
    const projects = signal<readonly ProjectSummary[]>([]);
    const loadStatus = signal<'loading' | 'ready' | 'error'>('loading');
    const listError = signal(false);
    const component = Object.create(ProjectScreenComponent.prototype) as ProjectScreenComponent;
    const state = component as unknown as Record<string, unknown>;
    state['structureJsonImport'] = { createProject };
    state['session'] = { resetForProjectChange };
    state['workspace'] = { activate };
    state['router'] = { navigateByUrl };
    state['errorHandler'] = { handleError };
    state['i18n'] = { t: (key: string) => key };
    state['error'] = error;
    state['projects'] = projects;
    state['loadStatus'] = loadStatus;
    state['listError'] = listError;
    state['dialogs'] = { error: showError };
    state['persistence'] = { list: vi.fn(async () => [summary]) };

    await (
      component as unknown as { createProjectFromStructureJson(): Promise<void> }
    ).createProjectFromStructureJson();

    expect(createProject).toHaveBeenCalledOnce();
    expect(navigateByUrl).toHaveBeenCalledWith('/editor');
    expect(resetForProjectChange).toHaveBeenCalledWith(project.id);
    expect(activate).toHaveBeenCalledWith(project);
    expect(error()).toBe('structureJsonProjectNavigationError');
    expect(projects()).toEqual([summary]);
    expect(showError).toHaveBeenCalledWith('openErrorTitle', 'structureJsonProjectNavigationError');
  });

  it('reports a thrown navigation failure and keeps the persisted project reopenable', async () => {
    const project = {
      id: 'persisted-import-error',
      metadata: { name: 'Imported' },
    } as ProjectDocument;
    const failure = new Error('router rejected navigation');
    const createProject = vi.fn(async () => project);
    const handleError = vi.fn();
    const summary = { id: project.id, name: 'Imported' } as ProjectSummary;
    const error = signal<string | undefined>(undefined);
    const projects = signal<readonly ProjectSummary[]>([]);
    const component = Object.create(ProjectScreenComponent.prototype) as ProjectScreenComponent;
    const state = component as unknown as Record<string, unknown>;
    state['structureJsonImport'] = { createProject };
    state['session'] = { resetForProjectChange: vi.fn() };
    state['workspace'] = { activate: vi.fn() };
    state['router'] = {
      navigateByUrl: vi.fn(async () => {
        throw failure;
      }),
    };
    state['errorHandler'] = { handleError };
    state['i18n'] = { t: (key: string) => key };
    state['error'] = error;
    state['projects'] = projects;
    state['loadStatus'] = signal<'loading' | 'ready' | 'error'>('loading');
    state['listError'] = signal(false);
    state['dialogs'] = { error: vi.fn(async () => undefined) };
    state['persistence'] = { list: vi.fn(async () => [summary]) };

    await (
      component as unknown as { createProjectFromStructureJson(): Promise<void> }
    ).createProjectFromStructureJson();

    expect(createProject).toHaveBeenCalledOnce();
    expect(handleError).toHaveBeenCalledWith(failure);
    expect(error()).toBe('structureJsonProjectNavigationError');
    expect(projects()).toEqual([summary]);
  });
});

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAutosaveService } from './autosave/project-autosave.service';
import { PROJECT_STORE } from './project-store/project-store.token';
import type { ProjectDocument } from '../domain/project.types';
import { EditorSessionService } from '../editor/state/editor-session.service';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { ProjectDeletionService } from './project-deletion.service';

const activeProject = { id: 'active' } as ProjectDocument;
const otherProject = { id: 'other' } as ProjectDocument;

describe('ProjectDeletionService', () => {
  let currentProject: ProjectDocument | undefined;
  let store: { delete: ReturnType<typeof vi.fn> };
  let workspace: {
    project: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    clearRememberedProject: ReturnType<typeof vi.fn>;
  };
  let session: { clearActiveProject: ReturnType<typeof vi.fn> };
  let autosave: { deleteProject: ReturnType<typeof vi.fn> };
  let deletion: ProjectDeletionService;

  beforeEach(() => {
    currentProject = undefined;
    store = { delete: vi.fn(async () => undefined) };
    workspace = {
      project: vi.fn(() => currentProject),
      deactivate: vi.fn(() => {
        currentProject = undefined;
      }),
      clearRememberedProject: vi.fn(),
    };
    session = { clearActiveProject: vi.fn() };
    autosave = { deleteProject: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PROJECT_STORE, useValue: store },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: EditorSessionService, useValue: session },
        { provide: ProjectAutosaveService, useValue: autosave },
      ],
    });
    deletion = TestBed.inject(ProjectDeletionService);
  });

  it('drains autosave before clearing the active session and workspace', async () => {
    currentProject = activeProject;
    const operation = deferred<void>();
    autosave.deleteProject.mockReturnValue(operation.promise);

    const deleting = deletion.deleteProject(activeProject.id);

    expect(autosave.deleteProject).toHaveBeenCalledWith(activeProject.id);
    expect(store.delete).not.toHaveBeenCalled();
    expect(session.clearActiveProject).not.toHaveBeenCalled();
    expect(workspace.deactivate).not.toHaveBeenCalled();

    operation.resolve();
    await deleting;

    expect(session.clearActiveProject).toHaveBeenCalledOnce();
    expect(workspace.deactivate).toHaveBeenCalledOnce();
  });

  it('leaves active project/session state intact when storage deletion fails', async () => {
    currentProject = activeProject;
    autosave.deleteProject.mockRejectedValue(new Error('storage failed'));

    await expect(deletion.deleteProject(activeProject.id)).rejects.toThrow('storage failed');

    expect(session.clearActiveProject).not.toHaveBeenCalled();
    expect(workspace.deactivate).not.toHaveBeenCalled();
    expect(workspace.clearRememberedProject).not.toHaveBeenCalled();
  });

  it('deletes a non-active project directly and clears only its remembered pointer after success', async () => {
    currentProject = otherProject;

    await deletion.deleteProject(activeProject.id);

    expect(store.delete).toHaveBeenCalledWith(activeProject.id);
    expect(autosave.deleteProject).not.toHaveBeenCalled();
    expect(workspace.clearRememberedProject).toHaveBeenCalledWith(activeProject.id);
    expect(session.clearActiveProject).not.toHaveBeenCalled();
    expect(workspace.deactivate).not.toHaveBeenCalled();
  });

  it('keeps remembered and active state when deleting a non-active project fails', async () => {
    currentProject = otherProject;
    store.delete.mockRejectedValue(new Error('storage failed'));

    await expect(deletion.deleteProject(activeProject.id)).rejects.toThrow('storage failed');

    expect(workspace.clearRememberedProject).not.toHaveBeenCalled();
    expect(session.clearActiveProject).not.toHaveBeenCalled();
    expect(workspace.deactivate).not.toHaveBeenCalled();
  });

  it('does not clear a different project activated while deletion was pending', async () => {
    currentProject = activeProject;
    const operation = deferred<void>();
    autosave.deleteProject.mockReturnValue(operation.promise);

    const deleting = deletion.deleteProject(activeProject.id);
    currentProject = otherProject;
    operation.resolve();
    await deleting;

    expect(session.clearActiveProject).not.toHaveBeenCalled();
    expect(workspace.deactivate).not.toHaveBeenCalled();
    expect(workspace.clearRememberedProject).toHaveBeenCalledWith(activeProject.id);
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}

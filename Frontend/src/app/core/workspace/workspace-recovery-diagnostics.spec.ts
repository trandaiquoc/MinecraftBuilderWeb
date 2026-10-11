import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../domain/project.types';
import type { ProjectStore, ProjectRecord } from '../persistence/project-store/project-store.port';
import { installWorkspaceRecoveryDiagnostics } from './workspace-recovery-diagnostics';

describe('workspace recovery diagnostics', () => {
  it('installs dev commands that read and write recovery data through the store', async () => {
    const project = { id: 'project-a' } as ProjectDocument;
    const record: ProjectRecord = { project, metadata: { persistenceToken: 'test' } };
    const store = {
      saveRecoverySnapshot: vi.fn(async () => undefined),
      deleteRecoverySnapshot: vi.fn(async () => undefined),
      openRecoveryRecord: vi.fn(async () => record),
      openRecoverySnapshot: vi.fn(async () => project),
    } as unknown as ProjectStore;
    const diagnosticsWindow = window as Window & {
      __mbRecoveryDiagnostics?: {
        stageFromCurrentProject: () => Promise<void>;
        clear: (projectId: string) => Promise<void>;
        inspect: (projectId: string) => Promise<unknown>;
      };
    };
    const previous = diagnosticsWindow.__mbRecoveryDiagnostics;

    try {
      installWorkspaceRecoveryDiagnostics({
        currentProject: () => project,
        store: () => store,
      });
      const diagnostics = diagnosticsWindow.__mbRecoveryDiagnostics;
      expect(diagnostics).toBeDefined();
      await diagnostics!.stageFromCurrentProject();
      await diagnostics!.clear(project.id);
      await expect(diagnostics!.inspect(project.id)).resolves.toBe(record);

      expect(store.saveRecoverySnapshot).toHaveBeenCalledWith(
        project,
        expect.objectContaining({
          persistenceToken: expect.stringMatching(/^dev-recovery-/),
          persistedAt: expect.any(String),
        }),
      );
      expect(store.deleteRecoverySnapshot).toHaveBeenCalledWith(project.id);
      expect(store.openRecoveryRecord).toHaveBeenCalledWith(project.id);
      expect(store.openRecoverySnapshot).not.toHaveBeenCalled();
    } finally {
      if (previous) diagnosticsWindow.__mbRecoveryDiagnostics = previous;
      else delete diagnosticsWindow.__mbRecoveryDiagnostics;
    }
  });

  it('falls back to the snapshot reader and preserves unavailable-state errors', async () => {
    const project = { id: 'project-b' } as ProjectDocument;
    const snapshot = vi.fn(async () => project);
    const store = {
      saveRecoverySnapshot: vi.fn(async () => undefined),
      deleteRecoverySnapshot: vi.fn(async () => undefined),
      openRecoverySnapshot: snapshot,
    } as unknown as ProjectStore;
    const diagnosticsWindow = window as Window & {
      __mbRecoveryDiagnostics?: {
        stageFromCurrentProject: () => Promise<void>;
        clear: (projectId: string) => Promise<void>;
        inspect: (projectId: string) => Promise<unknown>;
      };
    };
    const previous = diagnosticsWindow.__mbRecoveryDiagnostics;

    try {
      installWorkspaceRecoveryDiagnostics({
        currentProject: () => project,
        store: () => store,
      });
      await expect(diagnosticsWindow.__mbRecoveryDiagnostics!.inspect(project.id)).resolves.toBe(
        project,
      );
      expect(snapshot).toHaveBeenCalledWith(project.id);

      installWorkspaceRecoveryDiagnostics({
        currentProject: () => undefined,
        store: () => undefined,
      });
      const unavailable = diagnosticsWindow.__mbRecoveryDiagnostics!;
      await expect(unavailable.stageFromCurrentProject()).rejects.toThrow(
        'Open a project before staging recovery',
      );
      await expect(unavailable.clear(project.id)).rejects.toThrow('Workspace store is not ready');
      await expect(unavailable.inspect(project.id)).rejects.toThrow('Workspace store is not ready');
    } finally {
      if (previous) diagnosticsWindow.__mbRecoveryDiagnostics = previous;
      else delete diagnosticsWindow.__mbRecoveryDiagnostics;
    }
  });
});

import { isDevMode } from '@angular/core';
import type { ProjectDocument } from '../domain/project.types';
import type { ProjectStore } from '../persistence/project-store/project-store.port';

interface WorkspaceRecoveryDiagnostics {
  readonly stageFromCurrentProject: () => Promise<void>;
  readonly clear: (projectId: string) => Promise<void>;
  readonly inspect: (projectId: string) => Promise<unknown>;
}

interface WorkspaceRecoveryDiagnosticsContext {
  readonly currentProject: () => ProjectDocument | undefined;
  readonly store: () => ProjectStore | undefined;
}

type DiagnosticsWindow = Window & {
  __mbRecoveryDiagnostics?: WorkspaceRecoveryDiagnostics;
};

export function installWorkspaceRecoveryDiagnostics(
  context: WorkspaceRecoveryDiagnosticsContext,
): void {
  if (!isDevMode() || typeof window === 'undefined') return;
  (window as DiagnosticsWindow).__mbRecoveryDiagnostics =
    createWorkspaceRecoveryDiagnostics(context);
}

function createWorkspaceRecoveryDiagnostics(
  context: WorkspaceRecoveryDiagnosticsContext,
): WorkspaceRecoveryDiagnostics {
  return {
    stageFromCurrentProject: async () => {
      const project = context.currentProject();
      const store = context.store();
      if (!project || !store) throw new Error('Open a project before staging recovery');
      await store.saveRecoverySnapshot(project, {
        persistenceToken: `dev-recovery-${Date.now()}`,
        persistedAt: new Date().toISOString(),
      });
    },
    clear: async (projectId) => {
      const store = context.store();
      if (!store) throw new Error('Workspace store is not ready');
      await store.deleteRecoverySnapshot(projectId);
    },
    inspect: async (projectId) => {
      const store = context.store();
      if (!store) throw new Error('Workspace store is not ready');
      return store.openRecoveryRecord
        ? store.openRecoveryRecord(projectId)
        : store.openRecoverySnapshot(projectId);
    },
  };
}

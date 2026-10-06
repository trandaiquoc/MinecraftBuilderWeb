import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../domain/project.types';
import { ProjectStore } from '../persistence/project-store/project-store.port';
import { ACTIVE_PROJECT_KEY, WorkspaceStateService } from './workspace-state.service';

const project = (id: string, updatedAt: string): ProjectDocument => ({
  schemaVersion: 2,
  id,
  metadata: { name: id, minecraftVersion: '1.21.1', createdAt: updatedAt, updatedAt },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [], groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 },
});

describe('WorkspaceStateService', () => {
  it('remembers and restores the active IndexedDB project', async () => {
    const projects = [project('older', '2026-01-01'), project('active', '2026-02-01')];
    const store = memoryStore(projects);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const first = new WorkspaceStateService(); first.activate(projects[1], storage);
    const second = new WorkspaceStateService();
    expect((await second.restore(store, storage))?.id).toBe('active');
    expect(second.restoreStatus()).toBe('ready');
  });

  it('falls back to the newest persisted project when no active pointer exists', async () => {
    const older = project('older', '2026-01-01'); const newest = project('newest', '2026-02-01');
    const workspace = new WorkspaceStateService();
    await workspace.restore(memoryStore([newest, older]), { getItem: () => null, setItem: () => undefined });
    expect(workspace.project()?.id).toBe('newest');
  });

  it('deduplicates concurrent startup restore calls', async () => {
    let opens = 0; const stored = project('active', '2026-02-01');
    const store = memoryStore([stored], () => opens++);
    const workspace = new WorkspaceStateService(); const storage = { getItem: () => 'active', setItem: () => undefined };
    await Promise.all([workspace.restore(store, storage), workspace.restore(store, storage)]);
    expect(opens).toBe(1);
  });

  it('clears a settled restore attempt so retry reads storage again', async () => {
    let attempts = 0;
    const stored = project('retry', '2026-03-01');
    const store: ProjectStore = { ...memoryStore([stored]), list: async () => { attempts++; if (attempts === 1) throw new Error('temporary'); return [{ id: stored.id, name: stored.metadata.name, minecraftVersion: stored.metadata.minecraftVersion, size: stored.size, structureMode: stored.structureMode, updatedAt: stored.metadata.updatedAt }]; } };
    const workspace = new WorkspaceStateService();
    const storage = { getItem: () => null, setItem: () => undefined };
    await workspace.restore(store, storage);
    expect(workspace.restoreStatus()).toBe('error');
    await workspace.restore(store, storage);
    expect(workspace.project()?.id).toBe('retry');
    expect(attempts).toBe(2);
  });

  it('clears only the remembered project requested by direct deletion', () => {
    const values = new Map([[ACTIVE_PROJECT_KEY, 'project-a']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) };
    const workspace = new WorkspaceStateService();
    expect(workspace.isRememberedProject('project-b', storage)).toBe(false);
    workspace.clearRememberedProject('project-b', storage);
    expect(values.get(ACTIVE_PROJECT_KEY)).toBe('project-a');
    workspace.clearRememberedProject('project-a', storage);
    expect(values.has(ACTIVE_PROJECT_KEY)).toBe(false);
  });

  it('holds a newer recovery snapshot before activating the viewport', async () => {
    const main = project('active', '2026-02-01');
    const recovered = { ...main, metadata: { ...main.metadata, updatedAt: '2026-02-02' }, editorSettings: { ...main.editorSettings, currentY: 1 } };
    const store = recordStore(main, recovered, 'main-token', 'recovery-token');
    const workspace = new WorkspaceStateService();
    expect(await workspace.restore(store, { getItem: () => 'active', setItem: () => undefined })).toBeUndefined();
    expect(workspace.restoreStatus()).toBe('recovery-pending');
    expect(workspace.project()).toBeUndefined();
    await workspace.restoreRecovery();
    expect(workspace.restoreStatus()).toBe('ready');
    expect(workspace.project()?.editorSettings.currentY).toBe(1);
  });

  it('auto-cleans a recovery snapshot whose token matches the main record', async () => {
    const main = project('active', '2026-02-01');
    const store = recordStore(main, { ...main }, 'same-token', 'same-token');
    const workspace = new WorkspaceStateService();
    await workspace.restore(store, { getItem: () => 'active', setItem: () => undefined });
    expect(workspace.restoreStatus()).toBe('ready');
    expect(await store.openRecoverySnapshot('active')).toBeUndefined();
  });

  it('treats a legacy recovery record without a token as pending', async () => {
    const main = project('active', '2026-02-01');
    const store = recordStore(main, { ...main, editorSettings: { ...main.editorSettings, currentY: 1 } }, 'main-token', undefined);
    const workspace = new WorkspaceStateService();
    await workspace.restore(store, { getItem: () => 'active', setItem: () => undefined });
    expect(workspace.restoreStatus()).toBe('recovery-pending');
  });

  it('does not activate invalid recovery and can continue with the valid main project', async () => {
    const main = project('active', '2026-02-01');
    const invalid = { ...main, metadata: { ...main.metadata, name: '' } };
    const store = recordStore(main, invalid, 'main-token', 'recovery-token');
    const workspace = new WorkspaceStateService();
    await workspace.restore(store, { getItem: () => 'active', setItem: () => undefined });
    expect(workspace.restoreStatus()).toBe('recovery-error');
    expect(workspace.project()).toBeUndefined();
    workspace.continueWithMain();
    expect(workspace.project()?.id).toBe('active');
    expect(workspace.project()?.metadata.name).toBe('active');
  });

  it('discards recovery before activating the saved main project', async () => {
    const main = project('active', '2026-02-01');
    const recovered = { ...main, editorSettings: { ...main.editorSettings, currentY: 1 } };
    const store = recordStore(main, recovered, 'main-token', 'recovery-token');
    const workspace = new WorkspaceStateService();
    await workspace.restore(store, { getItem: () => 'active', setItem: () => undefined });
    await expect(workspace.discardRecovery()).resolves.toBe(true);
    expect(workspace.project()?.editorSettings.currentY).toBe(0);
    expect(await store.openRecoverySnapshot('active')).toBeUndefined();
  });
});

function memoryStore(projects: readonly ProjectDocument[], onOpen?: () => void): ProjectStore {
  return {
    create: async () => undefined, exists: async () => false, save: async () => undefined, delete: async () => undefined,
    list: async () => projects.map((item) => ({ id: item.id, name: item.metadata.name, minecraftVersion: item.metadata.minecraftVersion, size: item.size, structureMode: item.structureMode, updatedAt: item.metadata.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    open: async (id) => { onOpen?.(); return projects.find((item) => item.id === id); },
    saveRecoverySnapshot: async () => undefined, openRecoverySnapshot: async () => undefined, deleteRecoverySnapshot: async () => undefined,
  };
}

function recordStore(main: ProjectDocument, recovery: ProjectDocument | undefined, mainToken: string | undefined, recoveryToken: string | undefined): ProjectStore {
  let currentMain = structuredClone(main);
  let currentRecovery = recovery ? structuredClone(recovery) : undefined;
  return {
    create: async (value) => { currentMain = structuredClone(value); },
    exists: async (id) => id === currentMain.id,
    open: async (id) => id === currentMain.id ? structuredClone(currentMain) : undefined,
    openRecord: async (id) => id === currentMain.id ? { project: structuredClone(currentMain), metadata: { persistenceToken: mainToken } } : undefined,
    save: async (value) => { currentMain = structuredClone(value); },
    delete: async () => undefined,
    list: async () => [{ id: currentMain.id, name: currentMain.metadata.name, minecraftVersion: currentMain.metadata.minecraftVersion, size: currentMain.size, structureMode: currentMain.structureMode, updatedAt: currentMain.metadata.updatedAt }],
    saveRecoverySnapshot: async (value) => { currentRecovery = structuredClone(value); },
    openRecoverySnapshot: async (id) => id === currentRecovery?.id ? structuredClone(currentRecovery) : undefined,
    openRecoveryRecord: async (id) => id === currentRecovery?.id ? { project: structuredClone(currentRecovery), metadata: { persistenceToken: recoveryToken } } : undefined,
    deleteRecoverySnapshot: async () => { currentRecovery = undefined; },
  };
}

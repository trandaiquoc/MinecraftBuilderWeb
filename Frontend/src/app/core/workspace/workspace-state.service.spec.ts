import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../domain/project.types';
import { ProjectStore } from '../persistence/project-store/project-store.port';
import { WorkspaceStateService } from './workspace-state.service';

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
    const store: ProjectStore = { ...memoryStore([stored]), list: async () => { attempts++; if (attempts === 1) throw new Error('temporary'); return [{ id: stored.id, name: stored.metadata.name, updatedAt: stored.metadata.updatedAt }]; } };
    const workspace = new WorkspaceStateService();
    const storage = { getItem: () => null, setItem: () => undefined };
    await workspace.restore(store, storage);
    expect(workspace.restoreStatus()).toBe('error');
    await workspace.restore(store, storage);
    expect(workspace.project()?.id).toBe('retry');
    expect(attempts).toBe(2);
  });
});

function memoryStore(projects: readonly ProjectDocument[], onOpen?: () => void): ProjectStore {
  return {
    create: async () => undefined, save: async () => undefined, delete: async () => undefined,
    list: async () => projects.map((item) => ({ id: item.id, name: item.metadata.name, updatedAt: item.metadata.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    open: async (id) => { onOpen?.(); return projects.find((item) => item.id === id); },
    saveRecoverySnapshot: async () => undefined, openRecoverySnapshot: async () => undefined, deleteRecoverySnapshot: async () => undefined,
  };
}

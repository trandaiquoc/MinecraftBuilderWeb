import { describe, expect, it, vi } from 'vitest';
import { ProjectDocument } from '../domain/project.types';
import { migrateProject } from '../domain/migrations';
import { DirtyState } from './autosave/dirty-state';
import { AutosaveController } from './autosave/autosave-controller';
import { CURRENT_PROJECT_PACKAGE_VERSION, parseProjectPackage, PROJECT_PACKAGE_FORMAT, ProjectPackageError, serializeProjectPackage } from './project-package/project-package';
import { ProjectPersistenceService } from './project-persistence.service';
import { ProjectStore, ProjectSummary } from './project-store/project-store.port';
import { projectSummaryFromStoredRecord } from './project-store/indexeddb-project-store';

const project: ProjectDocument = {
  schemaVersion: 2,
  id: 'p1',
  metadata: { name: 'Demo', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

describe('local persistence helpers', () => {
  it('keeps the project backup format and version stable', () => {
    expect(PROJECT_PACKAGE_FORMAT).toBe('minecraftbuilder-project');
    expect(CURRENT_PROJECT_PACKAGE_VERSION).toBe(1);
    expect(JSON.parse(serializeProjectPackage(project))).toMatchObject({ format: 'minecraftbuilder-project', formatVersion: 1 });
  });

  it('round-trips a versioned project package', () => {
    expect(parseProjectPackage(serializeProjectPackage(project))).toEqual(migrateProject(project));
  });

  it('classifies malformed, arbitrary, newer, and invalid package data without activating anything', () => {
    expect(() => parseProjectPackage('{')).toThrowError(ProjectPackageError);
    try { parseProjectPackage('{"blocks":[]}'); } catch (error) { expect(error).toMatchObject({ category: 'not-project-package' }); }
    const newer = JSON.stringify({ format: 'minecraftbuilder-project', formatVersion: 1, project: { ...project, schemaVersion: 99 } });
    expect(() => parseProjectPackage(newer)).toThrowError(/newer than supported/);
    const invalid = JSON.stringify({ format: 'minecraftbuilder-project', formatVersion: 1, project: { ...project, blocks: [{ ...block('minecraft:stone', 99, 0, 0) }] } });
    expect(() => parseProjectPackage(invalid)).toThrowError(/Invalid project package data/);
  });

  it('uses the cheap key lookup contract for import collision checks', async () => {
    const store = new MemoryProjectStore(); const persistence = new ProjectPersistenceService(store, 0); await persistence.create(project);
    expect(await persistence.exists(project.id)).toBe(true); expect(await persistence.exists('missing')).toBe(false);
  });

  it('keeps summary migration independent from full project documents', () => {
    expect(projectSummaryFromStoredRecord({ id: 'p1', name: 'Demo', minecraftVersion: '1.21.1', updatedAt: '2026-01-01T00:00:00Z' })).toEqual({ id: 'p1', name: 'Demo', minecraftVersion: '1.21.1', updatedAt: '2026-01-01T00:00:00Z' });
  });

  it('does not mark a newer dirty revision clean when an older save completes', () => {
    const state = new DirtyState(); const first = state.markDirty(); const second = state.markDirty();
    expect(state.markClean(first)).toBe(false); expect(state.isDirty).toBe(true);
    expect(state.markClean(second)).toBe(true); expect(state.isDirty).toBe(false);
  });

  it('debounces and persists the canonical project plus recovery lifecycle', async () => {
    vi.useFakeTimers();
    const store = new MemoryProjectStore(); await store.create(project);
    const autosave = new AutosaveController(store, { delayMs: 50 });
    const changed = withBlocks(block('minecraft:stone', 1, 1, 1));
    autosave.schedule(changed, 1);
    await vi.advanceTimersByTimeAsync(49); expect((await store.open(project.id))?.blocks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1); await autosave.flush();
    expect((await store.open(project.id))?.blocks).toEqual(changed.blocks);
    expect(await store.openRecoverySnapshot(project.id)).toBeUndefined();
    autosave.dispose(); vi.useRealTimers();
  });

  it('persists derived states, multi-group memberships, and multi-block parts as one final document', async () => {
    const store = new MemoryProjectStore(); const persistence = new ProjectPersistenceService(store, 0); await persistence.create(project);
    const changed: ProjectDocument = {
      ...project,
      groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }, { id: 'entry', name: 'Entrance', visible: true, locked: false }],
      blocks: [
        block('minecraft:oak_fence', 1, 0, 1, { east: 'true', north: 'false', south: 'false', west: 'false', waterlogged: 'false' }, ['roof', 'entry']),
        block('minecraft:oak_fence', 2, 0, 1, { west: 'true', north: 'false', south: 'false', east: 'false', waterlogged: 'false' }),
        block('minecraft:oak_door', 3, 0, 3, { half: 'lower', facing: 'north', hinge: 'left', open: 'false', powered: 'false' }),
        block('minecraft:oak_door', 3, 1, 3, { half: 'upper', facing: 'north', hinge: 'left', open: 'false', powered: 'false' }),
        block('minecraft:red_bed', 4, 0, 4, { part: 'foot', facing: 'east', occupied: 'false' }),
        block('minecraft:red_bed', 5, 0, 4, { part: 'head', facing: 'east', occupied: 'false' }),
      ],
    };
    persistence.markChanged(changed); await persistence.flushAutosave();
    expect(await persistence.open(project.id)).toEqual(changed);
    expect((await persistence.open(project.id))?.blocks[0].groupIds).toEqual(['roof', 'entry']);
  });

  it('persists the undone document while history itself remains session-only', async () => {
    const store = new MemoryProjectStore(); const persistence = new ProjectPersistenceService(store, 0); await persistence.create(project);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1))); await persistence.flushAutosave();
    persistence.markChanged(project); await persistence.flushAutosave();
    expect((await persistence.open(project.id))?.blocks).toEqual([]);
  });

  it('serializes an edit created while an older async save is in flight', async () => {
    const store = new ControlledProjectStore(); const statuses: string[] = [];
    const persistence = new ProjectPersistenceService(store, 0, (status) => statuses.push(status));
    const first = withBlocks(block('minecraft:stone', 1, 0, 1)); const latest = withBlocks(block('minecraft:stone', 2, 0, 1));
    persistence.markChanged(first); const flushing = persistence.flushAutosave();
    await store.waitForSave(1); persistence.markChanged(latest); store.completeNextSave();
    await store.waitForSave(1); expect(persistence.dirtyState.isDirty).toBe(true); store.completeNextSave();
    await flushing;
    expect(store.persisted).toEqual(latest); expect(persistence.dirtyState.isDirty).toBe(false); expect(statuses.at(-1)).toBe('saved');
  });

  it('keeps the project dirty and reports an error when canonical save fails', async () => {
    const store = new MemoryProjectStore(); await store.create(project); store.save = async () => { throw new Error('quota'); };
    const statuses: string[] = []; const persistence = new ProjectPersistenceService(store, 0, (status) => statuses.push(status));
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));
    await expect(persistence.flushAutosave()).rejects.toThrow('quota');
    expect(persistence.dirtyState.isDirty).toBe(true); expect(statuses.at(-1)).toBe('error');
    expect(await store.openRecoverySnapshot(project.id)).toBeDefined();
  });

  it('deletes the project and recovery snapshot after draining pending autosave', async () => {
    const store = new MemoryProjectStore(); await store.create(project);
    const persistence = new ProjectPersistenceService(store, 0);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));
    await persistence.delete(project.id);
    expect(await store.open(project.id)).toBeUndefined();
    expect(await store.openRecoverySnapshot(project.id)).toBeUndefined();
  });

  it('waits for an in-flight canonical save before deleting', async () => {
    const store = new ControlledProjectStore(); await store.create(project);
    const persistence = new ProjectPersistenceService(store, 0);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));
    const flushing = persistence.flushAutosave();
    await store.waitForSave(1);

    let deleted = false;
    const deleting = persistence.delete(project.id).then(() => { deleted = true; });
    await Promise.resolve();
    expect(deleted).toBe(false);
    store.completeNextSave();
    await deleting;
    await flushing;
    expect(await store.open(project.id)).toBeUndefined();
  });

  it('keeps the project when the final autosave flush fails', async () => {
    const store = new MemoryProjectStore(); await store.create(project);
    store.save = async () => { throw new Error('quota'); };
    const persistence = new ProjectPersistenceService(store, 0);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));

    await expect(persistence.delete(project.id)).rejects.toThrow('quota');
    expect(await store.open(project.id)).toBeDefined();
  });

  it('deletes by summary id without opening the full project document', async () => {
    const store = new MemoryProjectStore(); await store.create(project);
    let opens = 0;
    const openStoredProject = store.open.bind(store);
    store.open = async (id: string) => { opens += 1; return openStoredProject(id); };
    const persistence = new ProjectPersistenceService(store, 0);

    await persistence.delete(project.id);
    expect(opens).toBe(0);
    expect(await openStoredProject(project.id)).toBeUndefined();
  });

  it('cannot resurrect a deleted project when a later destroy flush runs', async () => {
    const store = new MemoryProjectStore(); await store.create(project);
    const persistence = new ProjectPersistenceService(store, 25);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));
    await persistence.delete(project.id);

    await persistence.flushAutosave();
    expect(await store.open(project.id)).toBeUndefined();
    expect(await store.openRecoverySnapshot(project.id)).toBeUndefined();

    await persistence.create(project);
    persistence.markChanged(withBlocks(block('minecraft:dirt', 2, 0, 1)));
    await persistence.flushAutosave();
    expect((await store.open(project.id))?.blocks[0].id).toBe('minecraft:dirt');
  });

  it('quiesces edits that arrive while the delete transaction is in flight', async () => {
    const store = new MemoryProjectStore(); await store.create(project);
    let releaseDelete!: () => void;
    let deleteStarted = false;
    const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const deleteStoredProject = store.delete.bind(store);
    store.delete = async (id: string) => { deleteStarted = true; await deleteGate; await deleteStoredProject(id); };
    const persistence = new ProjectPersistenceService(store, 0);
    persistence.markChanged(withBlocks(block('minecraft:stone', 1, 0, 1)));
    const deleting = persistence.delete(project.id);
    while (!deleteStarted) await Promise.resolve();
    persistence.markChanged(withBlocks(block('minecraft:dirt', 2, 0, 1)));
    releaseDelete();

    await deleting;
    await persistence.flushAutosave();
    expect(await store.open(project.id)).toBeUndefined();
  });
});

function block(id: string, x: number, y: number, z: number, state: Readonly<Record<string, string>> = {}, groupIds: readonly string[] = []) {
  return { kind: 'resolved' as const, id, namespace: 'minecraft', position: { x, y, z }, state, groupIds };
}
function withBlocks(...blocks: ProjectDocument['blocks']): ProjectDocument { return { ...project, blocks: blocks.flat() }; }

class MemoryProjectStore implements ProjectStore {
  protected readonly projects = new Map<string, ProjectDocument>(); private readonly recovery = new Map<string, ProjectDocument>();
  async create(value: ProjectDocument): Promise<void> { this.projects.set(value.id, structuredClone(value)); }
  async exists(id: string): Promise<boolean> { return this.projects.has(id); }
  async open(id: string): Promise<ProjectDocument | undefined> { const value = this.projects.get(id); return value && structuredClone(value); }
  async save(value: ProjectDocument): Promise<void> { this.projects.set(value.id, structuredClone(value)); }
  async delete(id: string): Promise<void> { this.projects.delete(id); this.recovery.delete(id); }
  async list(): Promise<readonly ProjectSummary[]> { return [...this.projects.values()].map((value) => ({ id: value.id, name: value.metadata.name, minecraftVersion: value.metadata.minecraftVersion, updatedAt: value.metadata.updatedAt })); }
  async saveRecoverySnapshot(value: ProjectDocument): Promise<void> { this.recovery.set(value.id, structuredClone(value)); }
  async openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> { return this.recovery.get(id); }
  async deleteRecoverySnapshot(id: string): Promise<void> { this.recovery.delete(id); }
}

class ControlledProjectStore extends MemoryProjectStore {
  persisted?: ProjectDocument; private readonly saves: { readonly project: ProjectDocument; readonly complete: () => void }[] = [];
  override save(value: ProjectDocument): Promise<void> { return new Promise((resolve) => this.saves.push({ project: structuredClone(value), complete: () => { this.persisted = structuredClone(value); resolve(); } })); }
  async waitForSave(count: number): Promise<void> { while (this.saves.length < count) await Promise.resolve(); }
  completeNextSave(): void { this.saves.shift()?.complete(); }
}

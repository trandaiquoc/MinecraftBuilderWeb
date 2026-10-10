import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlockDefinition } from '../../../core/blocks/catalog/block-definition.types';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { StructureJsonProjectImportWorkflow } from './structure-json-project-import-workflow';

const stone: BlockDefinition = {
  id: 'minecraft:stone',
  namespace: 'minecraft',
  displayName: 'Stone',
  defaultState: {},
  stateDefinitions: [],
  resources: { textures: [] },
  support: 'full',
  behaviorSupport: 'full',
  visualSupport: 'real',
  visualClassification: 'standard-json',
  defaultStateSource: 'authoritative-report',
};
const source = JSON.stringify({
  format: 'minecraftbuilder-structure',
  minecraftVersion: '1.21.1',
  blocks: [{ id: stone.id, x: 0, y: 0, z: 0 }],
  decorations: [],
});
afterEach(() => TestBed.resetTestingModule());

function createWorkflow(
  persist: (project: ProjectDocument) => Promise<void> = vi.fn(async () => undefined),
) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BlockLibraryService,
        useValue: { get: (id: string) => (id === stone.id ? stone : undefined) },
      },
      {
        provide: UiPreferencesService,
        useValue: { preferences: () => ({ autoUseHugeStructureBlocks: false }) },
      },
    ],
  });
  const workflow = TestBed.runInInjectionContext(
    () => new StructureJsonProjectImportWorkflow(persist),
  );
  return { workflow, persist };
}

function file(name: string, text: () => Promise<string>): File {
  return { name, text } as unknown as File;
}

describe('StructureJsonProjectImportWorkflow', () => {
  it('owns file preparation and persists the validated project before returning it for navigation', async () => {
    const { workflow, persist } = createWorkflow();
    await workflow.selectFile(
      file('house.json', async () => source),
      'Untitled structure',
    );
    expect(workflow.open()).toBe(true);
    expect(workflow.progress()).toBe('ready');
    expect(workflow.preview()?.project?.metadata.name).toBe('house');
    const project = await workflow.createProject();
    expect(project?.blocks).toHaveLength(1);
    expect(persist).toHaveBeenCalledWith(project);
    expect(workflow.open()).toBe(false);
    workflow.dispose();
  });

  it('discards a stale file read after close without publishing a preview', async () => {
    const { workflow } = createWorkflow();
    let resolveText!: (value: string) => void;
    const pending = workflow.selectFile(
      file(
        'stale.json',
        () =>
          new Promise((resolve) => {
            resolveText = resolve;
          }),
      ),
      'Untitled structure',
    );
    workflow.close();
    resolveText(source);
    await pending;
    expect(workflow.open()).toBe(false);
    expect(workflow.preview()).toBeUndefined();
    expect(workflow.progress()).toBe('idle');
    workflow.dispose();
  });

  it('does not let an older read overwrite a newer selected file', async () => {
    const { workflow } = createWorkflow();
    let resolveOld!: (value: string) => void;
    const old = workflow.selectFile(
      file(
        'old.json',
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      ),
      'Untitled structure',
    );
    await workflow.selectFile(
      file('new.json', async () => source),
      'Untitled structure',
    );
    resolveOld('{');
    await old;
    expect(workflow.filename()).toBe('new.json');
    expect(workflow.progress()).toBe('ready');
    expect(workflow.preview()?.filename).toBe('new.json');
    workflow.dispose();
  });

  it('keeps the validated draft open and exposes a save failure without returning a project', async () => {
    const { workflow } = createWorkflow(async () => {
      throw new Error('storage unavailable');
    });
    await workflow.selectFile(
      file('house.json', async () => source),
      'Untitled structure',
    );
    expect(await workflow.createProject()).toBeUndefined();
    expect(workflow.open()).toBe(true);
    expect(workflow.failure()).toEqual({ kind: 'save' });
    expect(workflow.progress()).toBe('error');
    workflow.dispose();
  });

  it('keeps the import dialog attached to an in-flight persistence commit', async () => {
    let finishCommit!: () => void;
    const { workflow } = createWorkflow(
      () =>
        new Promise((resolve) => {
          finishCommit = resolve;
        }),
    );
    await workflow.selectFile(
      file('house.json', async () => source),
      'Untitled structure',
    );
    const creating = workflow.createProject();
    workflow.close();
    expect(workflow.open()).toBe(true);
    expect(workflow.creating()).toBe(true);
    finishCommit();
    expect((await creating)?.metadata.name).toBe('house');
    expect(workflow.open()).toBe(false);
    expect(workflow.creating()).toBe(false);
    workflow.dispose();
  });
});

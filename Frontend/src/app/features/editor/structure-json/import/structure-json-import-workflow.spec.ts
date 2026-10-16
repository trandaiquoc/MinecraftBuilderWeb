import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import { HistoryService } from '../../../../core/editor/history/history.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import type { StructureJsonImportValidationContext } from './structure-json-import-workflow';
import { StructureJsonImportWorkflow } from './structure-json-import-workflow';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'structure-import-workflow',
  metadata: { name: 'Import', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

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

const context: StructureJsonImportValidationContext = {
  placeableItems: [],
  contentLimits: { blocks: [], items: [], decorations: [] },
  contentLimitsEnabled: false,
};

function serializedStone(): string {
  return JSON.stringify({
    format: 'the-block-laundromat-structure',
    minecraftVersion: '1.21.1',
    blocks: [{ id: stone.id, x: 1, y: 1, z: 1 }],
    decorations: [],
  });
}

function configure(
  dialogs = { confirm: vi.fn().mockResolvedValue(true), warning: vi.fn(), choice: vi.fn() },
): {
  readonly workflow: StructureJsonImportWorkflow;
  readonly workspace: WorkspaceStateService;
  readonly history: HistoryService;
  readonly dialogs: typeof dialogs;
} {
  TestBed.configureTestingModule({
    providers: [
      StructureJsonImportWorkflow,
      WorkspaceStateService,
      HistoryService,
      SelectionService,
      ViewportHydrationStatusService,
      {
        provide: BlockLibraryService,
        useValue: {
          get: (id: string) => (id === stone.id ? stone : undefined),
          maxStackSizeFor: () => 64,
        },
      },
      { provide: DialogService, useValue: dialogs },
      { provide: I18nService, useValue: { t: (key: string) => key } },
    ],
  });
  const workflow = TestBed.inject(StructureJsonImportWorkflow);
  const workspace = TestBed.inject(WorkspaceStateService);
  workspace.publishProject(project);
  workflow.setProject(project);
  return { workflow, workspace, history: TestBed.inject(HistoryService), dialogs };
}

describe('StructureJsonImportWorkflow', () => {
  it('exposes import state as read-only signals updated through workflow methods', () => {
    const { workflow } = configure();
    const states = [
      workflow.draftJson,
      workflow.preview,
      workflow.progress,
      workflow.checkingProgress,
      workflow.importMode,
      workflow.importPlan,
    ];

    for (const state of states) {
      expect(state).not.toHaveProperty('set');
      expect(state).not.toHaveProperty('update');
    }

    workflow.setDraft(serializedStone());
    expect(workflow.draftJson()).toBe(serializedStone());
  });

  it('reports a file read failure and clears it after a successful retry', async () => {
    const { workflow } = configure();
    workflow.setDraft(serializedStone());

    await workflow.loadFile({
      text: vi.fn().mockRejectedValue(new Error('read failed')),
    } as unknown as File);

    expect(workflow.fileReadError()).toBe(true);
    expect(workflow.progress()).toBe('idle');
    expect(workflow.draftJson()).toBe(serializedStone());
    expect(workflow.canApplyImport()).toBe(false);

    await workflow.validate(context);

    expect(workflow.fileReadError()).toBe(false);
    expect(workflow.canApplyImport()).toBe(true);

    await workflow.loadFile({
      text: vi.fn().mockResolvedValue(serializedStone()),
    } as unknown as File);

    expect(workflow.fileReadError()).toBe(false);
    expect(workflow.draftJson()).toBe(serializedStone());
  });

  it('owns validation and commits one undoable import transaction', async () => {
    const { workflow, workspace, history, dialogs } = configure();
    workflow.setDraft(serializedStone());

    await workflow.validate(context);
    expect(workflow.canApplyImport()).toBe(true);
    expect(await workflow.applyImport(context)).toBe(true);
    expect(workspace.project()?.blocks.map((block) => block.position)).toEqual([
      { x: 1, y: 1, z: 1 },
    ]);
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(history.undo()).toBe(true);
    expect(workspace.project()?.blocks).toEqual([]);
    expect(history.redo()).toBe(true);
    expect(workspace.project()?.blocks).toHaveLength(1);
  });

  it('invalidates a running validation and plan when the project scope changes', async () => {
    const { workflow } = configure();
    workflow.setDraft(serializedStone());
    const validation = workflow.validate(context);
    const replacement = { ...project, id: 'replacement' };
    workflow.setProject(replacement);

    await validation;

    expect(workflow.preview()).toBeUndefined();
    expect(workflow.importPlan()).toBeUndefined();
    expect(workflow.canApplyImport()).toBe(false);
  });

  it('cancels outstanding validation without publishing a stale preview', async () => {
    const { workflow } = configure();
    workflow.setDraft(serializedStone());
    const validation = workflow.validate(context);
    workflow.cancelPendingWork();

    await validation;

    expect(workflow.preview()).toBeUndefined();
    expect(workflow.importPlan()).toBeUndefined();
  });

  it('does not apply a cached plan after its source project is no longer current', async () => {
    const { workflow, dialogs } = configure();
    workflow.setDraft(serializedStone());
    await workflow.validate(context);
    workflow.setProject({ ...project, id: 'new-project' });

    expect(workflow.hasPlan()).toBe(false);
    expect(await workflow.applyImport(context)).toBe(false);
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });
});

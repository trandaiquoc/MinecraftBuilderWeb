import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { HistoryService } from '../history/history.service';
import type { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { MissingBlockReconciliationService } from './missing-block-reconciliation.service';

const definition: BlockDefinition = {
  id: 'example:marble', namespace: 'example', displayName: 'Marble', defaultState: { polished: 'false' },
  stateDefinitions: [{ name: 'polished', values: ['true', 'false'] }], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'verified-fixture',
};

function project(): ProjectDocument {
  return { schemaVersion: 3, id: 'project', metadata: { name: 'Project', minecraftVersion: '1.21.1', createdAt: '2026-01-01', updatedAt: '2026-01-02' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [{ kind: 'missing', id: definition.id, namespace: 'example', position: { x: 0, y: 0, z: 0 }, state: {} }], groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 } };
}

async function flushReconciliation(): Promise<void> {
  TestBed.flushEffects();
  await Promise.resolve();
  await Promise.resolve();
  TestBed.flushEffects();
}

describe('MissingBlockReconciliationService', () => {
  it('resolves on a later catalog revision without adding history', async () => {
    const workspace = new WorkspaceStateService();
    const revision = signal(0);
    const definitions = new Map<string, BlockDefinition>();
    const library = { catalogRevision: revision.asReadonly(), get: (id: string) => definitions.get(id) } as unknown as BlockLibraryService;
    await TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }, { provide: BlockLibraryService, useValue: library }, MissingBlockReconciliationService] }).compileComponents();
    TestBed.inject(MissingBlockReconciliationService);
    const history = new HistoryService(workspace);
    const original = project();
    workspace.project.set(original);
    await flushReconciliation();
    expect(workspace.project()?.blocks[0].kind).toBe('missing');
    definitions.set(definition.id, definition);
    revision.set(1);
    await flushReconciliation();
    expect(workspace.project()?.blocks[0]).toMatchObject({ kind: 'resolved', namespace: 'example', state: { polished: 'false' } });
    expect(history.canUndo()).toBe(false);
  });

  it('resolves a project activated after the definition is already available', async () => {
    const workspace = new WorkspaceStateService();
    const revision = signal(1);
    const library = { catalogRevision: revision.asReadonly(), get: (id: string) => id === definition.id ? definition : undefined } as unknown as BlockLibraryService;
    await TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }, { provide: BlockLibraryService, useValue: library }, MissingBlockReconciliationService] }).compileComponents();
    TestBed.inject(MissingBlockReconciliationService);
    workspace.project.set(project());
    await flushReconciliation();
    expect(workspace.project()?.blocks[0].kind).toBe('resolved');
  });

  it('discards a stale batch when a newer project becomes active', async () => {
    const workspace = new WorkspaceStateService();
    const revision = signal(1);
    const library = { catalogRevision: revision.asReadonly(), get: (id: string) => id === definition.id ? definition : undefined } as unknown as BlockLibraryService;
    await TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }, { provide: BlockLibraryService, useValue: library }, MissingBlockReconciliationService] }).compileComponents();
    TestBed.inject(MissingBlockReconciliationService);
    const original = { ...project(), blocks: Array.from({ length: 129 }, (_, index) => ({ kind: 'missing' as const, id: definition.id, namespace: 'example', position: { x: index, y: 0, z: 0 }, state: {} })) };
    const newer = { ...project(), id: 'newer-project', blocks: [] };
    workspace.project.set(original);
    TestBed.flushEffects();
    workspace.project.set(newer);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushReconciliation();
    expect(workspace.project()).toBe(newer);
  });

  it('reconciles history snapshots after undo and redo without clearing the stacks', async () => {
    const workspace = new WorkspaceStateService();
    const revision = signal(0);
    const definitions = new Map<string, BlockDefinition>();
    const library = { catalogRevision: revision.asReadonly(), get: (id: string) => definitions.get(id) } as unknown as BlockLibraryService;
    await TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }, { provide: BlockLibraryService, useValue: library }, MissingBlockReconciliationService] }).compileComponents();
    TestBed.inject(MissingBlockReconciliationService);
    const history = new HistoryService(workspace);
    workspace.project.set(project());
    await flushReconciliation();
    expect(history.execute('Edit metadata', (before) => ({ ...before, metadata: { ...before.metadata, name: 'Edited' } }))).toBe(true);
    definitions.set(definition.id, definition);
    revision.set(1);
    await flushReconciliation();
    expect(workspace.project()?.blocks[0].kind).toBe('resolved');
    expect(history.undo()).toBe(true);
    await flushReconciliation();
    expect(workspace.project()?.blocks[0].kind).toBe('resolved');
    expect(history.redo()).toBe(true);
    await flushReconciliation();
    expect(workspace.project()?.blocks[0].kind).toBe('resolved');
  });
});

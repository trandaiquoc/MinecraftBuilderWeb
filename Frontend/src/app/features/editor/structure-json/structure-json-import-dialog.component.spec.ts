import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { BlockDefinition } from '../../../core/blocks/catalog/block-definition.types';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { HistoryService } from '../../../core/editor/history/history.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { supplementalTranslations } from '../../../core/ui/localization/translation-catalogs';
import { ExternalAiPromptContextService } from '../../../core/persistence/structure-json/external-ai-prompt-context.service';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { ItemCatalogService } from '../../../core/items/catalog/item-catalog.service';
import { PaintingVariantCatalogService } from '../../../core/decorations/catalog/painting-variant-catalog.service';
import type { PlaceableItemDefinition } from '../../../core/blocks/placement-palette/placeable-item';
import { ExternalAiWorkspaceComponent } from './external-ai-workspace.component';
import { StructureJsonImportDialogComponent } from './structure-json-import-dialog.component';

const project: ProjectDocument = { schemaVersion: 3, id: 'project', metadata: { name: 'Import Demo', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 2, y: 2, z: 2 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 } };
const projectContext = { currentSize: project.size, resizeSupported: true, maximumSize: { x: 512, y: 512, z: 512 }, vanillaStructureBlockLimit: 48 } as const;
const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };
const catalogProviders = [
  { provide: ItemCatalogService, useValue: { all: () => [] } },
  { provide: PaintingVariantCatalogService, useValue: { placeable: () => [] } },
] as const;

function activateAiWorkspace(fixture: ComponentFixture<StructureJsonImportDialogComponent>): ExternalAiWorkspaceComponent {
  (fixture.componentInstance as unknown as { setTab: (tab: 'import' | 'ai') => void }).setTab('ai');
  fixture.detectChanges();
  return fixture.debugElement.query(By.directive(ExternalAiWorkspaceComponent)).componentInstance as ExternalAiWorkspaceComponent;
}

describe('StructureJsonImportDialogComponent', () => {
  it('supports editing, explicit validation, and stale preview clearing', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
        { provide: ExternalAiPromptContextService, useValue: { snapshot: () => ({ minecraftVersion: '1.21.1', vanillaSource: 'test', projectContext, mods: [] }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; preview: () => unknown };
    instance.setDraft('{');
    await instance.validate();
    expect(instance.preview()).toMatchObject({ structuralValid: false });
    instance.setDraft('{"format":"minecraftbuilder-structure","formatVersion":2,"minecraftVersion":"1.21.1","blocks":[],"decorations":[]}');
    expect(instance.preview()).toBeUndefined();
    await instance.validate();
    expect(instance.preview()).toMatchObject({ structuralValid: true, totalBlocks: 0 });
  });

  it('keeps AI viewers in dedicated scroll regions while preserving the complete example', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
        { provide: ExternalAiPromptContextService, useValue: { snapshot: () => ({ minecraftVersion: '1.21.1', vanillaSource: 'test', projectContext, mods: [] }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = activateAiWorkspace(fixture) as unknown as { setAiTab: (tab: 'description' | 'content' | 'limits' | 'guidance' | 'example') => void };
    instance.setAiTab('example'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.structure-json-layout.ai-mode')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.structure-json-ai-workspace')).toBeTruthy();
    const viewer = fixture.nativeElement.querySelector('.structure-json-ai-workspace app-readonly-code-viewer');
    expect(viewer).toBeTruthy();
    expect(viewer.querySelector('.readonly-code-viewer-gutter')?.textContent).toContain('1');
    expect(viewer.querySelector('.readonly-code-viewer-code')?.textContent).toContain('minecraftbuilder-structure');
    instance.setAiTab('description'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ai-preview app-readonly-code-viewer')).toBeTruthy();
    instance.setAiTab('limits'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ai-content-limits-workspace')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ai-content-limits-json pre')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.ai-prompt-toggles .ai-toggle').length).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.ai-content-limits-controls .ai-toggle').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.ai-inner-tabs [role="tab"]').length).toBe(5);
    (fixture.componentInstance as unknown as { setTab: (tab: 'import' | 'ai') => void }).setTab('import'); fixture.detectChanges();
    (fixture.componentInstance as unknown as { setTab: (tab: 'import' | 'ai') => void }).setTab('ai'); fixture.detectChanges();
    expect((fixture.debugElement.query(By.directive(ExternalAiWorkspaceComponent)).componentInstance as unknown as { activeAiTab: () => string }).activeAiTab()).toBe('limits');
  });

  it('keeps prompt inclusion controls independent from the viewing tabs', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
        { provide: ExternalAiPromptContextService, useValue: { snapshot: () => ({ minecraftVersion: '1.21.1', vanillaSource: 'test', projectContext, mods: [{ sourceId: 'source-example', id: 'example', name: 'Example', version: '1.0.0', loader: 'fabric', namespaces: ['example'], blocks: ['example:block'], items: [{ id: 'example:item' }], decorations: [{ id: 'example:painting', kind: 'painting' }] }] }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = activateAiWorkspace(fixture) as unknown as {
      setAiDescription: (value: string) => void;
      setModCategory: (sourceId: string, category: 'blocks' | 'items' | 'decorations', value: boolean) => void;
      setIncludeAvailableContent: (value: boolean) => void;
      setIncludeGuidance: (value: boolean) => void;
      setIncludeJsonExample: (value: boolean) => void;
      aiPrompt: () => string;
    };
    instance.setAiDescription('Build a tower.');
    expect(instance.aiPrompt()).toContain('example:block');
    expect(instance.aiPrompt()).toContain('example:painting');
    expect(instance.aiPrompt()).not.toContain('example:item');
    instance.setModCategory('source-example', 'items', true);
    expect(instance.aiPrompt()).toContain('example:item');
    instance.setIncludeAvailableContent(false);
    expect(instance.aiPrompt()).not.toContain('example:block');
    instance.setIncludeGuidance(false);
    expect(instance.aiPrompt()).not.toContain('MINECRAFTBUILDER STRUCTURE JSON');
    instance.setIncludeJsonExample(true);
    expect(instance.aiPrompt()).toContain('Small JSON syntax example');
  });

  it('keeps mod content selection independent and exposes the non-modal selector', async () => {
    const snapshot = {
      minecraftVersion: '1.21.1',
      vanillaSource: 'test',
      projectContext,
      mods: [
        { sourceId: 'source-a', id: 'a', name: 'Mod A', version: '1.0', loader: 'fabric', namespaces: ['a'], blocks: ['a:block'], items: [{ id: 'a:item' }], decorations: [{ id: 'a:painting', kind: 'painting' }] },
        { sourceId: 'source-b', id: 'b', name: 'Mod B', version: '2.0', loader: 'fabric', namespaces: ['b'], blocks: ['b:block'], items: [{ id: 'b:item' }], decorations: [] },
      ],
    } as const;
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
        { provide: ExternalAiPromptContextService, useValue: { snapshot: () => snapshot } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = activateAiWorkspace(fixture) as unknown as { toggleModContent: () => void; clearAllModContent: () => void; setModCategory: (sourceId: string, category: 'blocks' | 'items' | 'decorations', value: boolean) => void; aiPrompt: () => string };
    instance.toggleModContent(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-haspopup="true"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.ai-mod-content-row').length).toBe(2);
    instance.setModCategory('source-a', 'items', true);
    instance.setModCategory('source-b', 'blocks', false);
    expect(instance.aiPrompt()).toContain('a:item');
    expect(instance.aiPrompt()).not.toContain('b:block');
    instance.clearAllModContent();
    expect(instance.aiPrompt()).not.toContain('a:block');
    expect(instance.aiPrompt()).not.toContain('a:item');
  });

  it('edits persisted content limits and preserves unavailable saved IDs', async () => {
    const item = { itemId: 'example:crystal', displayBlockId: 'example:crystal_block', namespace: 'example', displayName: 'Crystal', sourceId: 'source-example', concreteBlockIds: ['example:crystal_block'], defaultState: {}, placementKind: 'direct', previewRecipe: 'single', support: 'full', visualSupport: 'real', capabilities: { capabilities: [] }, previewBlocks: [] } as unknown as PlaceableItemDefinition;
    const preferences = new UiPreferencesService(); preferences.setExternalAiContentLimits({ blocks: ['missing:old_block'], items: [], decorations: [] });
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: UiPreferencesService, useValue: preferences },
        { provide: BlockLibraryService, useValue: { get: () => undefined, allPlaceableItems: () => [item], searchPlaceableItems: () => [item] } },
        { provide: ExternalAiPromptContextService, useValue: { snapshot: () => ({ minecraftVersion: '1.21.1', vanillaSource: 'test', projectContext, mods: [{ sourceId: 'source-example', id: 'example', name: 'Example', version: '1.0', loader: 'fabric', namespaces: ['example'], blocks: ['example:crystal_block'], items: [], decorations: [] }] }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent); fixture.componentRef.setInput('project', project); fixture.detectChanges();
    const instance = activateAiWorkspace(fixture) as unknown as {
      setContentLimitsEnabled: (value: boolean) => void;
      contentLimitsJson: () => string;
      contentLimitSelected: (candidate: { category: 'blocks'; id: string }) => boolean;
      toggleContentLimit: (candidate: { category: 'blocks'; id: string }, selected: boolean) => void;
      clearContentLimits: () => void;
      resetContentLimits: () => void;
      aiPrompt: () => string;
    };
    expect(preferences.preferences().externalAiContentLimitsEnabled).toBe(false);
    expect(instance.contentLimitsJson()).toContain('missing:old_block');
    expect(instance.contentLimitSelected({ category: 'blocks', id: item.itemId })).toBe(false);
    instance.toggleContentLimit({ category: 'blocks', id: item.itemId }, true);
    fixture.detectChanges();
    expect(preferences.preferences().externalAiContentLimits.blocks).toContain('example:crystal');
    expect(instance.contentLimitsJson()).toContain('example:crystal');
    instance.setContentLimitsEnabled(true);
    expect(instance.aiPrompt()).toContain('CONTENT_LIMITS_JSON');
    expect(instance.aiPrompt()).toContain('example:crystal');
    instance.toggleContentLimit({ category: 'blocks', id: item.itemId }, false);
    expect(preferences.preferences().externalAiContentLimits.blocks).not.toContain('example:crystal');
    instance.clearContentLimits(); expect(preferences.preferences().externalAiContentLimits).toEqual({ blocks: [], items: [], decorations: [] });
    instance.resetContentLimits(); expect(preferences.preferences().externalAiContentLimits.blocks).toHaveLength(4);
    expect(preferences.preferences().externalAiContentLimitsEnabled).toBe(true);
  });

  it('translates structured diagnostic codes while keeping technical fields separate', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { reasonLabel: (issue: { reason: { code: string } }) => string };
    expect(instance.reasonLabel({ reason: { code: 'missing-block' } })).toBe('structureJsonReasonMissingBlock');
    expect(instance.reasonLabel({ reason: { code: 'out-of-bounds' } })).toBe('structureJsonReasonOutOfBounds');
    expect(instance.reasonLabel({ reason: { code: 'unsupported-state-value' } })).toBe('structureJsonReasonUnsupportedStateValue');
  });

  it('renders Vietnamese diagnostic reasons through the same reason-code mapping', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => (supplementalTranslations.vi as Record<string, string>)[key] ?? key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { reasonLabel: (issue: { reason: { code: string } }) => string };
    expect(instance.reasonLabel({ reason: { code: 'missing-block' } })).toBe(supplementalTranslations.vi.structureJsonReasonMissingBlock);
    expect(instance.reasonLabel({ reason: { code: 'out-of-bounds' } })).toBe(supplementalTranslations.vi.structureJsonReasonOutOfBounds);
    expect(instance.reasonLabel({ reason: { code: 'unsupported-state-value' } })).toBe(supplementalTranslations.vi.structureJsonReasonUnsupportedStateValue);
  });

  it('keeps Apply behind confirmation and records one history transaction', async () => {
    const initial: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: stone.id, namespace: stone.namespace, position: { x: 1, y: 1, z: 1 }, state: {} }] };
    const dialogs = { confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: (id: string) => id === stone.id ? stone : undefined } },
        { provide: DialogService, useValue: dialogs },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService); const history = TestBed.inject(HistoryService); const selection = TestBed.inject(SelectionService);
    workspace.project.set(initial); selection.select({ x: 1, y: 1, z: 1 });
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', initial); fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; applyImport: () => Promise<void>; importPlan: () => { readonly applicable: boolean } | undefined };
    instance.setDraft(JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 0, y: 0, z: 0 }], decorations: [] }));
    await instance.validate();
    expect(instance.importPlan()?.applicable).toBe(true);
    await instance.applyImport();
    expect(workspace.project()).toEqual(initial);
    await instance.applyImport();
    expect(workspace.project()?.blocks[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(selection.single()).toBeUndefined();
    expect(history.canUndo()).toBe(true);
    expect(dialogs.confirm).toHaveBeenCalledTimes(2);
  });

  it('requires an explicit choice before clipping an oversized import', async () => {
    const initial: ProjectDocument = { ...project, size: { x: 2, y: 2, z: 2 } };
    const dialogs = { choice: vi.fn().mockResolvedValue('keep'), warning: vi.fn().mockResolvedValue(false) };
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: (id: string) => id === stone.id ? stone : undefined } },
        { provide: DialogService, useValue: dialogs },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService); workspace.project.set(initial);
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent); fixture.componentRef.setInput('project', initial); fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; applyImport: () => Promise<void> };
    instance.setDraft(JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 0, y: 0, z: 0 }, { id: stone.id, x: 2, y: 0, z: 0 }], decorations: [] }));
    await instance.validate(); await instance.applyImport();
    expect(dialogs.choice).toHaveBeenCalledOnce();
    expect(workspace.project()?.size).toEqual(initial.size);
    expect(workspace.project()?.blocks.map((block) => block.position)).toEqual([{ x: 0, y: 0, z: 0 }]);
    expect(dialogs.warning).toHaveBeenCalledWith('structureJsonImportClippedTitle', 'structureJsonImportClippedText');
  });

  it('does not mutate the project when the oversized choice is cancelled', async () => {
    const initial: ProjectDocument = { ...project, size: { x: 2, y: 2, z: 2 } };
    const dialogs = { choice: vi.fn().mockResolvedValue('cancel'), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: (id: string) => id === stone.id ? stone : undefined } },
        { provide: DialogService, useValue: dialogs },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService); workspace.project.set(initial);
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent); fixture.componentRef.setInput('project', initial); fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; applyImport: () => Promise<void> };
    instance.setDraft(JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 2, y: 0, z: 0 }], decorations: [] }));
    await instance.validate(); await instance.applyImport();
    expect(dialogs.choice).toHaveBeenCalledOnce();
    expect(workspace.project()).toBe(initial);
  });

  it('resizes and imports atomically, switching Vanilla to Huge when required', async () => {
    const initial: ProjectDocument = { ...project, size: { x: 2, y: 2, z: 2 }, structureMode: 'vanilla-structure-block' };
    const dialogs = { choice: vi.fn().mockResolvedValue('resize'), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        ...catalogProviders,
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: (id: string) => id === stone.id ? stone : undefined } },
        { provide: DialogService, useValue: dialogs },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService); workspace.project.set(initial);
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent); fixture.componentRef.setInput('project', initial); fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; applyImport: () => Promise<void> };
    instance.setDraft(JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 48, y: 0, z: 0 }], decorations: [] }));
    await instance.validate(); await instance.applyImport();
    expect(workspace.project()).toMatchObject({ size: { x: 49, y: 2, z: 2 }, structureMode: 'huge-structure-blocks' });
    expect(workspace.project()?.blocks[0].position).toEqual({ x: 48, y: 0, z: 0 });
    expect(dialogs.warning).not.toHaveBeenCalled();
  });
});

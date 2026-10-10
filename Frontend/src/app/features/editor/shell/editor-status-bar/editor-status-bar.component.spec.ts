import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { ProjectAutosaveService } from '../../../../core/persistence/autosave/project-autosave.service';
import { EditorStatusBarComponent } from './editor-status-bar.component';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import { MissingBlockReconciliationService } from '../../../../core/editor/structure/missing-block-reconciliation.service';
import { EditorModeService } from '../../../../core/editor/state/editor-mode.service';
import { EditorSessionService } from '../../../../core/editor/state/editor-session.service';
import { ViewportStatusService } from '../../../../core/editor/viewport/viewport-status.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';

beforeEach(() => localStorage.removeItem('minecraft-builder.ui-preferences'));
afterEach(() => localStorage.removeItem('minecraft-builder.ui-preferences'));

describe('EditorStatusBarComponent asset bootstrap status', () => {
  it('renders one indeterminate progress bar for source download and Mod restore without numeric progress', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(ContentAssetRuntimeService);
    assets.status.set('downloading');
    assets.downloadProgress.set({ phase: 'download', loaded: 42, total: 100 });
    fixture.detectChanges();
    let progress = fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement | null;
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute('aria-valuenow')).toBeNull();
    expect(progress?.getAttribute('aria-valuemax')).toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).not.toMatch(/[0-9%]/);

    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'restoring-mods', current: 1, total: 2, failed: 0, sourceName: 'Example Mod' });
    fixture.detectChanges();
    progress = fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement | null;
    expect(fixture.nativeElement.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Restoring imported Mods');
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).not.toMatch(/[0-9%]/);
    expect(progress?.getAttribute('aria-valuenow')).toBeNull();

    assets.contentRestore.set({ phase: 'ready', current: 2, total: 2, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Assets ready');
  });

  it('renders indeterminate loading and partial warning states without a loading bar when complete', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }, { provide: MissingBlockReconciliationService, useValue: { activity: signal<'idle' | 'running'>('idle') } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(ContentAssetRuntimeService);
    assets.status.set('loading-cache');
    assets.contentRestore.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).not.toBeNull();

    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'partial', current: 2, total: 2, failed: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('1');
  });

  it('shows one indeterminate status for hydration without counts or percentages and clears it on completion', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(ContentAssetRuntimeService);
    const hydration = TestBed.inject(ViewportHydrationStatusService);
    const owner = hydration.claim();
    hydration.activate(owner);
    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'ready', current: 0, total: 0, failed: 0 });
    hydration.publish(owner, { generation: 1, lane: 'content', status: 'hydrating', completed: 15080, total: 20000, blocksCompleted: 15080, blocksTotal: 20000, decorationsCompleted: 0, decorationsTotal: 0, percent: 75.4 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Updating block assets');
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).not.toMatch(/[0-9%]/);
    expect(fixture.nativeElement.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.hydration-status')).toBeNull();
    expect((fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement).getAttribute('aria-valuenow')).toBeNull();
    hydration.publish(owner, { generation: 1, status: 'complete', completed: 20000, total: 20000, blocksCompleted: 20000, blocksTotal: 20000, decorationsCompleted: 0, decorationsTotal: 0, percent: 100 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hydration-status')).toBeNull();
  });

  it('does not report assets ready while content hydration is active', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(ContentAssetRuntimeService);
    const hydration = TestBed.inject(ViewportHydrationStatusService);
    const owner = hydration.claim();
    hydration.activate(owner);
    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'ready', current: 1, total: 1, failed: 0 });
    hydration.publish(owner, { generation: 2, lane: 'content', status: 'hydrating', completed: 24, total: 40, blocksCompleted: 24, blocksTotal: 40, decorationsCompleted: 0, decorationsTotal: 0, percent: 60 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Updating block assets');
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).not.toContain('Assets ready');
    expect((fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement).getAttribute('aria-valuenow')).toBeNull();
  });

  it('shows terminal ownership warnings without a progressbar or false ready label', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const assets = TestBed.inject(ContentAssetRuntimeService);
    const hydration = TestBed.inject(ViewportHydrationStatusService);
    assets.status.set('ready');
    assets.contentRestore.set({ phase: 'ready', current: 1, total: 1, failed: 0 });
    hydration.finalization.set({ phase: 'warning', loading: false, ready: false, warning: true, indeterminate: true, issue: 'incomplete-ownership' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).toContain('Some blocks could not be rendered');
    expect(fixture.nativeElement.querySelector('.asset-status')?.textContent).not.toContain('Assets ready');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
  });
});

describe('EditorStatusBarComponent active placement status', () => {
  async function createFixture(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<EditorStatusBarComponent>>; library: BlockLibraryService; decorations: DecorationService }> {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    return { fixture, library: TestBed.inject(BlockLibraryService), decorations: TestBed.inject(DecorationService) };
  }

  it('shows the active block display name without an asset preview', async () => {
    const { fixture, library } = await createFixture();
    const item = library.allItems()[0];
    library.activeBlock.select(item);
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.active-placement-status') as HTMLElement;
    expect(status.textContent).toContain('Active block');
    expect(status.textContent).toContain(item.displayName);
    expect(status.querySelector('img')).toBeNull();
    expect(status.querySelector('.asset-status-copy')).toBeNull();
  });

  it('shows painting and frame decoration labels', async () => {
    const { fixture, decorations } = await createFixture();
    decorations.selectPainting('kebab');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.active-placement-status')?.textContent).toContain('Painting · Kebab');

    decorations.selectFrame(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.active-placement-label')?.textContent).toContain('Active decoration');
    expect(fixture.nativeElement.querySelector('.active-placement-value')?.textContent).toContain('Item Frame');

    decorations.selectFrame(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.active-placement-label')?.textContent).toContain('Active decoration');
    expect(fixture.nativeElement.querySelector('.active-placement-value')?.textContent).toContain('Glow Item Frame');
  });

  it('shows only the current placement target and no empty status', async () => {
    const { fixture, library, decorations } = await createFixture();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.active-placement-status')).toBeNull();

    decorations.selectFrame(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.active-placement-status')?.textContent).toContain('Item Frame');

    const item = library.allItems()[0];
    library.select(item);
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.active-placement-status') as HTMLElement;
    expect(status.textContent).toContain('Active block');
    expect(status.textContent).not.toContain('Active decoration');
  });
});

describe('EditorStatusBarComponent Y-layer preview', () => {
  it('shows transient Current Y without changing the persisted project', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const mode = TestBed.inject(EditorModeService);
    const session = TestBed.inject(EditorSessionService);
    const current: ProjectDocument = {
      schemaVersion: 3,
      id: 'layer-preview-status',
      metadata: { name: 'Layer preview', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
      size: { x: 4, y: 8, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [],
      editorSettings: { currentY: 1, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
    };
    workspace.project.set(current);
    mode.mode.set('y-layer');
    session.previewCurrentY(current.id, 6);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Current Y: 6');
    expect(workspace.project()?.editorSettings.currentY).toBe(1);
  });
});

describe('EditorStatusBarComponent missing-content warning', () => {
  it('uses the current project Missing blocks and opens actionable details', async () => {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }, { provide: MissingBlockReconciliationService, useValue: { activity: signal<'idle' | 'running'>('idle') } }] }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService);
    const fixture = TestBed.createComponent(EditorStatusBarComponent);
    const project: ProjectDocument = {
      schemaVersion: 3,
      id: 'missing-status-project',
      metadata: { name: 'Missing status', minecraftVersion: '1.21.1', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block',
      blocks: [{ kind: 'missing', id: 'unknown:missing_block', namespace: 'unknown', position: { x: 0, y: 0, z: 0 }, state: {} }],
      groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
    };
    workspace.project.set(project);
    TestBed.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    const warning = fixture.nativeElement.querySelector('.asset-status--action') as HTMLButtonElement | null;
    expect(warning?.textContent).toContain('Missing assets for 1 blocks');
    warning?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.missing-assets-dialog')?.textContent).toContain('unknown');
    (fixture.nativeElement.querySelector('.missing-assets-dialog .ui-close-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.asset-status--action')).not.toBeNull();
  });
});

describe('EditorStatusBarComponent project coordinates', () => {
  const project: ProjectDocument = {
    schemaVersion: 3,
    id: 'coordinate-status-project',
    metadata: { name: 'Coordinates', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
    size: { x: 8, y: 6, z: 4 }, structureMode: 'vanilla-structure-block',
    blocks: [
      { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 2, y: 3, z: 1 }, state: {} },
      { kind: 'resolved', id: 'minecraft:dirt', namespace: 'minecraft', position: { x: 5, y: 0, z: 2 }, state: {} },
    ], groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
  };

  async function createFixture(): Promise<ReturnType<typeof TestBed.createComponent<EditorStatusBarComponent>>> {
    await TestBed.configureTestingModule({ imports: [EditorStatusBarComponent], providers: [{ provide: ProjectAutosaveService, useValue: { status: signal('saved'), error: signal(undefined) } }] }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService);
    workspace.project.set(project);
    return TestBed.createComponent(EditorStatusBarComponent);
  }

  it('shows exact block count and dimensions without a coordinate when nothing is selected', async () => {
    const fixture = await createFixture();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Total blocks: 2');
    expect(fixture.nativeElement.textContent).toContain('X 8 · Y 6 · Z 4');
    expect(fixture.nativeElement.querySelector('.coordinate-status')).toBeNull();
  });

  it('shows one selected coordinate, suppresses it for multiple blocks, and gives hover priority', async () => {
    const fixture = await createFixture();
    const selection = TestBed.inject(SelectionService);
    const status = TestBed.inject(ViewportStatusService);
    const owner = status.claim();
    status.activate(owner, project.id);
    selection.select(project.blocks[0].position);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.coordinate-status')?.textContent).toContain('X 2 · Y 3 · Z 1');

    selection.selectBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 3 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.coordinate-status')).toBeNull();

    selection.select(project.blocks[0].position);
    status.publish(owner, project.id, { x: 7, y: 1, z: 2 }, 'valid');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.coordinate-status')?.textContent).toContain('X 7 · Y 1 · Z 2');
    status.clear(owner);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.coordinate-status')?.textContent).toContain('X 2 · Y 3 · Z 1');
    status.release(owner);
    selection.clear();
  });
});

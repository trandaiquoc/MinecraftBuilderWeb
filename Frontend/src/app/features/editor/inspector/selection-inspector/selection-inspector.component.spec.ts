import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { rendererBenchmarkProject } from '../../../../core/renderer/benchmark/renderer-benchmark-fixtures';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ContentPropertyDescriptor } from '../../../../core/content/content-introspection';
import { SelectionInspectorComponent } from './selection-inspector.component';

describe('SelectionInspectorComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows selected-set bounds and count instead of a synthetic drag volume', async () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 16, y: 32, z: 16 },
      blocks: [
        { ...base.blocks[0], position: { x: 8, y: 0, z: 8 } },
        { ...base.blocks[0], position: { x: 8, y: 28, z: 8 } },
      ],
    };
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    await TestBed.configureTestingModule({
      imports: [SelectionInspectorComponent],
      providers: [{ provide: ProjectBlockRuntimeIndex, useValue: runtimeIndex }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SelectionInspectorComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    workspace.publishProject(project);
    selection.selectMarqueeLogical(
      {
        candidateBounds: { min: { x: 8, y: 0, z: 8 }, max: { x: 8, y: 28, z: 8 } },
        intersectsVoxel: ({ x, z }) => x === 8 && z === 8,
      },
      project,
      () => undefined,
    );
    fixture.detectChanges();

    const details = [...fixture.nativeElement.querySelectorAll('.selection-details dd')].map(
      (entry) => entry.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(details).toEqual(['X 8, Y 0, Z 8', 'X 8, Y 28, Z 8', '1 x 29 x 1', '2']);
    fixture.destroy();
  });

  it('leads with selection context, followed by quick actions and the structure summary', async () => {
    const base = rendererBenchmarkProject('small');
    const project = {
      ...base,
      size: { x: 16, y: 32, z: 24 },
      blocks: [base.blocks[0], { ...base.blocks[0], position: { x: 2, y: 0, z: 0 } }],
    };
    await TestBed.configureTestingModule({
      imports: [SelectionInspectorComponent],
      providers: [{ provide: ProjectBlockRuntimeIndex, useValue: new ProjectBlockRuntimeIndex() }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SelectionInspectorComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const i18n = TestBed.inject(I18nService);
    workspace.publishProject(project);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-overview-size]').textContent).toContain(
      '16 × 32 × 24',
    );
    expect(fixture.nativeElement.querySelector('.overview-metrics').textContent).toContain('2');
    const emptySelection = fixture.nativeElement.querySelector(
      '[data-empty-selection]',
    ) as HTMLElement | null;
    const quickActions = fixture.nativeElement.querySelector(
      '.overview-actions',
    ) as HTMLElement | null;
    const structureOverview = fixture.nativeElement.querySelector(
      '.structure-overview',
    ) as HTMLElement | null;
    if (!emptySelection || !quickActions || !structureOverview)
      throw new Error('Selection inspector summary is missing.');
    expect(quickActions?.closest('.structure-overview')).toBeNull();
    expect(
      (emptySelection.compareDocumentPosition(quickActions) & Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ).toBe(true);
    expect(
      (quickActions.compareDocumentPosition(structureOverview) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ).toBe(true);

    let selectAllRequests = 0;
    let clearSelectionRequests = 0;
    fixture.componentInstance.selectAllRequested.subscribe(() => selectAllRequests++);
    fixture.componentInstance.clearSelectionRequested.subscribe(() => clearSelectionRequests++);
    const selectAllButton = fixture.nativeElement.querySelector('[data-action="select-all"]');
    const clearButton = fixture.nativeElement.querySelector('[data-action="clear-selection"]');
    expect(fixture.nativeElement.querySelector('[data-empty-selection]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(i18n.t('selectionEmptyHint'));
    expect(fixture.nativeElement.querySelector('#quick-actions-title').textContent).toContain(
      i18n.t('quickActions'),
    );
    expect(selectAllButton.disabled).toBe(false);
    expect(clearButton.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-action="fit-structure"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="focus-selection"]')).toBeNull();

    selectAllButton.click();
    clearButton.click();

    expect(selectAllRequests).toBe(1);
    expect(clearSelectionRequests).toBe(0);
    fixture.destroy();
  });

  it('keeps the auto-derived marker separate from property effect labels', async () => {
    await TestBed.configureTestingModule({
      imports: [SelectionInspectorComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SelectionInspectorComponent);
    const i18n = TestBed.inject(I18nService);
    const property: ContentPropertyDescriptor = {
      name: 'shape',
      values: ['straight'],
      defaultValue: 'straight',
      derived: true,
      provenance: 'resource-backed',
      effects: {
        visual: true,
        placement: true,
        behavior: true,
        attachment: false,
        connection: false,
        itemDisplay: false,
        runtimeUnknown: false,
      },
      evidence: [],
    };
    const component = fixture.componentInstance as unknown as {
      propertyEffects: (value: ContentPropertyDescriptor) => string[];
    };

    expect(component.propertyEffects(property)).toEqual([
      i18n.t('propertyVisual'),
      i18n.t('propertyBehavior'),
      i18n.t('propertyPlacement'),
    ]);
    fixture.destroy();
  });
});

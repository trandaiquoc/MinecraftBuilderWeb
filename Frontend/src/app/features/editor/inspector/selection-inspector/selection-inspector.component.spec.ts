import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { rendererBenchmarkProject } from '../../../../core/renderer/benchmark/renderer-benchmark-fixtures';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { SelectionInspectorComponent } from './selection-inspector.component';

describe('SelectionInspectorComponent marquee summary', () => {
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

    const details = [...fixture.nativeElement.querySelectorAll('dd')].map((entry) =>
      entry.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(details).toEqual(['X 8, Y 0, Z 8', 'X 8, Y 28, Z 8', '1 x 29 x 1', '2']);
    fixture.destroy();
  });
});

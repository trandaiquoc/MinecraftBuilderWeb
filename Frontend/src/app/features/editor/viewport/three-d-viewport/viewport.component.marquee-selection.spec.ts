import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { rendererBenchmarkProject } from '../../../../core/renderer/benchmark/renderer-benchmark-fixtures';
import { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ScreenSpaceMarqueeQuery } from '../../../../core/renderer/interaction/screen-space-marquee-selection';
import { ViewportComponent } from './viewport.component';

describe('3D viewport screen-space marquee interaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('previews a clipped 2D rectangle and commits indexed membership only on pointer up', async () => {
    const query: ScreenSpaceMarqueeQuery = {
      rect: { left: 10, top: 20, width: 30, height: 40 },
      candidateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } },
      intersectsVoxel: ({ x }) => x < 2,
    };
    const camera = {
      position: { x: 0, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    const project = {
      ...rendererBenchmarkProject('small'),
      blocks: rendererBenchmarkProject('small')
        .blocks.slice(0, 3)
        .map((block, x) => ({
          ...block,
          position: { x, y: 0, z: 0 },
        })),
    };

    await TestBed.configureTestingModule({ imports: [ViewportComponent] }).compileComponents();
    vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'restoreCamera').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'hit').mockReturnValue({});
    vi.spyOn(ThreeViewportEngine.prototype, 'hover').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'cameraState').mockReturnValue(camera);
    const resolveMarquee = vi
      .spyOn(ThreeViewportEngine.prototype, 'screenSpaceMarqueeQuery')
      .mockReturnValue(query);

    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('.viewport-host') as HTMLElement;
    let hostBounds = DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 });
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => hostBounds);
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    TestBed.inject(EditorToolService).select('select');
    workspace.publishProject(project);
    selection.select(project.blocks[2].position);
    fixture.detectChanges();

    dispatchPointer(host, 'pointerdown', 20, 20);
    dispatchPointer(host, 'pointermove', 60, 70);
    fixture.detectChanges();

    const preview = host.querySelector('.selection-marquee') as HTMLDivElement;
    expect(preview.hidden).toBe(false);
    expect(preview.style.left).toBe('20px');
    expect(preview.style.top).toBe('20px');
    expect(preview.style.width).toBe('40px');
    expect(preview.style.height).toBe('50px');
    expect(selection.selectedBlocks(project).map((block) => block.position.x)).toEqual([2]);

    hostBounds = DOMRect.fromRect({ x: 0, y: 0, width: 80, height: 60 });
    window.dispatchEvent(new Event('resize'));
    expect(preview.style.width).toBe('40px');
    expect(preview.style.height).toBe('40px');

    dispatchPointer(host, 'pointerup', 60, 70);

    expect(resolveMarquee).toHaveBeenCalledWith(
      { left: 20, top: 20, width: 40, height: 40 },
      project.size,
    );
    expect(selection.selectedBlocks(project).map((block) => block.position.x)).toEqual([0, 1]);
    expect(selection.count(project)).toBe(2);
    expect(selection.box()).toBeUndefined();
    expect(preview.hidden).toBe(true);
    fixture.destroy();
  });

  it('does not commit a free-space drag cancelled by pointer cancellation', async () => {
    const query: ScreenSpaceMarqueeQuery = {
      rect: { left: 10, top: 10, width: 40, height: 40 },
      candidateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } },
      intersectsVoxel: () => true,
    };
    await TestBed.configureTestingModule({ imports: [ViewportComponent] }).compileComponents();
    vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'restoreCamera').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'hit').mockReturnValue({});
    vi.spyOn(ThreeViewportEngine.prototype, 'hover').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'cameraState').mockReturnValue(undefined);
    const resolveMarquee = vi
      .spyOn(ThreeViewportEngine.prototype, 'screenSpaceMarqueeQuery')
      .mockReturnValue(query);
    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('.viewport-host') as HTMLElement;
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    TestBed.inject(EditorToolService).select('select');
    const project = rendererBenchmarkProject('small');
    workspace.publishProject(project);
    selection.select(project.blocks[0].position);
    fixture.detectChanges();

    dispatchPointer(host, 'pointerdown', 20, 20);
    dispatchPointer(host, 'pointermove', 70, 70);
    dispatchPointer(host, 'pointercancel', 70, 70);

    expect(resolveMarquee).not.toHaveBeenCalled();
    expect(selection.selectedBlocks(project).map((block) => block.position)).toEqual([
      project.blocks[0].position,
    ]);
    expect(selection.count(project)).toBe(1);
    fixture.destroy();
  });

  it('rejects a pending marquee after project, camera, or viewport changes', async () => {
    const query: ScreenSpaceMarqueeQuery = {
      rect: { left: 10, top: 10, width: 40, height: 40 },
      candidateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } },
      intersectsVoxel: () => true,
    };
    const camera = {
      position: { x: 0, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    let currentCamera = camera;
    await TestBed.configureTestingModule({ imports: [ViewportComponent] }).compileComponents();
    vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'restoreCamera').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'dispose').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'hit').mockReturnValue({});
    vi.spyOn(ThreeViewportEngine.prototype, 'hover').mockImplementation(() => undefined);
    vi.spyOn(ThreeViewportEngine.prototype, 'cameraState').mockImplementation(() => currentCamera);
    const resolveMarquee = vi
      .spyOn(ThreeViewportEngine.prototype, 'screenSpaceMarqueeQuery')
      .mockReturnValue(query);
    const fixture = TestBed.createComponent(ViewportComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('.viewport-host') as HTMLElement;
    const workspace = TestBed.inject(WorkspaceStateService);
    TestBed.inject(EditorToolService).select('select');
    const firstProject = rendererBenchmarkProject('small');
    workspace.publishProject(firstProject);
    fixture.detectChanges();

    dispatchPointer(host, 'pointerdown', 20, 20);
    workspace.publishProject({ ...firstProject, id: `${firstProject.id}-switch` });
    fixture.detectChanges();
    dispatchPointer(host, 'pointerup', 60, 60);
    expect(resolveMarquee).not.toHaveBeenCalled();

    dispatchPointer(host, 'pointerdown', 20, 20);
    currentCamera = {
      ...camera,
      position: { ...camera.position, x: camera.position.x + 1 },
    };
    dispatchPointer(host, 'pointerup', 60, 60);

    expect(resolveMarquee).not.toHaveBeenCalled();

    currentCamera = camera;
    dispatchPointer(host, 'pointerdown', 20, 20);
    dispatchPointer(host, 'pointermove', 60, 60);
    fixture.componentRef.setInput('viewportActive', false);
    fixture.detectChanges();
    dispatchPointer(host, 'pointerup', 60, 60);

    expect(resolveMarquee).not.toHaveBeenCalled();
    fixture.destroy();
  });
});

function dispatchPointer(host: HTMLElement, type: string, clientX: number, clientY: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
  });
  host.dispatchEvent(event);
}

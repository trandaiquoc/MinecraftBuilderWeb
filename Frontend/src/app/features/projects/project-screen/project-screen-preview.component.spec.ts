import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectScreenWorkflow } from './project-screen-workflow';
import { ProjectScreenPreviewComponent } from './project-screen-preview.component';

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '160px';
  readonly scrollMargin = '0px';
  readonly thresholds = [0];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: IntersectionObserverCallback) {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  intersect(target: Element): void {
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this);
  }

  leave(target: Element): void {
    this.callback([{ target, isIntersecting: false } as IntersectionObserverEntry], this);
  }
}

function installIntersectionObserver(): () => TestIntersectionObserver | undefined {
  let current: TestIntersectionObserver | undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class extends TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        super(callback);
        current = this;
      }
    },
  );
  return () => current;
}

describe('ProjectScreenPreviewComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads near-view previews and releases their object URLs after leaving view', async () => {
    const preview = new Blob(['renderer capture'], { type: 'image/jpeg' });
    const loadProjectPreview = vi.fn(async () => preview);
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:project-preview-1')
      .mockReturnValueOnce('blob:project-preview-2');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const getObserver = installIntersectionObserver();

    await TestBed.configureTestingModule({
      imports: [ProjectScreenPreviewComponent],
      providers: [
        { provide: ProjectScreenWorkflow, useValue: { loadProjectPreview } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProjectScreenPreviewComponent);
    fixture.componentRef.setInput('project', {
      id: 'project-1',
      updatedAt: '2026-10-17T10:00:00.000Z',
    });
    fixture.detectChanges();
    expect(loadProjectPreview).not.toHaveBeenCalled();

    getObserver()?.intersect(fixture.nativeElement as Element);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loadProjectPreview).toHaveBeenCalledWith('project-1', '2026-10-17T10:00:00.000Z');
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe(
      'blob:project-preview-1',
    );

    getObserver()?.leave(fixture.nativeElement as Element);
    fixture.detectChanges();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:project-preview-1');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();

    getObserver()?.intersect(fixture.nativeElement as Element);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(loadProjectPreview).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe(
      'blob:project-preview-2',
    );

    fixture.destroy();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:project-preview-2');
    expect(getObserver()?.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps an honest empty preview frame when a project has no current capture', async () => {
    const loadProjectPreview = vi.fn(async () => undefined);
    const getObserver = installIntersectionObserver();
    await TestBed.configureTestingModule({
      imports: [ProjectScreenPreviewComponent],
      providers: [
        { provide: ProjectScreenWorkflow, useValue: { loadProjectPreview } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProjectScreenPreviewComponent);
    fixture.componentRef.setInput('project', {
      id: 'empty',
      updatedAt: '2026-10-17T11:00:00.000Z',
    });
    fixture.detectChanges();
    getObserver()?.intersect(fixture.nativeElement as Element);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loadProjectPreview).toHaveBeenCalledWith('empty', '2026-10-17T11:00:00.000Z');
    expect(fixture.nativeElement.querySelector('.preview-surface svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    fixture.destroy();
  });

  it('shares one visibility observer across project preview surfaces', async () => {
    const loadProjectPreview = vi.fn(async () => undefined);
    const getObserver = installIntersectionObserver();
    await TestBed.configureTestingModule({
      imports: [ProjectScreenPreviewComponent],
      providers: [
        { provide: ProjectScreenWorkflow, useValue: { loadProjectPreview } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    }).compileComponents();

    const first = TestBed.createComponent(ProjectScreenPreviewComponent);
    first.componentRef.setInput('project', { id: 'first', updatedAt: 'revision-1' });
    const second = TestBed.createComponent(ProjectScreenPreviewComponent);
    second.componentRef.setInput('project', { id: 'second', updatedAt: 'revision-1' });
    first.detectChanges();
    second.detectChanges();

    expect(getObserver()?.observe).toHaveBeenCalledTimes(2);
    getObserver()?.intersect(first.nativeElement as Element);
    await first.whenStable();
    first.detectChanges();
    expect(loadProjectPreview).toHaveBeenCalledWith('first', 'revision-1');
    expect(loadProjectPreview).toHaveBeenCalledTimes(1);

    first.destroy();
    second.destroy();
    expect(getObserver()?.disconnect).toHaveBeenCalledOnce();
  });
});

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

  it('loads a real preview when near view and releases its object URL on destroy', async () => {
    const preview = new Blob(['renderer capture'], { type: 'image/jpeg' });
    const loadProjectPreview = vi.fn(async () => preview);
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:project-preview');
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
      'blob:project-preview',
    );
    expect(getObserver()?.disconnect).toHaveBeenCalledOnce();

    fixture.destroy();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:project-preview');
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
});

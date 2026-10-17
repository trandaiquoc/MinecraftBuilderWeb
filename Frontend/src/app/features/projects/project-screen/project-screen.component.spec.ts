import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../core/domain/project.types';
import type { ProjectSummary } from '../../../core/persistence/project-store/project-store.port';
import { MojangVersionService } from '../../../core/assets/vanilla/mojang-vanilla-asset-source';
import { ProjectScreenComponent } from './project-screen.component';
import { ProjectScreenWorkflow } from './project-screen-workflow';

describe('ProjectScreenComponent', () => {
  it('delegates imported project activation to the screen workflow', async () => {
    const project = { id: 'imported' } as ProjectDocument;
    const createProject = vi.fn(async () => project);
    const activateImportedProject = vi.fn(async () => undefined);
    const component = Object.create(ProjectScreenComponent.prototype) as ProjectScreenComponent;
    const state = component as unknown as Record<string, unknown>;
    state['structureJsonImport'] = { createProject };
    state['workflow'] = { activateImportedProject };

    await (
      component as unknown as { createProjectFromStructureJson(): Promise<void> }
    ).createProjectFromStructureJson();

    expect(createProject).toHaveBeenCalledOnce();
    expect(activateImportedProject).toHaveBeenCalledWith(project);
  });

  it('filters and sorts the project cards through the board controls', async () => {
    const projects: readonly ProjectSummary[] = [
      {
        id: 'cabin',
        name: 'Lakeside Cabin',
        minecraftVersion: '1.21.1',
        size: { x: 16, y: 16, z: 16 },
        structureMode: 'vanilla-structure-block',
        updatedAt: '2026-10-16T10:00:00.000Z',
      },
      {
        id: 'garden',
        name: 'Garden Study',
        minecraftVersion: '1.20.4',
        size: { x: 48, y: 32, z: 48 },
        structureMode: 'huge-structure-blocks',
        updatedAt: '2026-10-15T10:00:00.000Z',
      },
      {
        id: 'tower',
        name: 'Tower 2',
        minecraftVersion: '1.21.1',
        size: { x: 24, y: 48, z: 24 },
        structureMode: 'vanilla-structure-block',
        updatedAt: '2026-10-14T10:00:00.000Z',
      },
    ];
    const workflow = {
      projects: signal(projects),
      error: signal<string | undefined>(undefined),
      listError: signal(false),
      loadStatus: signal<'loading' | 'ready' | 'error'>('ready'),
      creating: signal(false),
      openingId: signal<string | undefined>(undefined),
      deletingProjectIds: signal<ReadonlySet<string>>(new Set()),
      deleteError: signal<string | undefined>(undefined),
      loadProjects: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      imports: [ProjectScreenComponent],
      providers: [
        {
          provide: MojangVersionService,
          useValue: { releases: signal([]), loadReleases: vi.fn(async () => []) },
        },
      ],
    });
    TestBed.overrideComponent(ProjectScreenComponent, {
      set: { providers: [{ provide: ProjectScreenWorkflow, useValue: workflow }] },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(ProjectScreenComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cardNames = (): string[] =>
      Array.from(root.querySelectorAll('.project-row strong')).map(
        (name) => name.textContent?.trim() ?? '',
      );
    expect(cardNames()).toEqual(['Lakeside Cabin', 'Garden Study', 'Tower 2']);

    const search = fixture.nativeElement.querySelector(
      '.project-search-field input',
    ) as HTMLInputElement;
    search.value = 'cabin';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(cardNames()).toEqual(['Lakeside Cabin']);

    search.value = 'unmatched';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.project-list-empty').textContent).toContain(
      'No projects match your search.',
    );

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const sort = fixture.nativeElement.querySelector('.project-sort') as HTMLSelectElement;
    sort.value = 'name';
    sort.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(cardNames()).toEqual(['Garden Study', 'Lakeside Cabin', 'Tower 2']);
    fixture.destroy();
  });
});

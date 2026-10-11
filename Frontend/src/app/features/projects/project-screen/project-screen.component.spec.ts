import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { ProjectScreenComponent } from './project-screen.component';

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
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { EditorSessionService } from './editor-session.service';

const project = (id: string, currentY: number): ProjectDocument => ({
  schemaVersion: 3,
  id,
  metadata: { name: id, minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 8, y: 200, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
});

describe('EditorSessionService Y-layer preview', () => {
  it('keeps scrub previews transient and exposes the effective layer immediately', () => {
    const workspace = new WorkspaceStateService();
    TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }] });
    const session = TestBed.inject(EditorSessionService);
    const current = project('current', 20);
    workspace.project.set(current);

    for (let y = 21; y <= 120; y += 1) session.previewCurrentY(current.id, y);

    expect(session.currentY(current)).toBe(120);
    expect(workspace.project()).toBe(current);
    session.clearCurrentYPreview(current.id);
    expect(session.currentY(current)).toBe(20);
  });

  it('does not leak a preview to another project', () => {
    const workspace = new WorkspaceStateService();
    TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStateService, useValue: workspace }] });
    const session = TestBed.inject(EditorSessionService);
    const first = project('first', 3);
    const second = project('second', 7);

    session.previewCurrentY(first.id, 5);
    expect(session.currentY(second)).toBe(7);
    session.clearCurrentYPreview(second.id);
    expect(session.currentY(first)).toBe(5);
  });
});

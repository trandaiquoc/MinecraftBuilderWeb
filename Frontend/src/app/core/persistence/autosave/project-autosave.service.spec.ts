import { ProjectDocument } from '../../domain/project.types';
import { isEditorSettingsOnlyChange } from './project-autosave.service';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'project',
  metadata: { name: 'Project', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {} }],
  groups: [],
  decorations: [],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .28 },
};

describe('isEditorSettingsOnlyChange', () => {
  it('recognizes view-setting changes while retaining canonical project references', () => {
    const changed = { ...project, editorSettings: { ...project.editorSettings, currentY: 2 } };
    expect(isEditorSettingsOnlyChange(project, changed)).toBe(true);
  });

  it('keeps structure, group, metadata, and project changes on full persistence', () => {
    expect(isEditorSettingsOnlyChange(project, { ...project, blocks: [...project.blocks], editorSettings: { ...project.editorSettings, currentY: 2 } })).toBe(false);
    expect(isEditorSettingsOnlyChange(project, { ...project, groups: [...project.groups], editorSettings: { ...project.editorSettings, currentY: 2 } })).toBe(false);
    expect(isEditorSettingsOnlyChange(project, { ...project, metadata: { ...project.metadata }, editorSettings: { ...project.editorSettings, currentY: 2 } })).toBe(false);
    expect(isEditorSettingsOnlyChange(project, { ...project, id: 'other', editorSettings: { ...project.editorSettings, currentY: 2 } })).toBe(false);
  });
});

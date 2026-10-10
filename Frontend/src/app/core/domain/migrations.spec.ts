import { describe, expect, it } from 'vitest';
import { migrateProject } from './migrations';
import type { ProjectDocument } from './project.types';

const project = (
  size: ProjectDocument['size'],
  structureMode: ProjectDocument['structureMode'],
): ProjectDocument => ({
  schemaVersion: 3,
  id: 'legacy-project',
  metadata: { name: 'Legacy', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size,
  structureMode,
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
});

describe('project compatibility migration', () => {
  it('repairs an oversized project persisted as Vanilla', () => {
    const migrated = migrateProject(project({ x: 64, y: 18, z: 64 }, 'vanilla-structure-block'));
    expect(migrated.structureMode).toBe('huge-structure-blocks');
    expect(migrated.size).toEqual({ x: 64, y: 18, z: 64 });
  });

  it('repairs a small project persisted as Huge', () => {
    expect(
      migrateProject(project({ x: 32, y: 32, z: 32 }, 'huge-structure-blocks')).structureMode,
    ).toBe('vanilla-structure-block');
  });

  it('preserves unsupported legacy data without pretending HSB supports it', () => {
    const migrated = migrateProject(project({ x: 513, y: 18, z: 64 }, 'vanilla-structure-block'));
    expect(migrated.structureMode).toBe('vanilla-structure-block');
    expect(migrated.size).toEqual({ x: 513, y: 18, z: 64 });
  });
});

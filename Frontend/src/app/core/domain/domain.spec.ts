import { coordinateKey, isWithinBounds } from './coordinates';
import { validateBlockId, validateCoordinate, validateProject, validateProjectSize } from './validation';
import { ProjectDocument } from './project.types';

describe('domain validation', () => {
  it('accepts integer coordinates inside exclusive upper bounds', () => {
    expect(isWithinBounds({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 4 })).toBe(true);
    expect(isWithinBounds({ x: 2, y: 0, z: 0 }, { x: 2, y: 3, z: 4 })).toBe(false);
  });

  it('rejects fractional and out-of-bounds coordinates', () => {
    expect(validateCoordinate({ x: 1.5, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }).map(({ code }) => code)).toContain('invalid-coordinate');
    expect(validateCoordinate({ x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }).map(({ code }) => code)).toContain('out-of-bounds');
  });

  it('validates registry IDs and matching namespaces', () => {
    expect(validateBlockId({ id: 'minecraft:stone', namespace: 'minecraft' })).toEqual([]);
    expect(validateBlockId({ id: 'minecraft:stone', namespace: 'example' }).map(({ code }) => code)).toContain('invalid-namespace');
  });

  it('validates project size and placed block bounds', () => {
    expect(validateProjectSize({ x: 0, y: 2, z: 2 }).map(({ code }) => code)).toContain('invalid-size');
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'project-1',
      metadata: { name: 'Test', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      size: { x: 2, y: 2, z: 2 },
      structureMode: 'vanilla-structure-block',
      blocks: [{ kind: 'missing', id: 'example:unknown', namespace: 'example', position: { x: 2, y: 0, z: 0 }, state: {} }],
      groups: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    };
    expect(validateProject(project).issues.map(({ code }) => code)).toContain('out-of-bounds');
  });

  it('accepts Mojang release identifiers without treating them as SemVer', () => {
    const base: ProjectDocument = {
      schemaVersion: 3, id: 'project-version', metadata: { name: 'Version test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
      size: { x: 1, y: 1, z: 1 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
    };
    for (const version of ['1.21.1', '1.21', '26.3']) expect(validateProject({ ...base, metadata: { ...base.metadata, minecraftVersion: version } }).valid).toBe(true);
    for (const version of ['', ' 26.3 ', '../26.3', '26/3', '26.3\\client']) expect(validateProject({ ...base, metadata: { ...base.metadata, minecraftVersion: version } }).issues.map(({ code }) => code)).toContain('invalid-minecraft-version');
  });

  it('creates stable coordinate keys', () => {
    expect(coordinateKey({ x: 1, y: 2, z: 3 })).toBe('1,2,3');
  });
});

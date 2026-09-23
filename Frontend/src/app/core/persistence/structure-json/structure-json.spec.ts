import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../../domain/project.types';
import { CURRENT_PROJECT_PACKAGE_VERSION, PROJECT_PACKAGE_FORMAT, serializeProjectPackage } from '../project-package/project-package';
import { createStructureJsonExample, CURRENT_STRUCTURE_JSON_VERSION, serializeStructureJson, serializeStructureJsonValue, structureJsonFromProject, STRUCTURE_JSON_FORMAT, validateStructureJsonV1 } from './structure-json';

const baseProject: ProjectDocument = {
  schemaVersion: 3,
  id: 'internal-project-id',
  metadata: { name: 'AI House', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', groups: [{ id: 'roof', name: 'Roof', visible: true, locked: false }], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
  decorations: [{ kind: 'item-frame', instanceId: 'frame-1', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: 0, z: 0 }, facing: 'north', rotation: 0, invisible: false, fixed: false, itemDropChance: 1 }],
  blocks: [
    { kind: 'missing', id: 'chipped:unknown_block', namespace: 'chipped', position: { x: 2, y: 0, z: 1 }, state: { z: 'last', a: 'first' }, groupIds: ['roof'], blockEntityData: { kind: 'unknown' } },
    { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {}, groupIds: ['roof'] },
  ],
};

describe('Structure JSON v1 codec', () => {
  it('uses a distinct public format identity and version', () => {
    const value = structureJsonFromProject(baseProject);
    expect(value.format).toBe(STRUCTURE_JSON_FORMAT);
    expect(value.formatVersion).toBe(CURRENT_STRUCTURE_JSON_VERSION);
    expect(STRUCTURE_JSON_FORMAT).not.toBe(PROJECT_PACKAGE_FORMAT);
    expect(CURRENT_PROJECT_PACKAGE_VERSION).toBe(1);
  });

  it('exports resolved and missing blocks through the same public shape', () => {
    const value = structureJsonFromProject(baseProject);
    expect(value.blocks).toEqual([
      { id: 'minecraft:stone', x: 0, y: 0, z: 0, state: {} },
      { id: 'chipped:unknown_block', x: 2, y: 0, z: 1, state: { a: 'first', z: 'last' } },
    ]);
  });

  it('does not leak project/editor/entity fields', () => {
    const parsed = JSON.parse(serializeStructureJson(baseProject)) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('schemaVersion');
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('groups');
    expect(parsed).not.toHaveProperty('decorations');
    expect(parsed).not.toHaveProperty('editorSettings');
    expect(parsed).not.toHaveProperty('createdAt');
    expect(JSON.stringify(parsed)).not.toContain('blockEntityData');
    expect(JSON.stringify(parsed['blocks'])).not.toContain('groupIds');
  });

  it('serializes deterministic block and state ordering', () => {
    const reordered = { ...baseProject, blocks: [...baseProject.blocks].reverse() };
    expect(serializeStructureJson(baseProject)).toBe(serializeStructureJson(reordered));
  });

  it('keeps the canonical example inside the public contract', () => {
    const example = createStructureJsonExample();
    expect(example.blocks.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(serializeStructureJsonValue(example))).toMatchObject({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1 });
  });

  it('validates the public v1 shape without applying project semantics', () => {
    const valid = serializeStructureJsonValue(createStructureJsonExample());
    expect(validateStructureJsonV1(valid).valid).toBe(true);
    expect(validateStructureJsonV1('{"format":"minecraftbuilder-structure"}').code).toBe('version');
    expect(validateStructureJsonV1('{')).toMatchObject({ valid: false, code: 'invalid-json' });
    expect(validateStructureJsonV1(JSON.stringify({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: 'minecraft:stone', x: 0.5, y: 0, z: 0 }] })).code).toBe('block');
    expect(validateStructureJsonV1(JSON.stringify({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: 'example:block', x: 0, y: 0, z: 0, state: { facing: 'north' } }] })).valid).toBe(true);
  });
});

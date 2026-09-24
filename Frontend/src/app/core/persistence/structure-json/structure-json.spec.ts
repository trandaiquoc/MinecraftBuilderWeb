import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../../domain/project.types';
import { CURRENT_PROJECT_PACKAGE_VERSION, PROJECT_PACKAGE_FORMAT, serializeProjectPackage } from '../project-package/project-package';
import { createStructureJsonExample, CURRENT_STRUCTURE_JSON_VERSION, parseStructureJson, serializeStructureJson, serializeStructureJsonValue, structureJsonFromProject, STRUCTURE_JSON_FORMAT, validateStructureJson, validateStructureJsonV1 } from './structure-json';

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

  it('does not leak project/editor/entity fields while exporting supported decorations', () => {
    const parsed = JSON.parse(serializeStructureJson(baseProject)) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('schemaVersion');
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('groups');
    expect(parsed).toHaveProperty('decorations');
    expect(parsed).not.toHaveProperty('editorSettings');
    expect(parsed).not.toHaveProperty('createdAt');
    expect(JSON.stringify(parsed)).not.toContain('blockEntityData');
    expect(JSON.stringify(parsed['blocks'])).not.toContain('groupIds');
    expect(JSON.stringify(parsed['decorations'])).not.toContain('instanceId');
    expect(JSON.stringify(parsed['decorations'])).not.toContain('entityTypeId');
  });

  it('serializes deterministic block and state ordering', () => {
    const reordered = { ...baseProject, blocks: [...baseProject.blocks].reverse() };
    expect(serializeStructureJson(baseProject)).toBe(serializeStructureJson(reordered));
  });

  it('keeps the canonical example inside the public contract', () => {
    const example = createStructureJsonExample();
    expect(example.blocks.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(serializeStructureJsonValue(example))).toMatchObject({ format: STRUCTURE_JSON_FORMAT, formatVersion: CURRENT_STRUCTURE_JSON_VERSION, decorations: expect.any(Array) });
  });

  it('round-trips normal and glow frame item payloads without dropping components', () => {
    const project: ProjectDocument = {
      ...baseProject,
      decorations: [
        { kind: 'item-frame', instanceId: 'frame-1', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: 0, z: 0 }, facing: 'north', item: { id: 'minecraft:diamond', count: 2, components: { custom_name: 'Gem' } }, rotation: 3, invisible: false, fixed: false, itemDropChance: 1 },
        { kind: 'glow-item-frame', instanceId: 'frame-2', entityTypeId: 'minecraft:glow_item_frame', anchor: { x: 1, y: 0, z: 0 }, facing: 'south', item: { id: 'minecraft:stone', count: 1, components: { custom_model_data: 7 } }, rotation: 6, invisible: false, fixed: true, itemDropChance: .5 },
      ],
    };
    const parsed = parseStructureJson(serializeStructureJson(project));
    expect(parsed.valid).toBe(true);
    expect(parsed.value && 'decorations' in parsed.value ? parsed.value.decorations : []).toEqual([
      expect.objectContaining({ kind: 'item-frame', item: { id: 'minecraft:diamond', count: 2, components: { custom_name: 'Gem' } } }),
      expect.objectContaining({ kind: 'glow-item-frame', item: { id: 'minecraft:stone', count: 1, components: { custom_model_data: 7 } } }),
    ]);
  });

  it('validates the public v1 and v2 shapes without applying project semantics', () => {
    const valid = serializeStructureJsonValue(createStructureJsonExample());
    expect(validateStructureJson(valid).valid).toBe(true);
    const v1 = JSON.stringify({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1, minecraftVersion: '1.21.1', blocks: [] });
    expect(validateStructureJsonV1(v1).valid).toBe(true);
    expect(validateStructureJsonV1('{"format":"minecraftbuilder-structure"}').code).toBe('version');
    expect(validateStructureJsonV1('{')).toMatchObject({ valid: false, code: 'invalid-json' });
    expect(validateStructureJsonV1(JSON.stringify({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: 'minecraft:stone', x: 0.5, y: 0, z: 0 }] })).code).toBe('block');
    expect(validateStructureJsonV1(JSON.stringify({ format: STRUCTURE_JSON_FORMAT, formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: 'example:block', x: 0, y: 0, z: 0, state: { facing: 'north' } }] })).valid).toBe(true);
  });
});

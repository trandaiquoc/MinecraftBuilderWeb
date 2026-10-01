import { describe, expect, it } from 'vitest';
import { clipStructureJsonToBounds, inspectStructureJsonBounds, resizeProjectForStructureJsonImport } from './structure-json-bounds';
import type { ProjectDocument } from '../../domain/project.types';
import type { StructureJson } from './structure-json';

const source: StructureJson = {
  format: 'minecraftbuilder-structure', formatVersion: 2, minecraftVersion: '1.21.1',
  blocks: [{ id: 'minecraft:stone', x: 0, y: 0, z: 0 }, { id: 'minecraft:stone', x: 63, y: 17, z: 63 }, { id: 'minecraft:stone', x: -1, y: 0, z: 0 }],
  decorations: [{ kind: 'item-frame', anchor: { x: 64, y: 1, z: 1 }, facing: 'north' }],
};
const positiveSource: StructureJson = { ...source, blocks: source.blocks.filter((block) => block.x >= 0), decorations: [] };

describe('Structure JSON bounds preflight', () => {
  it('calculates required dimensions from blocks and decoration anchors', () => {
    expect(inspectStructureJsonBounds(source, { x: 32, y: 10, z: 32 })).toMatchObject({
      requiredSize: { x: 65, y: 18, z: 64 }, exceedsCurrent: true, hasNegativeCoordinates: true, blocksOutsideBounds: 2, decorationsOutsideBounds: 1,
    });
  });

  it('does not report an exact fit as oversized', () => {
    const exact: StructureJson = { ...source, blocks: [{ id: 'minecraft:stone', x: 63, y: 17, z: 63 }], decorations: [] };
    expect(inspectStructureJsonBounds(exact, { x: 64, y: 18, z: 64 }).exceedsCurrent).toBe(false);
  });

  it('clips only blocks and decoration anchors outside the current bounds', () => {
    const clipped = clipStructureJsonToBounds(source, { x: 32, y: 10, z: 32 });
    expect(clipped.blocks).toHaveLength(1);
    expect(clipped.decorations).toHaveLength(0);
    expect(clipped.blocks[0]).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it('resizes only as far as required and switches Vanilla to Huge when needed', () => {
    const project = { size: { x: 32, y: 10, z: 32 }, structureMode: 'vanilla-structure-block' } as ProjectDocument;
    const bounds = inspectStructureJsonBounds(positiveSource, project.size);
    expect(resizeProjectForStructureJsonImport(project, bounds)).toMatchObject({ size: { x: 64, y: 18, z: 64 }, structureMode: 'huge-structure-blocks' });
  });

  it('preserves larger existing axes and keeps Huge mode within its limit', () => {
    const project = { size: { x: 80, y: 20, z: 40 }, structureMode: 'huge-structure-blocks' } as ProjectDocument;
    const bounds = inspectStructureJsonBounds(positiveSource, project.size);
    expect(resizeProjectForStructureJsonImport(project, bounds)).toMatchObject({ size: { x: 80, y: 20, z: 64 }, structureMode: 'huge-structure-blocks' });
  });

  it('rejects negative coordinates and sizes beyond Huge Structure Blocks', () => {
    const vanilla = { size: { x: 16, y: 16, z: 16 }, structureMode: 'vanilla-structure-block' } as ProjectDocument;
    expect(resizeProjectForStructureJsonImport(vanilla, inspectStructureJsonBounds(source, vanilla.size))).toBeUndefined();
    const tooLarge = { ...source, blocks: [{ id: 'minecraft:stone', x: 512, y: 0, z: 0 }] };
    const largeBounds = inspectStructureJsonBounds(tooLarge, vanilla.size);
    expect(resizeProjectForStructureJsonImport(vanilla, largeBounds)).toBeUndefined();
  });
});

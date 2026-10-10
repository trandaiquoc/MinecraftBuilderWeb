import { describe, expect, it } from 'vitest';
import type { PlacedBlock, ProjectDocument } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import {
  YLayerPresentationOwner,
  type YLayerPresentationReadiness,
} from './y-layer-presentation-owner';

function block(y: number): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x: y * 2, y, z: 0 },
    state: {},
  };
}

function makeProject(
  blocks: readonly PlacedBlock[],
  groups: ProjectDocument['groups'] = [],
): ProjectDocument {
  return {
    schemaVersion: 3,
    id: 'presentation-test',
    metadata: { name: 'Presentation', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
    size: { x: 16, y: 8, z: 1 },
    structureMode: 'vanilla-structure-block',
    blocks,
    groups,
    editorSettings: {
      currentY: 0,
      layerVisibility: 'whole-structure',
      referenceLayerOpacity: 0.28,
    },
  };
}

function readiness(
  count: number,
  overrides: Partial<YLayerPresentationReadiness> = {},
): YLayerPresentationReadiness {
  return {
    residentBlocks: count,
    instanceMembers: count,
    objectRepresentations: 0,
    layeredBatches: true,
    surfaceRepresentations: 0,
    terrainRepresentations: 0,
    fluidRepresentations: 0,
    layeredFluids: true,
    placeholders: 0,
    pendingWork: false,
    interiorCulledBlocks: 0,
    ...overrides,
  };
}

function layerIndex(blocks: readonly PlacedBlock[]): LayerBlockIndex {
  const byY = new Map<number, PlacedBlock[]>();
  for (const value of blocks)
    (byY.get(value.position.y) ?? (byY.set(value.position.y, []), byY.get(value.position.y)!)).push(
      value,
    );
  return {
    blocksAtY: (y) => byY.get(y) ?? [],
    blockCountAtY: (y) => byY.get(y)?.length ?? 0,
    occupiedLayers: () => [...byY.keys()],
    allBlocks: () => blocks,
  };
}

function options(
  layerY: number,
  index: LayerBlockIndex,
  visibility: ViewportRenderOptions['visibility'] = 'whole-structure',
): ViewportRenderOptions {
  return { layerY, visibility, layerIndex: index };
}

describe('YLayerPresentationOwner', () => {
  it('switches prepared isolated layers by presentation scope without materializing voxel entries', () => {
    const blocks = [block(1), block(5)];
    const project = makeProject(blocks);
    const index = layerIndex(blocks);
    const owner = new YLayerPresentationOwner();
    const current = options(1, index);
    expect(owner.evaluate(project, current, readiness(blocks.length))).toEqual({ supported: true });
    owner.activate(
      project,
      current,
      0,
      (position) =>
        blocks.find((value) => coordinateKey(value.position) === coordinateKey(position)),
      (value, visualOptions) => ({
        block: value,
        role: value.position.y === visualOptions.layerY ? 'normal' : 'reference',
        signature: `${value.id}|${value.position.y === visualOptions.layerY ? 'normal' : 'reference'}`,
        occlusionClass: 'unknown',
      }),
    );

    expect(owner.visibleBlockCount()).toBe(2);
    expect(owner.visibleEntry('2,1,0')?.role).toBe('normal');
    expect(owner.visibleEntry('10,5,0')?.role).toBe('reference');
    expect(owner.materializedEntries).toEqual([]);
    expect(owner.materializedMap.size).toBe(0);

    const next = options(5, index, 'all-below');
    expect(owner.update(project, next, 0)).toBe(true);
    expect(owner.visibleBlockCount()).toBe(2);
    expect(owner.visibleEntry('2,1,0')?.role).toBe('reference');
    expect(owner.visibleEntry('10,5,0')?.role).toBe('normal');
  });

  it('uses indexed group-filtered layer counts for direct presentation diagnostics', () => {
    const blocks = [
      { ...block(1), groupIds: ['hidden', 'entrance'] },
      { ...block(1), position: { x: 3, y: 1, z: 0 }, groupIds: ['entrance'] },
      { ...block(1), position: { x: 4, y: 1, z: 0 } },
    ];
    const project = makeProject(blocks, [
      { id: 'hidden', name: 'Hidden', visible: false, locked: false },
    ]);
    const byY = new Map<number, PlacedBlock[]>();
    for (const value of blocks)
      (
        byY.get(value.position.y) ?? (byY.set(value.position.y, []), byY.get(value.position.y)!)
      ).push(value);
    const index: LayerBlockIndex = {
      blocksAtY: (y) => byY.get(y) ?? [],
      blockCountAtY: (y) => byY.get(y)?.length ?? 0,
      blockCountAtYForPresentation: (y, hiddenGroupIds, isolatedGroupId) =>
        (byY.get(y) ?? []).filter((value) => {
          const ids = value.groupIds ?? [];
          return (
            !ids.some((id) => hiddenGroupIds.has(id)) &&
            (isolatedGroupId === undefined || ids.includes(isolatedGroupId))
          );
        }).length,
      occupiedLayers: () => [...byY.keys()],
      allBlocks: () => blocks,
    };
    const owner = new YLayerPresentationOwner();
    const initialOptions = { ...options(1, index), visibility: 'whole-structure' as const };
    owner.activate(
      project,
      initialOptions,
      0,
      (position) =>
        blocks.find((value) => coordinateKey(value.position) === coordinateKey(position)),
      (value, visualOptions) => ({
        block: value,
        role: value.position.y === visualOptions.layerY ? 'normal' : 'reference',
        signature: 'entry',
        occlusionClass: 'unknown',
      }),
    );

    expect(owner.visibleBlockCount()).toBe(2);
    expect(owner.update(project, { ...initialOptions, isolatedGroupId: 'entrance' }, 0)).toBe(true);
    expect(owner.visibleBlockCount()).toBe(1);
  });

  it('keeps culling and non-layered renderer families fail-closed while supporting group and selection presentation', () => {
    const blocks = [block(1), block(2)];
    const project = makeProject(blocks);
    const owner = new YLayerPresentationOwner();
    expect(
      owner.evaluate(
        project,
        options(1, layerIndex(blocks)),
        readiness(2, { interiorCulledBlocks: 1 }),
      ).reason,
    ).toBe('interior-culling');
    expect(
      owner.evaluate(
        project,
        { ...options(1, layerIndex(blocks)), exposedFaceRendering: true },
        readiness(2),
      ).reason,
    ).toBe('exposed-face-rendering');
    expect(
      owner.evaluate(
        project,
        options(1, layerIndex(blocks)),
        readiness(2, { instanceMembers: 1, fluidRepresentations: 1, layeredFluids: false }),
      ).reason,
    ).toBe('non-layered-batch');
    expect(
      owner.evaluate(
        project,
        options(1, layerIndex(blocks)),
        readiness(2, { instanceMembers: 1, fluidRepresentations: 1, layeredFluids: true }),
      ),
    ).toEqual({ supported: true });
    const hiddenProject = makeProject(
      blocks.map((value) => ({ ...value, groupIds: ['hidden'] })),
      [{ id: 'hidden', name: 'Hidden', visible: false, locked: false }],
    );
    expect(
      owner.evaluate(
        hiddenProject,
        {
          ...options(1, layerIndex(blocks)),
          selectionBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 8, z: 8 } },
        },
        readiness(2),
      ),
    ).toEqual({ supported: true });
    owner.activate(
      hiddenProject,
      options(1, layerIndex(blocks)),
      0,
      (position) =>
        hiddenProject.blocks.find(
          (value) => coordinateKey(value.position) === coordinateKey(position),
        ),
      (value, visualOptions) => ({
        block: value,
        role: value.position.y === visualOptions.layerY ? 'normal' : 'reference',
        signature: 'entry',
        occlusionClass: 'unknown',
      }),
    );
    expect(owner.visibleEntry('2,1,0')).toBeUndefined();
    expect(
      owner.update(
        project,
        { ...options(1, layerIndex(blocks)), isolatedGroupId: 'not-present' },
        0,
      ),
    ).toBe(true);
    expect(owner.visibleEntry('2,1,0')).toBeUndefined();
  });
});

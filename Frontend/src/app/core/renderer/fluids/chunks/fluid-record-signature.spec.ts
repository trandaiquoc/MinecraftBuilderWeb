import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../../domain/project.types';
import type { FluidChunkRecord } from '../state/fluid-render-contracts';
import type { ResolvedFluidRenderState } from '../state/fluid-state';
import { fluidRecordSignature } from './fluid-record-signature';

describe('fluidRecordSignature', () => {
  it('ignores property insertion order in an equivalent resolved fluid state', () => {
    const block: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:water',
      namespace: 'minecraft',
      position: { x: 1, y: 2, z: 3 },
      state: { level: '0' },
    };
    const state: ResolvedFluidRenderState = {
      kind: 'water',
      blockLevel: 0,
      fluidLevel: 8,
      falling: false,
      still: true,
      height: 8 / 9,
      fluidTypeId: 'minecraft:water',
      connectivityKey: 'minecraft:water',
      materialKey: 'minecraft:water',
      renderLayer: 'translucent',
      stillTexture: 'minecraft:block/water_still',
      flowTexture: 'minecraft:block/water_flow',
      tint: 0x3f76e4,
      opacity: 1,
      doubleSided: true,
      depthWrite: false,
    };
    const reorderedState = Object.fromEntries(
      Object.entries(state).reverse(),
    ) as unknown as ResolvedFluidRenderState;

    expect(fluidRecordSignature({ block, state })).toBe(
      fluidRecordSignature({ block, state: reorderedState }),
    );
  });

  it('treats group membership as a set when building visual identity', () => {
    const record: FluidChunkRecord = {
      block: {
        kind: 'resolved',
        id: 'minecraft:water',
        namespace: 'minecraft',
        position: { x: 1, y: 2, z: 3 },
        state: { level: '0' },
        groupIds: ['build', 'water-feature'],
      },
      state: {
        kind: 'water',
        blockLevel: 0,
        fluidLevel: 8,
        falling: false,
        still: true,
        height: 8 / 9,
        fluidTypeId: 'minecraft:water',
        connectivityKey: 'minecraft:water',
        materialKey: 'minecraft:water',
        renderLayer: 'translucent',
        stillTexture: 'minecraft:block/water_still',
        flowTexture: 'minecraft:block/water_flow',
        tint: 0x3f76e4,
        opacity: 1,
        doubleSided: true,
        depthWrite: false,
      },
    };

    expect(fluidRecordSignature(record)).toBe(
      fluidRecordSignature({
        ...record,
        block: { ...record.block, groupIds: ['water-feature', 'build', 'build'] },
      }),
    );
  });
});

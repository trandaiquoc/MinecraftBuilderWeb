import { describe, expect, it } from 'vitest';
import {
  decorationAabb,
  decorationAnchorFromSupport,
  decorationInBounds,
  planDecorationPlacement,
  supportsDecoration,
} from './decoration-placement';

describe('decoration placement', () => {
  it('uses the attached air cell as anchor and validates project bounds', () => {
    expect(decorationAnchorFromSupport({ x: 2, y: 3, z: 4 }, 'north')).toEqual({
      x: 2,
      y: 3,
      z: 3,
    });
    expect(decorationInBounds({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 })).toBe(true);
    expect(decorationInBounds({ x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 4 })).toBe(false);
    expect(supportsDecoration('painting', 'up', true)).toBe(false);
    expect(supportsDecoration('painting', 'north', true)).toBe(true);
    const negativeAnchor = planDecorationPlacement(
      {
        schemaVersion: 1,
        id: 'bounds',
        metadata: { name: 'bounds', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
        size: { x: 4, y: 4, z: 4 },
        structureMode: 'vanilla-structure-block',
        blocks: [
          {
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position: { x: 0, y: 0, z: 0 },
            state: {},
          },
        ],
        groups: [],
        decorations: [],
        editorSettings: {
          currentY: 0,
          layerVisibility: 'current-only',
          referenceLayerOpacity: 0.28,
        },
      },
      { kind: 'item-frame', fixed: false },
      { x: 0, y: 0, z: 0 },
      'west',
    );
    expect(negativeAnchor.status).toBe('invalid');
    expect(negativeAnchor.reason).toBe('out-of-bounds');
  });

  it('produces frame dimensions from the canonical decoration bounds', () => {
    const frame = {
      instanceId: 'frame',
      kind: 'item-frame' as const,
      entityTypeId: 'minecraft:item_frame' as const,
      anchor: { x: 2, y: 3, z: 4 },
      facing: 'north' as const,
      rotation: 0,
      fixed: false,
    };
    const bounds = decorationAabb(frame);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.0625);
  });

  it('returns a full-size invalid candidate and stable collision reasons', () => {
    const project = {
      schemaVersion: 3 as const,
      id: 'p',
      metadata: { name: 'p', minecraftVersion: '1.21.1' as const, createdAt: '', updatedAt: '' },
      size: { x: 8, y: 8, z: 8 },
      structureMode: 'vanilla-structure-block' as const,
      blocks: [
        {
          kind: 'resolved' as const,
          id: 'minecraft:stone',
          namespace: 'minecraft',
          position: { x: 2, y: 2, z: 2 },
          state: {},
        },
      ],
      groups: [],
      decorations: [],
      editorSettings: {
        currentY: 2,
        layerVisibility: 'current-only' as const,
        referenceLayerOpacity: 0.3,
      },
    };
    const missing = planDecorationPlacement(
      project,
      { kind: 'painting', variantId: 'pool' },
      { x: 2, y: 2, z: 2 },
      'south',
    );
    expect(missing.reason).toBe('missing-support');
    expect(missing.decoration?.variantId).toBe('pool');
    expect(
      decorationAabb(missing.decoration!).max.x - decorationAabb(missing.decoration!).min.x,
    ).toBeCloseTo(2);
  });
});

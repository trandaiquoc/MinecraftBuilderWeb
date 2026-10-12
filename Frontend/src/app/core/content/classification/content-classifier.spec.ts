import { describe, expect, it } from 'vitest';
import { classifyContent, isDecorationEntityId } from './content-classifier';
import {
  DECORATION_ENTITY_TYPE_IDS,
  decorationEntityTypeId,
} from '../../decorations/decoration.types';

describe('content classification', () => {
  it('keeps decorations out of the block domain', () => {
    expect(DECORATION_ENTITY_TYPE_IDS).toEqual({
      painting: 'minecraft:painting',
      'item-frame': 'minecraft:item_frame',
      'glow-item-frame': 'minecraft:glow_item_frame',
    });
    for (const [kind, id] of Object.entries(DECORATION_ENTITY_TYPE_IDS)) {
      expect(decorationEntityTypeId(kind as keyof typeof DECORATION_ENTITY_TYPE_IDS)).toBe(id);
      expect(classifyContent({ id, hasItemEvidence: true })).toMatchObject({
        kind: 'decoration-entity',
        placeable: false,
      });
      expect(isDecorationEntityId(id)).toBe(true);
    }
  });

  it('requires both world-block and item evidence for a direct placeable block item', () => {
    expect(
      classifyContent({ id: 'minecraft:test_block', hasWorldBlock: true, hasItemEvidence: true }),
    ).toMatchObject({ kind: 'block-backed-item', placeable: true });
    expect(classifyContent({ id: 'minecraft:test_item', hasItemEvidence: true })).toMatchObject({
      kind: 'item-only',
      placeable: false,
    });
    expect(
      classifyContent({
        id: 'minecraft:potted_torchflower',
        hasWorldBlock: true,
        hasItemEvidence: true,
        contentKind: 'internal-block',
      }),
    ).toMatchObject({ kind: 'internal-block', placeable: false });
  });

  it('does not apply vanilla semantic names to mod namespaces', () => {
    for (const id of [
      'example:magic_wall_sign',
      'example:custom_crop',
      'example:potted_machine',
      'example:future_wall_torch',
    ]) {
      expect(classifyContent({ id, hasWorldBlock: true, hasItemEvidence: true })).toMatchObject({
        kind: 'block-backed-item',
        placeable: true,
        internal: false,
      });
    }
    expect(classifyContent({ id: 'example:item_frame', hasItemEvidence: true })).toMatchObject({
      kind: 'item-only',
      placeable: false,
    });
  });
});

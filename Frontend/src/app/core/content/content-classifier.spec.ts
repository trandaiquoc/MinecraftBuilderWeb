import { describe, expect, it } from 'vitest';
import { classifyContent, isDecorationEntityId } from './content-classifier';

describe('content classification', () => {
  it('keeps decorations out of the block domain', () => {
    for (const id of ['minecraft:item_frame', 'minecraft:glow_item_frame', 'minecraft:painting']) {
      expect(classifyContent({ id, hasItemEvidence: true })).toMatchObject({ kind: 'decoration-entity', placeable: false });
      expect(isDecorationEntityId(id)).toBe(true);
    }
  });

  it('requires both world-block and item evidence for a direct placeable block item', () => {
    expect(classifyContent({ id: 'minecraft:test_block', hasWorldBlock: true, hasItemEvidence: true })).toMatchObject({ kind: 'block-backed-item', placeable: true });
    expect(classifyContent({ id: 'minecraft:test_item', hasItemEvidence: true })).toMatchObject({ kind: 'item-only', placeable: false });
    expect(classifyContent({ id: 'minecraft:potted_torchflower', hasWorldBlock: true, hasItemEvidence: true })).toMatchObject({ kind: 'internal-block', placeable: false });
  });

  it('does not apply vanilla semantic names to mod namespaces', () => {
    expect(classifyContent({ id: 'example:item_frame', hasItemEvidence: true })).toMatchObject({ kind: 'item-only', placeable: false });
  });
});

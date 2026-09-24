import { describe, expect, it } from 'vitest';
import { nextFrameSelection } from './decoration.service';

describe('decoration frame selection', () => {
  it('keeps the displayed item when switching normal and glow frames', () => {
    const current = { kind: 'item-frame' as const, item: { id: 'example:gem', count: 1 } };
    expect(nextFrameSelection(current, true, false)).toEqual({ kind: 'glow-item-frame', fixed: false, item: { id: 'example:gem', count: 1 } });
  });
});

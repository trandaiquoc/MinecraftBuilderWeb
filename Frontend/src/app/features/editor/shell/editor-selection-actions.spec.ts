import { describe, expect, it } from 'vitest';
import { hasEditorSelectionState } from './editor-shell.component';

describe('editor selection action state', () => {
  it('treats decorations, voxel selections and box selections as editor selections', () => {
    expect(hasEditorSelectionState(true, 0, false)).toBe(true);
    expect(hasEditorSelectionState(false, 1, false)).toBe(true);
    expect(hasEditorSelectionState(false, 0, true)).toBe(true);
    expect(hasEditorSelectionState(false, 0, false)).toBe(false);
  });
});

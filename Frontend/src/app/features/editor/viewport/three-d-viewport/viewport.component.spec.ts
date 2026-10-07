import { describe, expect, it } from 'vitest';
import { shouldClearGhostForToolChange } from './viewport.component';

describe('3D viewport ghost tool lifecycle', () => {
  it('does not clear a valid hover preview when the active tool is unchanged', () => {
    expect(shouldClearGhostForToolChange('place', 'place')).toBe(false);
  });

  it('clears the preview when the active tool changes', () => {
    expect(shouldClearGhostForToolChange('place', 'select')).toBe(true);
    expect(shouldClearGhostForToolChange(undefined, 'place')).toBe(true);
  });
});

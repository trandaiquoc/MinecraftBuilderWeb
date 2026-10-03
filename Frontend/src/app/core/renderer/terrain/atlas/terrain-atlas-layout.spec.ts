import { describe, expect, it } from 'vitest';
import { TerrainAtlasLayout } from './terrain-atlas-layout';

describe('TerrainAtlasLayout', () => {
  it('allocates deterministic non-overlapping guttered rectangles', () => {
    const layout = new TerrainAtlasLayout({ width: 16, height: 8 }, 1);
    const first = layout.allocate(4, 4)!;
    const second = layout.allocate(4, 2)!;
    expect(first).toEqual({ page: 0, x: 1, y: 1, width: 4, height: 4, gutter: 1 });
    expect(second).toEqual({ page: 0, x: 7, y: 1, width: 4, height: 2, gutter: 1 });
    expect(second.x).toBeGreaterThan(first.x + first.width + first.gutter);
  });

  it('appends to a new fixed page without moving prior sprites', () => {
    const layout = new TerrainAtlasLayout({ width: 8, height: 8 }, 1);
    const first = layout.allocate(6, 6)!;
    const second = layout.allocate(6, 6)!;
    expect(first.page).toBe(0);
    expect(second.page).toBe(1);
    expect(first).toEqual({ page: 0, x: 1, y: 1, width: 6, height: 6, gutter: 1 });
    expect(layout.pageCount).toBe(2);
  });
});

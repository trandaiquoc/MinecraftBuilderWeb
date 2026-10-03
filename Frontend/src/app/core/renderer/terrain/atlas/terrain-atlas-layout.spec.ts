import { describe, expect, it } from 'vitest';
import { TerrainAtlasLayout } from './terrain-atlas-layout';

describe('terrain atlas layout', () => {
  it('allocates deterministically with stable append-only rectangles', () => {
    const layout = new TerrainAtlasLayout({ width: 8, height: 8 }, 1);
    const first = layout.allocate(2, 2)!;
    const second = layout.allocate(2, 2)!;
    const third = layout.allocate(2, 2)!;
    expect(first).toEqual({ page: 0, x: 1, y: 1, width: 2, height: 2, gutter: 1 });
    expect(second).toEqual({ page: 0, x: 5, y: 1, width: 2, height: 2, gutter: 1 });
    expect(third).toEqual({ page: 0, x: 1, y: 5, width: 2, height: 2, gutter: 1 });
    expect(first).toEqual({ page: 0, x: 1, y: 1, width: 2, height: 2, gutter: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { clampGroupMovePanelPosition } from './group-move-panel';

describe('group move panel positioning', () => {
  it('keeps a normal panel within the viewport', () => {
    expect(clampGroupMovePanelPosition({ x: 900, y: 700 }, { width: 1000, height: 800 }, { width: 300, height: 280 })).toEqual({ x: 900, y: 700 });
    expect(clampGroupMovePanelPosition({ x: -400, y: -20 }, { width: 1000, height: 800 }, { width: 300, height: 280 })).toEqual({ x: -252, y: 0 });
  });

  it('leaves the header reachable when the panel is dragged mostly offscreen', () => {
    expect(clampGroupMovePanelPosition({ x: 9999, y: 9999 }, { width: 600, height: 400 }, { width: 300, height: 280 })).toEqual({ x: 552, y: 352 });
  });

  it('handles a viewport narrower than the panel', () => {
    expect(clampGroupMovePanelPosition({ x: 200, y: 50 }, { width: 200, height: 160 }, { width: 300, height: 280 })).toEqual({ x: 152, y: 50 });
  });
});

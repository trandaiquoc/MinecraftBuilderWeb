export interface PanelPosition {
  readonly x: number;
  readonly y: number;
}

export interface PanelViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface PanelSize {
  readonly width: number;
  readonly height: number;
}

// Keep this breakpoint aligned with the compact panel width in its stylesheet.
const NARROW_VIEWPORT_MAX_WIDTH = 560;

/** Keeps the move window reachable without constraining how much of it is visible. */
export function clampGroupMovePanelPosition(
  position: PanelPosition,
  viewport: PanelViewportSize,
  panel: PanelSize,
  reachableHeaderSize = 48,
): PanelPosition {
  const keepPanelVisible = viewport.width <= NARROW_VIEWPORT_MAX_WIDTH;
  const minX = keepPanelVisible ? 0 : reachableHeaderSize - panel.width;
  const maxX = keepPanelVisible
    ? Math.max(minX, viewport.width - panel.width)
    : Math.max(minX, viewport.width - reachableHeaderSize);
  const minY = 0;
  const maxY = Math.max(minY, viewport.height - reachableHeaderSize);
  return {
    x: clamp(Number.isFinite(position.x) ? position.x : 0, minX, maxX),
    y: clamp(Number.isFinite(position.y) ? position.y : 0, minY, maxY),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

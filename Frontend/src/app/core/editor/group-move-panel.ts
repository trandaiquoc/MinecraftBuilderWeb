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

/** Keeps the move window reachable without constraining how much of it is visible. */
export function clampGroupMovePanelPosition(
  position: PanelPosition,
  viewport: PanelViewportSize,
  panel: PanelSize,
  reachableHeaderSize = 48,
): PanelPosition {
  const minX = reachableHeaderSize - panel.width;
  const maxX = Math.max(minX, viewport.width - reachableHeaderSize);
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

# Y-Layer Compact Controls Review — 2026-10-17

## Steps

1. Open Y-Layer at 320 × 640. Before the fix, the display-controls group measured 329 px inside a 306 px row, so the reference-opacity value ran into the right edge.
2. Review the same controls at 320 × 640 after the fix. The selector and opacity control stay on one row, the full percentage remains visible, and the drawing canvas retains its available height.
3. Check the 390 × 844 boundary. The selector and opacity control remain on one row without internal or document overflow.

## Finding and change

Below 380 px, the reference-opacity label now uses a smaller gap, a 3 rem minimum slider width, and a 1.8 rem output width. Larger narrow screens keep their existing spacing and sizes.

## Browser checks

- Chrome headless, Dark theme, isolated browser profile.
- At 320 px, the display-controls group measured 306 px wide with `scrollWidth` 306 px. The `50%` output fit inside the row.
- At 390 px, the group measured 376 px wide with `scrollWidth` 376 px; the output ended at x=383 within the 390 px viewport.
- Both captures show the Y-Layer canvas. No project data was changed.

## Captures

- [Before at 320 px](01-before-dark-320x640.png)
- [After at 320 px](02-after-dark-320x640.png)
- [After at 390 px](03-after-dark-390x844.png)

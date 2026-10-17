# Compact Translated Workspace Menu — 2026-10-18

This current-run review fixes the narrow menu wrap where Vietnamese left
“Trợ giúp” alone on a second row. At widths up to 380 px, the six existing menu
entries now form two rows of three. Their DOM and keyboard order stay unchanged;
the project context remains on its own row.

At 320 × 740, the browser check covered all four themes and both locales. Every
configuration placed the menu entries in two rows and kept the document width
at 320 px. The representative Raccoon Vietnamese capture shows the balanced
rows alongside the visible project context.

## Captures

- [Before: Help alone on a second row](before-320-raccoon-vi.png)
- [After: two balanced rows](after-320-raccoon-vi.png)

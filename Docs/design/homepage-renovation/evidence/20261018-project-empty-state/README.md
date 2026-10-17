# Project Screen Empty State Review — 2026-10-18

This current-run review removes project search and sorting when the local
project list is empty. The washer's Create action and the board's Structure JSON
import action remain available.

At 1672 × 941, the browser review confirmed the empty message and both creation
paths remain visible without the inactive search and sort controls. At 320 ×
740, the board stays within the viewport width; the document reports 305 px for
both scroll and client width because the vertical scrollbar uses 15 px.

The empty-state control check was repeated by clicking all four themes and both
locales. Search and sorting remained absent in each of the eight combinations,
and the empty message changed between English and Vietnamese. The populated
project list still owns the search and sort controls, covered by the
[Project Screen component spec](../../../../../Frontend/src/app/features/projects/project-screen/project-screen.component.spec.ts).

## Captures

- [Before: empty board with inactive search and sorting](../20261018-project-board-polish/after-empty-minecraft.png)
- [After: empty Minecraft board at 1672 × 941](after-empty-minecraft.png)
- [After: empty Minecraft board at 320 × 740](after-empty-minecraft-320.png)

# Workspace Browser Evidence

This index separates historical captures from current implementation evidence.
The dated archives predate commit ed7b1a5 and do not establish visual
acceptance for later changes.

## Dated archives

- [2026-10-16 comparisons, Block Usage, and large-project evidence](archive/20261016/README.md)
- [2026-10-17 theme, responsive, and workflow evidence](archive/20261017/README.md)

## Current acceptance

The current desktop sidebar composition has a focused before/after capture in
[the 2026-10-17 comparison](20261017-sidebar-composition/README.md). The Block
Browser list composition has its own [four-theme and narrow viewport evidence](20261017-block-browser-list/README.md).
The [Decorations picker review](20261017-decoration-picker/README.md) compares
the painting picker before and after removing its repeated selected preview,
and records selected feedback, a no-results search, and the narrow drawer.
The [Groups panel review](20261017-groups-panel/README.md) covers empty and
populated states, the Minecraft and Dark themes, and the narrow drawer.
The [Group Move panel review](20261017-group-move/README.md) covers empty and
populated states at desktop and narrow widths, including a completed one-block
move.
The [compact toolbar review](20261017-compact-toolbar/README.md) records the
two-row 390 px layout and checks that every toolbar action remains reachable at
320 px.
The [Selection inspector hierarchy comparison](20261017-selection-inspector-hierarchy/README.md)
checks its reading order in all four themes and in the narrow right drawer.
The [active BlockState and Help review](20261017-selection-state-help/README.md)
checks state editing in all four themes, the narrow Selection drawer, and the
Controls & Shortcuts dialog at desktop and narrow sizes.
The [viewport empty-state review](20261017-viewport-empty-starter/README.md)
covers the 3D and Y-Layer starter card in all four themes and at a narrow
viewport. The [Settings dialog responsive review](20261017-settings-responsive/README.md)
checks its mobile layout and scroll behavior. The [Workspace interaction review](20261017-workspace-interactions/README.md)
records JSON import/export, Structure NBT/Datapack export, Asset Manager, and
Diagnostics states, including two interaction fixes.
The [Quick Bar responsive review](20261017-quick-bar-responsive/README.md)
records access to all ten slots and selection of the last slot at a 390 px
viewport.
Full Workspace visual acceptance across surfaces, responsive states, and
workflows remains open in the
[Workspace acceptance status](../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md). The
Project Screen concept remains open in the
[Homepage/Project Screen notes](../../homepage-renovation/README.md).

## Retention policy

Keep approved design sources under ../references/ separate from browser
captures. Retain only meaningful visual comparisons and browser states that add
evidence beyond automated tests. Label historical measurements by date and do
not turn old follow-up notes into active work.

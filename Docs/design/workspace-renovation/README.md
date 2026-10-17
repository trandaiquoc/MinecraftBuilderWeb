# Workspace Renovation

## Current status

Workspace visual acceptance is still pending. Current browser captures show
the sidebar composition, Block Browser list, Groups panel, Selection inspector
hierarchy, and the viewport starter card in 3D and Y-Layer across all four
themes. The [Decorations picker review](evidence/20261017-decoration-picker/README.md)
checks the painting catalog, selected-state feedback, no-results message, and
narrow drawer. The [Groups panel review](evidence/20261017-groups-panel/README.md)
records the empty state, a selected two-block group in Dark and Minecraft, and
the narrow Dark drawer. The [Group Move panel review](evidence/20261017-group-move/README.md)
covers its empty and populated states at desktop and narrow widths, including a
saved move in the isolated browser project. The
[compact toolbar review](evidence/20261017-compact-toolbar/README.md) checks
the 390 px two-row layout and a 320 px viewport, keeping actions named while
reducing toolbar height. The
[Status Bar responsive review](evidence/20261017-statusbar-responsive/README.md)
checks its two-row hierarchy at 390 and 320 px, pairing editor context and save
state separately from project metrics and asset readiness. The
[Create with AI mobile review](evidence/20261017-ai-workspace-responsive/README.md)
checks the five-section prompt workspace and its Vietnamese labels at narrow
widths. The [starter-card review](evidence/20261017-viewport-empty-starter/README.md)
also checks both modes at a narrow viewport. Current browser review also covers the
Settings dialog at a narrow viewport, JSON import/export, Structure NBT and
Datapack export, Asset Manager, and Diagnostics. The
[Y-Layer compact controls review](evidence/20261017-y-layer-compact-controls/README.md)
checks that the reference-opacity value remains visible at 320 px without
reducing the controls to multiple rows.
The [Workspace interaction review](evidence/20261017-workspace-interactions/README.md)
records those responsive states and the fixes found in the import and Mod JAR
entry paths, plus the Tools-menu collision with the narrow project-name chip.
The [shared alert dialog motion review](evidence/20261017-alert-dialog-motion/README.md)
checks confirm/notice overlay entry and exit, all four theme surfaces, reduced
motion, and the narrow dialog layout.
The [Workspace dialog host transition review](evidence/20261017-dialog-host-motion/README.md)
checks that conditionally mounted Workspace dialogs fade out before their
component hosts are removed.
The [shared tab surface review](evidence/20261017-tab-surface-interaction/README.md)
checks that each selected tab owns its theme-aware surface across all four
themes, while the toolbar's segmented controls keep their separate track.
The [Workspace presentation audit](evidence/20261017-workspace-presentation-audit/README.md)
compares the current shell against the approved frames in all four themes and
checks the Settings menu at 320 px in English and Vietnamese. It fixed the
clipped End-key focus target and added the active project's saved Minecraft
version to the desktop header.
The [Selection Inspector action surface review](evidence/20261017-inspector-action-surfaces/README.md)
fixes the Dark theme Quick Actions card blending into its buttons and checks the
same surface in all four themes. Full Workspace acceptance remains open.
The [Workspace menu feedback review](evidence/20261017-menu-feedback/README.md)
checks persistent checked states, hover, and press feedback in all four themes.
The [Quick Bar review](evidence/20261017-quick-bar-responsive/README.md)
confirms all ten slots remain reachable at a narrow viewport. The
[active BlockState and Help review](evidence/20261017-selection-state-help/README.md)
checks state editing in all four themes, the narrow Selection drawer, and the
Controls & Shortcuts dialog. The sign text and keyboard/mouse shortcut tabs
support Arrow, Home, and End navigation. Full Workspace acceptance remains
open. A concrete
remaining checkpoint is the Mod JAR import preflight and progress/error states,
which need a real compatible fixture. Automated tests, keyboard checks, and
contrast checks do not establish that the full interface matches the approved
compositions.

The Project Screen now has current browser review for its four themed scenes,
project selection, creation, import, and narrow layout. Its full concept
acceptance remains tracked separately in the
[Homepage renovation notes](../homepage-renovation/README.md).

## Current contracts and acceptance

- [Canonical four-theme palette](../workspace-color-palette.md)
- [Design foundation and approved direction](../../design-foundation-branding.md)
- [Current acceptance gaps](WORKSPACE-UI-ACCEPTANCE-INVENTORY.md)
- [Homepage and Project Screen status](../homepage-renovation/README.md)

## Approved Workspace compositions

These four source frames are approved design references. They are separate from
browser screenshots and their canvas content is not application behavior.

| Theme     | Approved reference                                       |
| --------- | -------------------------------------------------------- |
| Minecraft | [Minecraft](references/approved-workspace-minecraft.png) |
| Raccoon   | [Raccoon](references/approved-workspace-raccoon.png)     |
| Light     | [Light](references/approved-workspace-light.png)         |
| Dark      | [Dark](references/approved-workspace-dark.png)           |

## Historical browser evidence

The [browser evidence index](evidence/README.md) links selected captures in two
dated archives. These captures document earlier browser states and do not
establish current visual acceptance.

The four Block Usage screenshots are retained as a record of the positively
reviewed panel. Block Usage is not an active redesign task.

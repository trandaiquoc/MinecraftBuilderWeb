# Homepage and Project Screen Renovation

**Status:** in progress. This page records the current implementation and its
remaining scope; it is not a full application acceptance report.

## Implemented Project Screen

- Four theme-specific laundromat scenes are selected through the existing
  `ThemeService`: Minecraft, Raccoon, Light, and Dark. The official logo stays
  unchanged. The scene stays at its illustrated aspect ratio on desktop, with
  the language/theme/settings controls and local status rendered as real DOM.
- Recent projects appear as real selectable entries on the wooden board. The
  washer shows the selected project's name, Minecraft version, structure mode,
  dimensions, and Open action, with a cached capture when one is available.
- On wide desktop, the unchanged official logo sits above the washer in the
  scene's open wall area. The board arranges real project summaries as cards;
  the layout reduces to one column when the board is narrow. Local search
  filters project name, Minecraft version, mode, and dimensions; sorting offers
  newest, oldest, and name order. Search and sorting appear once projects exist,
  keeping the empty board clear while preserving both controls for populated
  lists.
- Project creation reuses the existing size and version form in a focus-trapped
  dialog. Structure JSON import remains available directly from the board.
- The existing Project Screen workflow still owns create/open/delete, import,
  local persistence, and project navigation. Local guest status remains
  explicit; no account or cloud behavior was added.
- Theme controls and project rows use the shared 120 ms standard-easing token;
  reduced-motion preferences suppress these transitions.
- At narrow widths, the scene becomes a responsive visual header followed by
  the project details, board, and local status. Project controls remain within
  the document width.

## Art Assets

The four 1672 x 941 JPEG scene plates live under
`Frontend/public/assets/project-screen/`. They were generated with the built-in
image generation tool using the four approved references in this repository as
composition and style guidance. They contain no UI text, project cards, app
logo, or external stock assets. The Light, Raccoon, and Dark variants preserve
the same scene layout; Dark uses the approved moonlit castle setting.
The two raccoons are separate transparent image layers. Their idle animations
use different timing and motion, and stop when reduced motion is requested.
Dark uses cool-lit versions of the same characters so their lighting fits the
moonlit scene.

The project board reads lightweight summary records while full structure data
stays in separate project records. On an approved route leave from the 3D
workspace, the already-mounted viewport captures a 256 x 144 image and stores it
in a separate IndexedDB preview store. Home loads only the selected project's
preview for the washer and lazily loads visible project-card previews when the
project timestamp still matches. Saving the canonical project invalidates its
preview in the same transaction; previews do not enter project JSON, backups,
exports, or summary records. Empty projects, Y-Layer exits, stale captures, and
unavailable captures show no image. The project board remains metadata-only and
never opens or renders every full structure during list load.

## Browser Evidence

The [2026-10-17 laundromat scene review](evidence/20261017-laundromat-scene/README.md)
contains captures of the empty state, project selection, four themes, creation
dialog, and narrow Vietnamese layout. Browser interaction checks created two
projects in an isolated profile, selected and opened a saved project, and
confirmed deletion. That sample profile is not part of the repository. Those
captures predate the wide-screen logo placement, project-card layout, and local
search/sorting controls. The [selected project card review](evidence/20261017-project-selection/README.md)
captures the current populated board in all four themes and at a narrow width.
It also records a selected-state correction found in the current Dark theme.
The [populated 320 px Project Screen review](evidence/20261018-project-populated-narrow/README.md)
checks a selected project card in Raccoon Vietnamese, including its Open and
Delete actions and the empty-project preview surface.
The [project board polish review](evidence/20261018-project-board-polish/README.md)
compares the empty-state action and populated card layout before and after the
latest refinement, with a narrow-screen check.
The [empty board controls review](evidence/20261018-project-empty-state/README.md)
keeps search and sorting out of the zero-project state while preserving the
washer's Create action and the board's Structure JSON import action.
The [project creation focus review](evidence/20261017-project-create-focus/README.md)
checks the narrow dialog's initial focus target and confirms the page has no
horizontal overflow.

The [project version hierarchy review](evidence/20261017-project-create-version-hierarchy/README.md)
removes the repeated Minecraft version status from the create dialog and keeps
the incomplete-behavior caveat distinct for other versions.

The [Structure JSON project import focus review](evidence/20261017-project-import-focus/README.md)
checks that the narrow import preview opens with its heading focused before
the create and cancel actions.

Visual review covers the current empty and populated board compositions, the
selected card in four themes, the narrow selected state, and the actual selected
project preview. Search/sort, project creation, and opening a saved project
have also been exercised in the local browser profile.

The [independent mascot motion review](evidence/20261017-project-screen-mascots/README.md)
checks the two separate character layers across the four themes, at a narrow
viewport, and with reduced motion enabled.

The [project-card preview review](evidence/20261017-project-card-previews/README.md)
shows the real renderer capture on a project card, with the card actions visible.

The [real project preview review](evidence/20261017-project-preview/README.md)
checks the selected washer preview captured from the mounted 3D workspace, its
timestamp-matched IndexedDB record, and its desktop and narrow-screen display.

## Interaction Research

The [Lucian Labs UI catalog](https://lucianlabs.dev/uxui-prompt/) and its
[MIT-licensed source](https://github.com/Seokwoooo/lucian-uxui-prompt) were
reviewed. HTML/CSS/JavaScript patterns from sliding tabs, dropdown menus,
undo snackbars, and button feedback were inspected. The application uses its
existing Angular controls and tokens; demo code and assets were not copied.

## Approved Visual References

- [Minecraft](../references/01-minecraft.png)
- [Light](../references/02-light.png)
- [Raccoon](../references/03-raccoon.png)
- [Dark](../references/04-dark.png)

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
  dimensions, and Open action. It does not imply a project screenshot.
- On wide desktop, the unchanged official logo sits above the washer in the
  scene's open wall area. The board arranges real project summaries as cards;
  the layout reduces to one column when the board is narrow. Local search
  filters project name, Minecraft version, mode, and dimensions; sorting offers
  newest, oldest, and name order.
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

The four 1672 x 941 JPEG scenes live under
`Frontend/public/assets/project-screen/`. They were generated with the built-in
image generation tool using the four approved references in this repository as
composition and style guidance. They contain no UI text, project cards, app
logo, or external stock assets. The Light, Raccoon, and Dark variants preserve
the same scene layout; Dark uses the approved moonlit castle setting.

The project board reads lightweight summary records while full structure data
stays in separate project records. No cached project-capture source exists, and
generating thumbnails would need a preview pipeline that avoids opening and
rendering every full structure during list load. The board and washer therefore
show real project metadata and no fabricated preview. Revisit real thumbnails
when a suitable capture pipeline exists.

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

Visual review covers the current empty and populated board compositions, the
selected card in four themes, and the narrow selected state. Full Homepage
acceptance remains open while the project cards lack real structure previews;
the project summary store has no cached capture, and rendering every full
structure during board load would compromise initial performance. No preview is
fabricated. Search/sort, project creation, and opening a saved project have
also been exercised in the local browser profile.

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

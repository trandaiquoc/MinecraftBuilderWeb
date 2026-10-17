# Laundromat Scene and Project Board — 2026-10-17

## Scope

The Project Screen was reviewed in Chrome at 1600 x 1000 and 390 x 844. The
artwork, official logo, board entries, washer details, controls, and local
status were checked together. The theme pass covered Minecraft, Raccoon,
Light, and Dark. The narrow captures use Vietnamese to check longer translated
labels.

## Captures

- [Minecraft empty state, desktop](empty-state-minecraft-desktop-1600x1000.png)
- [Two real projects with selection, Minecraft desktop](two-projects-selected-minecraft-desktop-1600x1000.png)
- [Raccoon, desktop](project-board-raccoon-desktop-1600x1000.png)
- [Light, desktop](project-board-light-desktop-1600x1000.png)
- [Dark, desktop](project-board-dark-desktop-1600x1000.png)
- [Creation dialog, Minecraft desktop](create-project-dialog-minecraft-desktop-1600x1000.png)
- [Dark Vietnamese Project Screen, 390 px](project-screen-dark-vietnamese-mobile-390x844.png)
- [Dark Vietnamese creation dialog, 390 px](create-project-dialog-dark-vietnamese-mobile-390x844.png)

## Review

- The four scene assets keep the door, washer, project board, window, raccoons,
  and floor in a consistent arrangement. The Dark scene uses night lighting
  and a castle. The DOM controls sit above the illustration and remain
  interactive.
- The board contains actual recent project summaries. Selecting an entry
  updates the washer details; visible summaries include Minecraft version,
  structure mode, dimensions, and updated time.
- The creation form retains version selection and structure size policy in a
  trapped, scrollable dialog. Structure JSON import remains directly available
  from the board.
- At 390 px, the illustration sits above the project controls in normal flow.
  The document width stayed at 390 px; the project list and dialog stayed
  usable while the page scrolls.
- No project screenshot/thumbnail source is present in `ProjectSummary` or the
  current project screen workflow. No fabricated preview was shown.

## Browser interaction checks

Using a temporary Chrome profile, the browser created two projects, selected
the second project through the board list, opened a saved project, and deleted
a project after the existing confirmation dialog. The profile and test
projects are not committed.

Automated checks for this change passed: the focused Project Screen component
test, Angular production build, frontend encoding check, Prettier check, and
`git diff --check`. Browser checks confirmed the dynamic theme asset paths,
project metadata rendering, project create/select/open/delete flow, and no
horizontal overflow at 390 px.

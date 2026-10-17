# Homepage and Project Screen Renovation

**Status:** In progress. This document records the current implementation
contract; it is not a visual acceptance report.

## Current implementation

- The existing Project Screen route owns project creation, recent-project
  listing, open/delete, structure-size policy, Minecraft version selection,
  Structure JSON project import, and local persistence workflows.
- Top controls use the existing `I18nService` and `ThemeService` for English,
  Vietnamese, Minecraft, Raccoon, Light, and Dark selections. Settings opens
  the existing Settings dialog.
- The bottom status identifies the current session as local guest mode and
  states that account sign-in is unavailable. It does not show an invented
  identity, profile, plan, or cloud status.
- Project content scrolls independently between the top controls and the
  bottom local-status area, including at short viewport heights.

## Verification for the controls milestone

- The controls component test verifies English/Vietnamese selection, all-theme
  preference wiring, selected `aria-pressed` state, and the Settings event.
- Full frontend suite: 308 test files passed, 7 skipped; 1,918 tests passed,
  11 skipped. App, spec, and worker TypeScript checks passed.
- Production build, registry tool tests (2/2), encoding, Prettier, and
  `git diff --check` passed.
- Renderer benchmarks were not rerun because this milestone does not change
  renderer code. Live browser screenshots and viewport interaction checks are
  still outstanding; automated tests do not establish visual acceptance.

## Remaining design work

- Integrate the four approved laundromat concepts while keeping all controls
  as real DOM UI outside the artwork.
- Move the current project-management workflow into the concept's board layout
  without removing create/open/delete/import/recovery behavior.
- Investigate real project thumbnail capture, storage, and cleanup. Until that
  work is implemented, project cards must not display fabricated previews.
- Record live browser captures and test all four themes, both locales, keyboard
  focus, and the required viewport sizes. This milestone has automated
  component/build evidence but no new browser screenshots.

## Interaction research

The [Lucian Labs UI catalog](https://lucianlabs.dev/uxui-prompt/) and its
[MIT-licensed source](https://github.com/Seokwoooo/lucian-uxui-prompt) were
reviewed as requested. Source HTML, CSS, and JavaScript were inspected for the
[sliding tabs](https://raw.githubusercontent.com/Seokwoooo/lucian-uxui-prompt/main/src/elements/039-sliding-tabs-pill.html),
[dropdown menu](https://raw.githubusercontent.com/Seokwoooo/lucian-uxui-prompt/main/src/elements/037-dropdown-menu-stagger.html),
[undo snackbar](https://raw.githubusercontent.com/Seokwoooo/lucian-uxui-prompt/main/src/elements/071-snackbar-undo.html),
and [button feedback](https://raw.githubusercontent.com/Seokwoooo/lucian-uxui-prompt/main/src/elements/002-magnetic-letter-button.html).
This repository uses its own Angular controls, semantic theme tokens, visible
keyboard focus, and reduced-motion handling; no sample code or assets were
copied.

## Approved visual references

- [Minecraft](../references/01-minecraft.png)
- [Light](../references/02-light.png)
- [Raccoon](../references/03-raccoon.png)
- [Dark](../references/04-dark.png)

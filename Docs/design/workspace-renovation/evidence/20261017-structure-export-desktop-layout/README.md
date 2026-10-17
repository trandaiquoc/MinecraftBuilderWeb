# Structure Export Desktop Layout Review

The export dialog used the full width of a desktop modal but stacked the install
guidance beneath the entire form. At a 1582×804 viewport, the guidance began
below the visible dialog and the body needed 1204 px of scrolling.

The body now places the form and install guidance in two columns when the
viewport is wider than 860 px. The dialog header and footer keep their current
positions, and the body remains scrollable for the longer form. At 1582×804,
the columns measure 605 px and 418 px; the guidance starts alongside the output
format and ResourceLocation controls. Its body scroll height is 763 px, down
from 1204 px.

At 390×844 in Vietnamese and the Raccoon theme, the dialog returns to one
column, keeps the footer visible, and does not widen the document. The wide
layout was checked in Light, Dark, Minecraft, and Raccoon themes. The breakpoint
was checked at 861 px (two columns) and 860 px (one column). Vietnamese copy
remains visible in the narrow layout.

The before/after captures use Dark and English. The narrow capture uses
Raccoon and Vietnamese. All captures came from an isolated temporary project;
no export was downloaded and the user's open project was not modified.

## Captures

- [Before, Dark and English](before-dark-en.png)
- [After, Dark and English](after-dark-en.png)
- [Narrow, Raccoon and Vietnamese](mobile-raccoon-vi.png)

## Verification

- `npm run build`
- Angular component test for the Minecraft Structure export dialog
- `npm run check:encoding`
- Prettier check for the changed source and documentation
- `git diff --check`

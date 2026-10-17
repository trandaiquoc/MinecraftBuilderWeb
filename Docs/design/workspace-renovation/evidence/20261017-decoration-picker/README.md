# Decorations Painting Picker Review

This review records the painting picker before and after removing its repeated
selected-art preview and adding explicit search feedback.

## Findings and changes

Before the change, the selected painting appeared in the Painting type card, a
large selected preview, and its highlighted catalog tile. The preview consumed
much of the narrow sidebar while repeating the selected artwork. A search with
no matches left the catalog blank. The picker now keeps the selected type card
and highlighted catalog tile, uses that space for more catalog results, and
shows a localized no-results message. Search inputs in both picker modes have
an accessible name.

In the browser, searching for `aztec` returned Aztec and Aztec2. Choosing Aztec
updated the Painting type card and the active decoration status. Searching for
an unmatched phrase showed the empty state and no painting cards. At the 390 px
viewport, the open drawer remained within the viewport and both results stayed
reachable. The editor continued to show its existing two-block structure.

## Captures

- [Before: repeated selected painting preview](before-duplicate-preview.jpg)
- [After: no-results message at desktop](after-empty-search-desktop.jpg)
- [After: selected painting feedback at desktop](after-selected-desktop.jpg)
- [After: selected results in the 390 px drawer](after-narrow-drawer.jpg)

## Verification and limits

- Painting picker unit tests: 2 passed.
- Frontend production build passed.
- Frontend encoding check and `git diff --check` passed.
- Browser review used the Dark theme at desktop and a 390 by 844 narrow
  viewport. The picker was searched and a catalog item selected; a painting
  was not placed in the structure as part of this review.
- This is focused evidence for the picker, not full Workspace visual
  acceptance. Review of the other themes and remaining Workspace workflows is
  still open in the [acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

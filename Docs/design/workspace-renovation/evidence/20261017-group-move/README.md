# Group Move Panel Review

This review covers the Group Move panel's desktop and narrow layouts, including
empty and populated groups. The browser review used an isolated local profile
and a temporary one-block project.

## Captures

- [Before: desktop panel with horizontal overflow and compressed Y controls](before-desktop-dark.jpg)
- [After: populated group at desktop width](after-populated-desktop-dark.png)
- [After: populated group at 390 px](after-populated-narrow-dark.png)
- [After: empty group at 390 px](after-empty-narrow-dark.jpg)

## Findings and changes

- A panel position saved at desktop width could remain outside the viewport
  after resizing. The session now invalidates its computed position when it
  reclamps after a resize. At widths up to 560 px, the whole panel is clamped
  inside the viewport; desktop keeps the existing drag behavior.
- The close button tooltip no longer creates a horizontal scrollbar. The
  desktop panel measures 304 px wide with 302 px of client and scroll width.
  At 390 px, it measures 288 px wide and 271 px of client and scroll width;
  the document remains 390 px wide. The populated panel's action buttons stay
  visible, while vertical scrolling exposes the full panel when needed.
- X/Z nudges now sit in a labeled horizontal-plane group. Y nudges have their
  own labeled section and share equal-width buttons.
- An empty group has no movable targets. It now shows a neutral instruction,
  hides the offsets and axis controls, and leaves Save disabled instead of
  reporting a locked-block error.

In the populated browser workflow, adding a Chain to the group and nudging X+
changed its position from X=8 to X=9. Saving applied the move and the group
still contained one block.

## Verification and limits

- Group Move panel and session tests: 6 passed.
- Frontend production build passed.
- Frontend encoding check and `git diff --check` passed.
- Browser review covered the Dark theme at desktop and 390 by 844. Empty and
  populated states were checked; resizing from desktop to narrow verified the
  saved position reclamp and panel reachability.
- This is focused evidence for Group Move. Full Workspace visual acceptance
  remains open in the [acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

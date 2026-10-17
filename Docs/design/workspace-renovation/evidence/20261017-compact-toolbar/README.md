# Compact Workspace Toolbar Review

This review checks the Workspace's frequently used toolbar actions at narrow
widths. The old 390 px layout wrapped the mode and tool switches, history
actions, and camera actions across three rows.

## Captures

- [Before: 390 px toolbar](before-narrow-390x844-dark.png)
- [After: 390 px toolbar](after-narrow-390x844-dark.png)
- [After: 320 px toolbar](after-narrow-320x740-dark.png)

## Findings and changes

At widths up to 560 px, Undo and Redo keep their visible text labels and show
their configured shortcuts in the title hints. Fit structure, Focus selection,
and Camera become compact icon buttons with localized accessible names and
native title hints. The 3D / Y-Layer and Place / Select switches keep their
visible labels and the same controls as the desktop layout.

At 390 px the toolbar uses two rows instead of three, reducing its measured
height to about 90 px. At 320 px the segmented switches wrap to separate rows,
and all toolbar actions remain visible on one row; the document width remains
320 px.

## Verification and limits

- Editor Chrome component tests: 9 passed, including localized names and
  shortcut title coverage.
- Browser review used the Dark theme at 390 by 844 and 320 by 740.
- Frontend production build, encoding, formatting, and `git diff --check` are
  recorded with the implementation commit.
- This review covers responsive toolbar composition. Full Workspace visual
  acceptance remains open in the
  [acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

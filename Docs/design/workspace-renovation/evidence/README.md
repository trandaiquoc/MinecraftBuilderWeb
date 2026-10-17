# Workspace browser evidence archive

Use this folder for screenshots captured from the running Workspace in Chrome.
The approved Stitch frames are stored separately under
[`../references/`](../references/).

## Current run — 2026-10-17

- [Screenshots, test notes, and browser measurements](current-run-20261017/README.md)
- [Workspace UI acceptance inventory](../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md)

## Updating the archive

For a later audit, create a new `current-run-YYYYMMDD/` directory, keep that
run's PNG captures beside its README, and add a link to the new run above and
in the acceptance inventory. Keep earlier runs intact so before/after evidence
remains available. Link every retained PNG from its run README and remove only
temporary debug artifacts that are not evidence.

Capture filenames should identify the Workspace area, state, theme, locale,
viewport, and date. Each run README should say which browser state was used and
what was checked; browser captures are evidence of the application, not design
references or proof of untested behavior.

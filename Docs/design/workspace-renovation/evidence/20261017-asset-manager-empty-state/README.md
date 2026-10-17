# Asset Manager Mod Empty State

The Mods tab used to show only “No imported mods.” in the main pane. The empty
library now has a distinct resource icon and a short explanation of which local
Fabric resources appear after import. The existing Mod JAR Import action stays
the single import entry point.

## Captures

- [Before: text-only state, desktop](before-text-only-1582x804.png)
- [After: guided empty state, desktop](after-desktop-1582x804.png)
- [After: 390 × 520](after-narrow-390x520.png)
- [After: 320 × 740](after-narrow-320x740.png)

The before image restores the previous text-only empty-state markup in the live
browser DOM after the source change. This temporary presentation-only change
did not modify source files or project data.

## Verification and limits

- The desktop and narrow browser checks use the existing one-block project and
  Dark theme. The page width matches 390 px and 320 px viewports; at 390 × 520,
  the dialog scrolls internally to keep its activity panel reachable.
- English and Vietnamese translations are defined. No JAR was imported, and
  import progress and result states still need a real compatible Fabric JAR
  fixture.
- The project data was unchanged and the dialog was closed after review.
- Full Workspace visual acceptance remains open in the
  [acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

# Workspace UI Acceptance Status

**Status:** in progress. This page contains only current acceptance gaps; it is
not a list of completed implementation tasks.

## Open acceptance

| Area                      | Status                                                                                                                                                                                                                                                                   | Required evidence                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace visual fidelity | Pending. Current evidence covers four-theme shell reviews, bilingual narrow Settings navigation, the saved Minecraft version in the header, Dark Quick Actions contrast, Diagnostics audit placement, and the Create with AI dialog inset. Full acceptance remains open. | Audit remaining common Workspace surfaces and interaction states against the approved compositions; capture verified gaps and fixes. |
| Project Screen / Homepage | Current visual review covers four themed scenes and mascot layers, project selection and creation, import, the narrow layout, and reduced-motion behavior; full concept acceptance remains open.                                                                         | Continue its visual acceptance and track remaining work in the [Homepage renovation notes](../homepage-renovation/README.md).        |

## Fixture checkpoint

The Asset Manager's empty Mods state and the Mod JAR Import menu destination
have been reviewed. Import preflight, progress, completion, and failure states
need a real Fabric mod JAR compatible with Minecraft Java 1.21.1 that includes
standard `fabric.mod.json` metadata and static block resources. No such fixture
is checked into this repository. A supplied fixture can be imported through
the browser-local workflow; JAR code is never loaded or executed. The importer
contract is documented in [Minecraft asset support](../../minecraft-assets.md).

## Technical checkpoint

At ed7b1a5, the full frontend suite passed (313 files passed, 7 skipped;
1,953 tests passed, 11 skipped), app/spec/worker TypeScript checks, production
build, tool tests, encoding, and git diff --check. These results are
technical evidence only.

## Evidence rules

- The [browser evidence index](evidence/README.md) lists both historical archives
  and current evidence groups. Historical captures predate ed7b1a5 and cannot
  close the open visual acceptance items above.
- The four files in references/ are approved Workspace design sources.
- Keep Block Usage in its reviewed state; no redesign is requested here.
- Add new browser evidence only for a meaningful before/after change, a
  distinct theme or responsive state, or a browser behavior that tests cannot
  demonstrate. Do not recreate exhaustive theme/font/locale/viewport grids.

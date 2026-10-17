# Workspace UI Acceptance Status

**Status:** in progress. This page contains only current acceptance gaps; it is
not a list of completed implementation tasks.

## Open acceptance

| Area                      | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Required evidence                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace visual fidelity | Pending. Current evidence covers four-theme shell reviews, bilingual narrow Settings navigation, the saved Minecraft version in the header, Dark Quick Actions contrast, Diagnostics audit placement, Create with AI layout and mode context, Asset Manager's mod-library empty state and Missing Assets handoff, real renderer thumbnails in populated inventory slots, and the 320 px Status Bar label and Workspace menu fixes checked across four themes and both locales. Full acceptance remains open. | Audit remaining common Workspace surfaces and interaction states against the approved compositions; capture verified gaps and fixes. |
| Project Screen / Homepage | Current visual review covers four themed scenes and mascot layers, project selection and creation, import, the narrow layout, reduced-motion behavior, the zero-project board controls, and a populated 320 px Vietnamese card; full concept acceptance remains open.                                                                                                                                                                                                                                        | Continue its visual acceptance and track remaining work in the [Homepage renovation notes](../homepage-renovation/README.md).        |

## Populated viewport checkpoint

The existing viewport captures cover the empty starter state. Review a real
placed block and the surrounding controls at 320 px in the isolated audit
project. This browser review remains pending because the isolated Chrome launch
was rejected by execution policy on 2026-10-18.

## Fixture checkpoint

The Asset Manager's empty Mods state and the Mod JAR Import menu destination
have been reviewed. Import preflight, progress, completion, and failure states
need a real Fabric mod JAR compatible with Minecraft Java 1.21.1 that includes
standard `fabric.mod.json` metadata and static block resources. No such fixture
is checked into this repository. A supplied fixture can be imported through
the browser-local workflow; JAR code is never loaded or executed. The importer
contract is documented in [Minecraft asset support](../../minecraft-assets.md).
On 2026-10-18, the user confirmed no compatible fixture is available yet, so
import preflight and terminal-state visual acceptance remain open.

## Technical checkpoint

At 0a18e1e5, the full frontend suite passed (318 files passed, 7 skipped;
1,992 tests passed, 11 skipped), and the production build passed. The focused
Project Screen and sign-inspector specs, Prettier, frontend encoding check, and
`git diff --check` also passed during the current implementation checkpoint.
These results are technical evidence only.

After 211ac0cd, inventory-storage and decorated-pot count feedback received a
follow-up check: both inspector specs passed (9 tests total), and the production
build, Prettier, frontend encoding check, and `git diff --check` passed. These
inspector states were not browser-reviewed, so the result is technical evidence
only.

## Evidence rules

- The [browser evidence index](evidence/README.md) lists both historical archives
  and current evidence groups. Historical captures predate ed7b1a5 and cannot
  close the open visual acceptance items above.
- The four files in references/ are approved Workspace design sources.
- Keep Block Usage in its reviewed state; no redesign is requested here.
- Add new browser evidence only for a meaningful before/after change, a
  distinct theme or responsive state, or a browser behavior that tests cannot
  demonstrate. Do not recreate exhaustive theme/font/locale/viewport grids.

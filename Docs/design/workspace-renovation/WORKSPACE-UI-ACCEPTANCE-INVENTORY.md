# Workspace UI Acceptance Status

**Status:** in progress. This page contains only current acceptance gaps; it is
not a list of completed implementation tasks.

## Open acceptance

| Area                      | Status                                                                                                                                       | Required evidence                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Workspace visual fidelity | Pending. The approved four-theme compositions are references, not proof that the current UI matches them.                                    | Compare the current Workspace with all four approved frames and assess the full layout and component hierarchy.         |
| Viewport starter card     | Implemented and technically verified in commit ed7b1a5; visual acceptance is pending. The available browser captures predate this component. | Capture and review 3D and Y-Layer empty states across Minecraft, Raccoon, Light, and Dark, including a narrow viewport. |
| Project Screen / Homepage | Controls are implemented; its visual concept remains separate from Workspace acceptance.                                                     | Track its acceptance in the [Homepage renovation notes](../homepage-renovation/README.md).                              |

## Technical checkpoint

At ed7b1a5, the full frontend suite passed (313 files passed, 7 skipped;
1,953 tests passed, 11 skipped), app/spec/worker TypeScript checks, production
build, tool tests, encoding, and git diff --check. These results are
technical evidence only.

## Evidence rules

- The [browser evidence index](evidence/README.md) points to historical captures.
  They predate ed7b1a5 and cannot close the open visual acceptance items above.
- The four files in references/ are approved Workspace design sources.
- Keep Block Usage in its reviewed state; no redesign is requested here.
- Add new browser evidence only for a meaningful before/after change, a
  distinct theme or responsive state, or a browser behavior that tests cannot
  demonstrate. Do not recreate exhaustive theme/font/locale/viewport grids.

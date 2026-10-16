# Prompt for the home Codex

You are continuing the The Block Laundromat Workspace UI/UX renovation. Read `README.md` in this handoff first, then inspect the actual repository at the recorded HEAD. Treat Angular source and the user's latest feedback as authoritative; the reference archives guide visual treatment and feature coverage, not implementation code.

## User's latest concrete feedback

1. The Minecraft theme looks dated/ugly. It should feel like a polished modern web product while retaining recognizable Minecraft character. The dirt-brown layer is missing or too weak; the user explicitly asked where the brown went. Use the official Minecraft website as a visual reference for polished frames/buttons, alongside Lucian Labs interaction patterns. Do not globally flood the UI with green or make low-contrast white-on-green/brown controls.
2. Block Usage looks bad in every theme and needs a genuinely better composition, not just minor color edits. Current code and latest live screenshot are included; inspect that version before proposing another design.
3. The lower content of Structure JSON Import was difficult to reach. A scroll correction is committed, but verify the actual current dialog and all AI tabs before accepting it.
4. The latest Project Diagnostics accordion proposal was explicitly rejected and undone. Diagnostics is unchanged at current HEAD. Do not restore that implementation. Ask/derive a different design from the user's intent before touching it again.
5. The user said to commit completed work after each change. Make local commits, no push unless explicitly requested.

## Start here

- Confirm `git status`, current branch and HEAD. This handoff records a clean tree at `422d0e709eefc1c987d23fb139d86832566f53a3`.
- Read `project-guidance/ROOT-AGENTS.md`, `project-guidance/Frontend-AGENTS.md`, `project-guidance/workspace-color-palette.md`, `project-guidance/design-qa.md`, and `reference-captures/workspace-renovation/README.md`.
- Review all four approved Stitch screens and the 45-image feature archive. Compare current app screenshots with both design and functional references.
- Inspect current source files in the repo, not only the source snapshot. The snapshot is a convenient map, not a replacement for checking consumers and runtime behavior.
- Check the latest Block Usage screenshot, then run the app and capture all four themes with the same project, viewport and inspector state before changing the design.

## Acceptance approach

- Solve the visual problem at component/layout level with the existing semantic tokens and Angular/SCSS conventions. Avoid a separate UI implementation per theme, fake data, fake canvas, extra fonts, decorative noise, and broad palette rewrites without contrast checks.
- Keep the selected tab surface attached to the actual selected tab; never add a detached/misaligned green marker.
- Keep Fit Structure and Focus Selection in the main toolbar only; don't duplicate them inside the inspector.
- Block previews should remain visibly larger than the original tiny version while respecting catalog density and virtualization.
- Ensure Import JSON source and validation content are reachable while header/tabs/footer actions remain available. Test wheel, keyboard, scrollbar drag, short viewports, EN/VI, and all five Create with AI tabs in Chrome.
- If revisiting Diagnostics, do not make the entire modal a single lazy accordion. First understand the user's expected information hierarchy and propose a compact, scannable presentation that preserves meaningful access to metrics, issues, and asset audit.
- Run targeted tests and browser verification per change, review screenshots, then run appropriate full checks before claiming completion. The broad renovation remains open until the user-facing visual acceptance is met.

## Git handoff

`commits/repository-main.bundle` contains the recorded repository history. `commits/theme-foundation-to-current.log` and `patches/theme-foundation-to-current.patch` provide a readable change trail. Do not apply the cumulative patch on top of the same HEAD; it represents changes already present in the branch. The bundle is for history recovery/inspection when the home clone is missing these commits.

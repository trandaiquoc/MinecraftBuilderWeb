# The Block Laundromat Workspace UI/UX Handoff

Prepared 2026-10-16 for continuing the Workspace renovation in another Codex environment.

## Repository snapshot

- Repository: `TheBlockLaundromat`
- Branch: `main`
- HEAD: `422d0e709eefc1c987d23fb139d86832566f53a3` (`fix(workspace): clarify block usage rows`)
- `origin/main` in this checkout points to the same SHA. No push was performed as part of preparing this handoff.
- Working tree was clean after reverting the uncommitted Project Diagnostics accordion work at the user's request.
- The bundle in `commits/repository-main.bundle` contains the repository's `main` history. Fetch/inspect it from an existing clone if needed; do not replace a different working tree blindly.

## What is included

- `CONTINUE_PROMPT.md`: paste-ready instructions for the home Codex.
- `commits/theme-foundation-to-current.log`: commit list from the four-theme foundation through current HEAD.
- `commits/repository-main.bundle`: Git history and source objects for `main`.
- `patches/theme-foundation-to-current.patch`: cumulative tracked diff from `fc879c8^` through HEAD.
- `source-snapshot/`: current-HEAD copies of paths changed in that range, retaining repository-relative paths.
- `reference-archives/stitch_block_laundromat_workspace_design_system.zip`: four approved Stitch compositions and the supplied `DESIGN.md`.
- `reference-archives/TheBlockLaundromat_Stitch_45_References_Original_Logo_v3.zip`: original 45 feature/state references, palette notes, logo, and design notes.
- `reference-archives/The-Block-Laundromat-4-Themes.zip`: original four-theme reference images and logo.
- `reference-captures/workspace-renovation/`: approved images plus committed browser evidence and the renovation notes.
- `project-guidance/`: root/frontend agent rules, canonical V2 palette, docs index, design QA notes, and official source SVG logo.
- `evidence/block-usage-craft.png`: latest live Chrome capture of Block Usage at current HEAD.
- `source-manifest-all.txt`: paths included in the cumulative source snapshot and patch.

The original 45-reference ZIP was found in this machine's Trash and copied into this handoff; the source archive itself was not modified.

## Current implementation state

The most recent committed Workspace changes include:

- `6dc58dc` and follow-ups: approved four-theme workspace styling, shared shell/chrome refinements, settings reset scopes and dialog scroll work.
- `84db953` through `28b6057`: interaction, responsive, toolbar, selection, inspector, and dialog refinements.
- `405843b` and `422d0e7`: Block Usage redesign and row/metric layout clarification across themes.
- `a6cc4ac`: larger block browser previews.
- `29ab25c`: Structure JSON / Create with AI scroll fixes and regression coverage.

The detached green tab marker is not part of the current implementation: the active tab itself owns its selected surface. The Fit Structure and Focus Selection actions remain in the main toolbar and are not duplicated in the inspector.

The user specifically rejected the latest Project Diagnostics accordion attempt. That work was only in the working tree and has been reverted. Current HEAD does **not** contain a collapsed/lazy Diagnostics section; do not reapply the same solution without reviewing the user's intended layout first.

## Open user feedback / acceptance

- The user says the Minecraft theme's brown is missing and the overall theme still looks dated/poor. The canonical palette currently describes a dirt-brown toolbar alias (`#B9956B`) with dark text; this is a known visual disagreement, not permission to change colors without checking the current screen against the references.
- The user says Block Usage is unattractive across themes. It has just been redesigned and clarified, and a live Chrome capture is included; obtain/review acceptance rather than treating implementation as approved.
- The user previously reported the lower portion of Structure JSON Import being hard to reach. Commit `29ab25c` addresses dialog scrolling and pages long validation output; browser evidence and tests are described in the renovation notes. Recheck against the user's actual workflow before declaring closed.
- Project Diagnostics remains long and unchanged after the requested undo.
- The broad full Workspace renovation is not proven complete. The latest edits had focused targeted tests/browser checks, but a full suite/build and final four-theme visual acceptance were not rerun after the last refinements. Do not mark the broader goal complete on this package alone.

## Recent verification evidence

- Block Usage targeted spec: 1/1 passed at `422d0e7`; Prettier and `git diff --check` passed before commit.
- Real Chrome on the app at `422d0e7`: created a temporary project and placed three real blocks; Block Usage showed distinct Andesite/Dirt/Stone rows and thumbnails at 40x40 CSS pixels in a 220px inspector. Capture: `evidence/block-usage-craft.png`.
- Import dialog commit `29ab25c`: targeted tests and browser scroll checks were run for Import JSON and all five Create with AI tabs at desktop, `780x437`, and `640x520`; see `reference-captures/workspace-renovation/README.md` for the evidence ledger.
- The rejected Diagnostics accordion had temporary tests/browser screenshots, but both implementation and those screenshots are intentionally excluded from the handoff.
- Final repo checks after undo: clean working tree, `git diff --check` passed, HEAD equals `origin/main`.

## Important boundaries

- Preserve the real 3D viewport, renderer, project data, behavior, persistence, undo/redo, import/export, and existing Angular ownership. Do not substitute Stitch mockups for the live canvas.
- Keep one shared component/layout tree across Minecraft, Raccoon, Light, and Dark; keep EN/VI and the approved three-font system.
- Use the official SVG unchanged. The HTML files in the Stitch ZIP are references only, not production source.
- Commit completed user-requested changes locally as the user asked; do not push unless the user explicitly asks.

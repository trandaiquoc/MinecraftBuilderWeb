# MinecraftBuilder — Changes / Divergences from Current Requirements

> Purpose: track decisions and implementation behavior that have changed, clarified, or become more specific than the current requirements document, so the requirements can be revised later.
>
> Basis: current project discussions, manual UI testing, and Codex implementation reports up through Prompt 09.3 planning. This file is a change log, not a replacement for the requirements document.

## Legend

- `[x]` Already implemented or explicitly adopted.
- `[~]` Partially implemented / adopted but still needs polish.
- `[ ]` Decision exists, but the requirements document still needs to be updated.
- `PENDING` means the original requirement still stands and has simply not been implemented yet.

---

# 1. Y-Layer concept changed significantly

## Original direction

The earlier requirement described Y-Layer mainly as a fixed-Y X/Z editing grid with:

- Current Y
- top-down X/Z grid
- zoom/pan
- layer visibility / ghosting
- place/delete/select on Current Y

This could be interpreted as a separate 2D editor.

## Current decision

[x] Y-Layer is now a **Three.js 3D viewport**, not a separate 2D canvas.

[x] The user can still:

- orbit / rotate the camera
- pan
- zoom

[x] `Current Y` defines a horizontal **X/Z editing plane**.

[x] Placement in Y-Layer is calculated from ray intersection with the editing plane, not from a supporting block.

[x] A block may therefore be placed at `(x, CurrentY, z)` even when there is only air below it.

[x] Reference layers are rendered in the same 3D scene and can be translucent.

[x] Editing remains restricted to `Current Y` even when lower/other layers are visible.

### Requirement update needed

[ ] Replace any wording that presents Y-Layer as a separate 2D editor.

Recommended requirement wording:

> Y-Layer is a Three.js editing mode using the same structure and rendering foundation as 3D Edit. `Current Y` defines an X/Z editing plane. The camera may orbit, pan and zoom. Placement occurs on the Current-Y plane and does not require physical support beneath the target voxel.

---

# 2. Minecraft axis naming clarified

[x] Minecraft coordinate convention is now explicitly:

- `X` = horizontal axis
- `Y` = vertical / height
- `Z` = horizontal depth axis

[x] Y-Layer is an **X/Z plane at Current Y**.

[x] UI should not describe the second Y-Layer grid axis as Y.

### Requirement update needed

[ ] Add explicit axis terminology to avoid future X/Y vs X/Z confusion.

---

# 3. Grid size and project bounds became explicit UI requirements

The original requirements had project bounds, but the viewport behavior was not explicit enough.

## Current decision

[x] Grid and editing bounds must derive directly from `ProjectDocument.size`.

For a project:

```text
size.x = 20
size.y = 10
size.z = 30
```

Y-Layer at `Current Y = 5` means:

```text
X = 0..19
Y = 5
Z = 0..29
```

[x] Y-Layer grid size is exactly:

```text
size.x × size.z
```

[x] Valid build coordinates are:

```text
0 <= x < size.x
0 <= y < size.y
0 <= z < size.z
```

[x] Grid/bounds visualization must update if project size changes.

[x] Out-of-bounds ghost/placement is Invalid and cannot be placed.

[x] Arbitrary/infinite-looking grids should not imply that users can build outside project bounds.

### Requirement update needed

[ ] Add exact grid/bounds behavior to both 3D and Y-Layer requirements.

---

# 4. Explicit Place and Select tools were introduced

## Earlier interaction direction

Earlier controls primarily described:

- LMB = place / active tool
- Shift + LMB = delete
- Alt + LMB = eyedropper
- camera controls on RMB/MMB/wheel

Selection existed as a feature, but the exact LMB conflict between placing and selecting was not resolved.

## Current decision

[x] Editor now has explicit tool state:

- `Place`
- `Select`

[x] In Place tool:

- LMB = place
- Shift + LMB = delete
- Alt + LMB = eyedropper

[x] In Select tool:

- LMB on a structure block = select
- normal LMB does not place
- clicking empty space may clear selection

[x] Camera dragging must not trigger place/select/delete on pointer release.

### Requirement update needed

[ ] Document Place and Select as explicit editor tools.

---

# 5. Active Block and Selected Block are now separate concepts

This distinction was not clear enough in the original UI requirement.

## Active Block

[x] Active Block means the block currently held for placement.

It contains at least:

- registry ID
- current/default BlockState
- support level when available

It may come from:

- Block Browser
- Eyedropper / Pick Block

## Selected Block

[x] Selected Block means a block that already exists in the structure and is selected with the Select tool.

It is used for:

- Inspector
- focus camera
- later state editing / rotate / group / move operations

[x] Selecting a structure block must **not** automatically change Active Block.

[x] Eyedropper copies an existing block + BlockState into Active Block.

### Requirement update needed

[ ] Use the terms `Active Block` and `Selected Block` consistently throughout the requirements.

[ ] Avoid using “selected block” to describe the currently active Block Browser item.

---

# 6. Box Selection has effectively been deferred

## Original requirement

The MVP requirement included:

- Single Block selection
- Box Selection

## Current implementation direction

[x] Single-block selection exists / is being polished.

[~] Box Selection is intentionally excluded from the current interaction/UI cleanup passes.

### Important scope decision

[ ] Decide whether Box Selection is still mandatory for MVP.

Current implementation behavior implies one of these must be documented:

**Option A — keep original MVP scope**
- Single Block + Box Selection remain MVP.
- Box Selection is simply still pending.

**Option B — reduce MVP scope**
- MVP requires Single Block only.
- Box Selection moves to post-MVP / advanced editing.

This is one of the clearest current differences that must be reconciled in the requirements.

---

# 7. Camera behavior is more explicit than before

The original requirement already recommended:

- RMB drag rotate
- MMB drag pan
- wheel zoom
- focus
- fit structure
- quick camera views

The implementation/testing process has made these requirements more concrete.

## Current decision

[x] RMB drag = orbit / rotate.

[x] MMB drag = pan.

[x] Wheel = zoom.

[x] Browser context menu may be disabled inside the viewport where needed for RMB interaction.

[x] UI panel interaction must not leak into OrbitControls.

[x] Camera target must not move merely because a user clicked the Block Browser or another UI panel.

[x] One-click camera actions are implemented:

- Fit Structure
- Focus Selection
- Reset Camera

[~] Camera presets may include:

- Perspective
- Top
- Front
- Back
- Left
- Right

### Requirement update needed

[ ] Add explicit one-click camera toolbar actions.

[ ] Define initial/reset target as the project center or another deterministic center.

[ ] Define Focus Selection behavior using the selected voxel center.

---

# 8. Editor shell now behaves like a desktop editor

This was not explicit in the original requirements.

## Current decision

[x] Editor route should occupy the application viewport (`100dvh`-style behavior).

[x] The outer page should not scroll during normal editor operation.

[x] Wheel over viewport should zoom, not scroll the document.

[x] Block Browser and Inspector may scroll internally.

[x] Y-Layer controls must not create unused gaps that shrink the viewport unnecessarily.

[x] The center viewport should fill the remaining editor area.

### Requirement update needed

[ ] Add editor-layout and scroll ownership rules.

---

# 9. Ghost Preview requirements became stricter

Ghost preview existed in the original requirement, but implementation testing exposed missing behavior.

## Current decision

[x] Ghost must update on pointer movement.

[x] Ghost must be visibly distinct from placed blocks.

[x] Ghost must not mutate structure data.

[x] Ghost must not participate in raycast in a way that targets itself.

[x] Ghost hides when:

- pointer leaves viewport
- no target exists
- target is invalid, depending on final UX treatment

[x] In Y-Layer:

```text
ghost.y === CurrentY
```

[x] Ghost should retain Active Block identity/state/rotation metadata available at that stage.

### Requirement update needed

[ ] Expand Ghost Preview acceptance criteria.

---

# 10. Validation status now has visible UX requirements

The original requirement already defined:

- Valid
- Warning
- Invalid
- Unknown

But it did not fully specify how users see these states.

## Current decision

[x] Status must be visible through ghost treatment and/or status UI.

[x] `Invalid` blocks placement.

[x] `Warning` and `Unknown` must not silently fail.

[x] No fake Minecraft gameplay rule should be invented merely to demonstrate Warning/Unknown.

[x] If no natural fixture triggers Warning/Unknown yet, unit tests are acceptable until real rules exist.

### Requirement update needed

[ ] Add visible UX/acceptance criteria for all four validation statuses.

---

# 11. Reference opacity is now an explicit Y-Layer control

The requirement mentioned reference-layer opacity, but manual testing showed it needs stronger UI definition.

## Current decision

[x] Reference opacity should have:

- clear label
- visible slider
- current percentage/value where practical

[x] It should appear only where relevant to Y-Layer/reference layers.

[x] Changes should update reference rendering immediately.

### Requirement update needed

[ ] Clarify visible control requirements rather than only storing an opacity setting.

---

# 12. Block Browser currently uses a local fixture/catalog pipeline

## Original product goal

Block Browser must eventually support:

- vanilla Minecraft blocks
- modded blocks
- search by display name / ID / namespace / mod
- preview
- Full / Partial / Fallback status

## Current implementation

[x] Search and Active Block behavior exist.

[x] Current development catalog is still a representative local fixture, not a complete vanilla catalog.

[x] Search remains local with no server search.

[x] Normalized search fields are cached in memory.

[x] No search-engine dependency was added.

### This is NOT a requirement change

`PENDING` Full vanilla Minecraft 1.21.1 catalog is still required.

`PENDING` Real block preview/model/texture rendering is still required.

Do not rewrite the requirements to imply that the small fixture is the intended final Block Library.

---

# 13. Vanilla asset-source policy has been added

This was a major implementation/policy decision that should be reflected in technical requirements/documentation.

## Current decision

[x] Development assets are sourced from a local Minecraft Java 1.21.1 JAR.

[x] On the current development machine, a usable Modrinth-managed JAR was verified.

[x] Required paths were verified:

```text
assets/minecraft/blockstates/
assets/minecraft/models/block/
assets/minecraft/textures/block/
assets/minecraft/lang/en_us.json
```

[x] Repository should not commit the full vanilla Minecraft asset tree.

[x] Repository may contain:

- extractor/parser code
- documentation
- small representative fixtures
- normalized schemas/catalog test data

[x] Full extracted asset caches remain local / gitignored.

[x] Representative fixture set currently includes:

- stone
- stone_slab
- oak_stairs
- oak_fence
- cobblestone_wall
- glass_pane
- oak_sign
- oak_wall_sign
- oak_door
- oak_trapdoor
- torch
- wall_torch
- dandelion
- water

[x] Water and signs are explicitly treated as special/partial rendering cases until their special behavior is supported.

### Requirement/documentation update needed

[ ] Reference `Docs/minecraft-assets.md` from the main requirements.

[ ] Add the “local/reproducible asset source, do not bundle full vanilla assets” rule to technical requirements.

---

# 14. Three.js dependency and placeholder rendering are now concrete

[x] Three.js has been introduced for the editor viewport.

[x] Current rendering uses placeholder cube/fallback geometry.

[x] Placeholder rendering is temporary and does not replace the later Minecraft model pipeline.

[x] Renderer state remains separate from persistent project/domain data.

### This is mostly an implementation detail

No major product requirement rewrite is necessary, except that the technical stack can now list Three.js as actually installed rather than only planned.

---

# 15. Missing/fallback block preservation has been reinforced

The original requirement already required this behavior.

[x] Unknown/missing/modded unsupported blocks are not silently replaced with `minecraft:air`.

[x] Active Block, project data, eyedropper and renderer fallback must preserve:

- registry ID
- BlockState
- support/missing status

### No requirement change

This remains consistent with the original requirements and should stay unchanged.

---

# 16. Y-Layer visibility modes remain unchanged

The following original modes are still part of the design:

- Current only
- Current + Previous
- Current + Next
- Previous + Current + Next
- All below
- Whole structure

[x] `All below` is now explicitly understood as:

> Show all structure layers below Current Y as references, while editing remains restricted to Current Y.

### Requirement clarification

[ ] Add this exact semantic to avoid interpreting lower layers as editable.

---

# 17. Selection persistence across modes is now explicit

[x] Switching 3D Edit ↔ Y-Layer should preserve:

- ProjectDocument
- Active Block
- Selected Block
- Current Y
- current editor tool

[x] Mode switching should not unexpectedly reset the camera unless intentionally defined.

### Requirement update needed

[ ] Add state-preservation behavior to mode-switch acceptance criteria.

---

# 18. Inspector is becoming selection-driven

The original requirement included Block Inspector for position and BlockState.

## Current clarification

[x] Inspector has two explicit read-only states.

No selection:

```text
No block selected
```

Selected block:

- registry ID
- X/Y/Z
- BlockState
- support level where available

[~] Current 09.3 direction treats this inspector as read-only unless state editing is intentionally implemented in a later requirement.

### Potential requirement conflict

The original requirement may imply direct BlockState editing from Inspector.

[ ] Confirm whether BlockState editing is mandatory in MVP or can follow after read-only Inspector.

---

# 19. Toolbar now needs one-click actions

This goes beyond merely having mouse/keyboard controls.

## Current decision

[x] Toolbar exposes working non-drag actions:

- Place
- Select
- Fit Structure
- Focus Selection
- Reset Camera
- Perspective
- Top
- Front
- Back
- Left
- Right

[x] Only working actions should be shown; no large set of disabled placeholder buttons.

### Requirement update needed

[ ] Add toolbar action requirements.

---

# 20. Build/test sandbox limitation is NOT a product requirement change

Codex/Antigravity sandbox cannot reliably spawn child processes with piped stdio, producing `spawn EPERM`.

External Windows terminal verification has shown:

- build passes
- tests pass

This is a development-environment limitation only.

### Do not add this to product requirements

If desired, document it separately in developer setup/troubleshooting documentation.

---

# 21. Current test baseline has grown beyond the original scaffold

Current reported status after the interaction cleanup:

- TypeScript app check: PASS
- TypeScript spec check: PASS
- Angular build: PASS outside sandbox
- tests: PASS, currently reported as 9 files / 25 tests before Prompt 09.3

The exact test count will continue to change.

### Do not hard-code test counts into requirements

Requirements should specify required behavior and test categories, not a fixed test count.

---

# 22. Initial bundle warning exists but scope has not changed

Current Angular initial bundle is reported around 850 kB raw, above the configured 500 kB warning budget, primarily after Three.js integration.

[x] The budget has intentionally not been raised merely to silence the warning.

### No requirement change yet

Performance/code-splitting remains a later pass.

Do not revise performance requirements until actual profiling and code-splitting decisions are made.

---

# 23. Original requirements that are still pending, not changed

The following should **not** be removed merely because they are not implemented yet.

## Block rendering

`PENDING`

- full Minecraft BlockState/model resolver
- parent resolution
- texture resolution
- non-cube geometry
- slab
- stairs
- fence
- wall
- pane/bars
- signs
- doors/trapdoors
- torch
- plants
- neighbor-dependent visual behavior

## Mod support

`PENDING`

- Mod JAR import
- metadata/resource scanning
- modded block IDs
- Full/Partial/Fallback support
- preserve unknown behavior
- no Java bytecode execution

## Editing

`PENDING / scope decision required`

- Box Selection
- groups
- isolate group
- group show/hide/lock
- inspector BlockState editing
- rotate state behavior
- undo/redo
- import as one transaction

## JSON

`PENDING`

- paste/file import
- validate
- preview
- apply/cancel
- Replace
- Merge
- Import as New Group
- preserve unresolved block IDs

## Export

`PENDING`

- Java Structure NBT export
- palette/state preservation
- modded IDs
- block entities
- golden NBT verification in Minecraft 1.21.1

## Other MVP items

`PENDING`

- material usage summary if retained in MVP
- autosave/recovery UI polish
- larger-project performance profiling
- final accessibility audit
- final acceptance audit

---

# 24. Requirement changes that should be prioritized when revising the DOCX

When updating the requirements document later, prioritize these edits first:

- [ ] Rewrite Y-Layer as a 3D Three.js editing-plane mode, not a separate 2D grid editor.
- [ ] Explicitly define Y-Layer as X/Z at Current Y.
- [ ] Add placement-on-air behavior for Y-Layer.
- [ ] Define project-size-driven grid/bounds.
- [ ] Define explicit Place vs Select tools.
- [ ] Separate Active Block from Selected Block terminology.
- [ ] Decide whether Box Selection remains MVP.
- [ ] Add one-click camera toolbar actions.
- [ ] Add camera target/focus behavior.
- [ ] Add desktop-editor scrolling/layout rules.
- [ ] Expand Ghost Preview acceptance criteria.
- [ ] Expand Validation status UX requirements.
- [ ] Add visible Reference Opacity UX.
- [ ] Add asset-source/reproducibility policy or reference `Docs/minecraft-assets.md`.
- [ ] Clarify Inspector read-only vs BlockState-editing MVP scope.
- [ ] Add mode-switch state preservation rules.

---

# 25. Suggested terminology for the revised requirements

Use these terms consistently:

```text
3D Edit
Y-Layer
Current Y
X/Z Editing Plane
Active Block
Selected Block
Place Tool
Select Tool
Block Browser
Inspector
Ghost Preview
Placement Target
Project Bounds
Reference Layer
Support Level
Validation Status
```

Avoid ambiguous terms such as:

```text
selected block
```

unless it clearly means a block already selected from the structure.

For the block used for placement, always prefer:

```text
Active Block
```

---

# 26. Status

This file should be updated whenever:

- a prompt intentionally changes product behavior;
- manual testing causes a UX/control decision to change;
- an MVP feature is explicitly moved out of MVP;
- a technical constraint changes the product requirement;
- a new terminology decision affects several parts of the requirements.

Implementation details that do not change expected product behavior do not need to be recorded here.

---

# 27. Group membership and Active Group

[x] A placed block may belong to multiple groups. Schema v2 persists this as
`groupIds: string[]`; schema v1's optional `groupId` is migrated on open/export.

[x] `Active Group` is independent from both `Active Block` and structure
selection. It drives group controls, highlight, isolate, and numeric move preview.

[x] A block is hidden when any of its groups is hidden, and structure mutation is
blocked when any of its groups is locked.

[x] Group moves preserve all memberships and apply atomically after bounds and
external-collision validation. Preview, active-group selection, isolate, camera,
and hover remain editor state rather than persisted structure mutations.

---

# 28. Verified behavior-rule scope

[x] Neighbor and placement behavior is driven by explicit block catalog metadata,
not registry-name matching. Unknown/modded blocks retain canonical ID/state and
produce `Unknown` validation.

[x] The current representative rules cover fence, glass-pane/iron-bars,
stairs shape, wall-torch support, atomic door pairs, and atomic sunflower pairs.
Removing verified support preserves dependent blocks and reports them Invalid;
the editor does not silently destroy user data.

[~] Cobblestone wall `none`/`low` connections are supported. Exact vanilla
`tall` and post-visibility behavior remains Partial pending a trusted 1.21.1
behavior fixture/source implementation.

[ ] Bed head/foot placement remains deferred until facing-relative placement,
occupied-state policy, and representative 1.21.1 fixtures are verified.

---

# 29. Logical multi-block integrity and history controls

[x] Verified multi-block objects (Door and current double-height plant fixtures)
use logical-object selection closure. Selecting either half, or box-selecting one
half, includes every verified part.

[x] Group membership is normalized by union across all logical parts. Group
assignment, removal, highlight, isolate, lock validation, move, and delete cannot
split a verified logical object.

[x] Editor history is available through visible Undo/Redo toolbar controls and
keyboard shortcuts: `Ctrl+Z` / `Meta+Z` for Undo, and `Ctrl+Y`, `Ctrl+Shift+Z`, or
`Meta+Shift+Z` for Redo. Shortcuts do not intercept input, textarea, or
contenteditable text editing.
### Theme-aware viewport palette

The 3D Edit and Y-Layer viewports consume the shared `ThemeService` state through
`ThreeViewportEngine.applyTheme`. Light and dark palettes update the scene
background, grids, bounds, block materials, selection/group highlights, ghost,
and move-preview colors without replacing project, camera, or editor state.

# 30. Unsupported dependent-block editor policy

[x] Vanilla runtime removes unsupported Torch, Wall Torch, and Tall Plant where
applicable. MinecraftBuilder MVP intentionally preserves existing structure data
after its support is removed and marks the dependent block `Invalid`. New invalid
placements remain blocked. This is an editor data-preservation policy, not vanilla
runtime behavior.

[x] Verified logical multi-block objects now include Door, Tall Plant/Sunflower,
and Bed. Bed head/foot selection, groups, move, lock, delete, and history use the
same logical-object resolver as the existing two-block families.

# 31. Real vanilla JSON model renderer foundation

[x] The editor can import a local Minecraft Java 1.21.1 JAR/ZIP through the File
API, cache normalized assets in a separate versioned IndexedDB database, and
build a blockstate-derived vanilla catalog without committing Mojang assets.

[x] 3D Edit and Y-Layer resolve placed BlockState through the existing model
resolver and render model elements, multipart parts, parent/texture inheritance,
configured transforms, element rotations, explicit/default/reversed/rotated UV,
and nearest-filtered PNG textures. Missing or unsupported resources keep the
fallback cube and canonical project data.

[~] Tint indices are preserved as renderer metadata but currently use neutral
white instead of biome tint. Materials use a practical generic alpha/cutout path;
Minecraft render-layer parity for translucent blocks is not complete.

[~] Block Browser previews use cached resolved face textures rather than one
WebGL renderer per row. The viewport currently rebuilds block scene objects on a
project update; delta/instanced geometry optimization remains future work.

# 32. Vanilla real-model fallback diagnostics and refresh fix

[x] The active vanilla asset provider and visual provider now change together on
JAR import or IndexedDB restore. A provider change invalidates resolver, decoded
texture, thumbnail, ghost, and scene visual state; 3D Edit and Y-Layer rebuild
from the same active resource generation without resetting editor state.

[x] Renderer failures are no longer silently swallowed. Resolved model traces and
visual results distinguish `real`, `partial`, and `fallback`, with structured
missing-model, missing-texture, decode, geometry-build, and unknown-error reasons.
Catalog entries declared Full are downgraded when the active bundle cannot
resolve their representative default model/PNG.

[x] Regression fixtures mirror the verified 1.21.1 Stone variant array and Stone
Slab parent chain. Stone resolves to a textured full cube; bottom Stone Slab with
the extra `waterlogged=false` property resolves to textured half-height geometry.
Light/Dark palette changes preserve real texture maps, and asset-backed browser
thumbnails are invalidated and repopulated after the active bundle changes.

[x] Ghost validation outlines use resolved model bounds. A bottom Slab therefore
uses a half-height outline instead of a full-voxel wireframe that could be
mistaken for a fallback cube; unresolved visuals still use the voxel fallback.

# 33. Vanilla asset coverage audit and support classification

[x] Catalog definitions now expose Behavior Support independently from Visual
Support. The Block Browser shows both values instead of presenting one ambiguous
Full/Partial/Fallback badge. The old `support` value remains only as a temporary
compatibility input for existing placement code during this audit checkpoint.

[x] A viewport-independent, batched and cancellable audit scans all 1.21.1
blockstate-derived entries through the production resolver and geometry path.
Machine-readable JSON and a grouped Markdown summary include default-state
provenance, variants/multipart, model parents, texture availability/decode,
geometry bounds, thumbnails, representative failures, and separate behavior
issues. The audit records findings only; it does not patch individual blocks or
change placement behavior.

# 34. Vanilla behavior metadata enrichment

[x] Generated vanilla catalogs now merge asset/resource definitions with a
separate `VanillaBehaviorRegistry`. Minecraft 1.21.1 block tags are retained
from local JAR imports and classify verified Fence, Wall, Stairs, Door, Bed,
Tall Flower, and Small Flower families without registry-name substring rules.
Pane/Bars and Torch behavior remain explicit verified MVP metadata because the
JAR has no equivalent family tag used by this implementation.

[x] Visual support and behavior support remain independent. A real model may
still have Unknown behavior, while a fallback visual may retain verified
behavior. Legacy normalized caches without block tags keep the representative
MVP behavior metadata; importing the JAR again enriches all supported tagged
vanilla family members.

[x] Direct Wall Torch placement now derives attachment facing from the clicked
side. Representative simple flowers require verified solid floor support, so a
Dandelion on a Bed is rejected instead of treating every occupied voxel as
valid support. Chain remains Partial outside its verified vertical-axis case;
Lantern now has explicit verified standing/hanging behavior.

# 35. Lantern attachment and Block Browser name priority

[x] Lantern behavior now supports verified vertical Chain attachment. A Lantern
placed below a vertical `minecraft:chain` is stored as `hanging=true`; placement
on a solid top support stores `hanging=false`. Missing support remains Invalid,
and removing support preserves the block while reporting Invalid according to
the editor data-preservation policy.

[x] Block Browser rows and Active Block now prioritize the translated display
name, followed by the canonical registry ID. Visual and behavior support remain
compact accessible badges with tooltips, instead of occupying the primary name
column.

# 36. Authoritative vanilla registry and full coverage foundation

[x] The vanilla catalog now uses a normalized Minecraft Java 1.21.1 data-generator
`reports/blocks.json` as the authoritative source for registry IDs, property
definitions, and default BlockStates. All 1060 authoritative entries have a
known default; generation and runtime parsing reject malformed defaults instead
of guessing. The previous 1062 resource-derived count included Item Frame and
Glow Item Frame entity blockstate resources, which are not block registry entries.

[x] Runtime definitions compose the authoritative registry, `en_us` display
names, visual assets, and verified behavior metadata as independent inputs. The
full audit now reports 919 Real, 1 Partial, and 140 Fallback visuals; 135 entries
require a special renderer and 5 are intentionally invisible. The remaining
texture failure is Heavy Core; special/no-element visuals are no longer reported
as generic JSON-model success.

[x] A Lantern targeting a vertical Chain now snaps its candidate and ghost to
the voxel directly below the Chain. Normal validation still rejects occupied or
out-of-bounds targets, while a successful snapped placement stores
`hanging=true`; normal supported placement remains `hanging=false`.

[x] The normalized vanilla asset cache is schema version 2. Compatible v1
resource payloads migrate in place; unsupported/corrupt data falls back to the
authoritative registry-only catalog and requests reimport without requiring
DevTools cleanup.

# 37. F5 viewport bootstrap and asset-cache restore regression

[x] Direct `/editor` startup no longer depends on an in-memory project or vanilla
asset provider to create the Three.js scene. A 16 x 16 bootstrap grid and bounds
render immediately, a zero-sized initial layout receives a safe 1 x 1 backing
buffer, and `ResizeObserver` applies the real canvas size and projection as soon
as layout becomes available. The renderer remains demand-driven and every
initialization/state transition requests a render.

[x] The editor remembers only the active project ID in browser storage; project
structure data remains in IndexedDB. F5 restores that project, or the newest
persisted project when upgrading from a version without the pointer. Concurrent
restore calls share one operation.

[x] Asset cache v1 to v2 migration now preserves the compatible resource bundle
instead of deleting JSON, PNG, language, and block-tag data. Restore validates
core Stone resources before marking the provider Ready, activates one provider
generation for catalog/resolver/textures/thumbnails/viewports, and exposes clear
loading/no-assets/ready/import-required/cache-error states.

[x] Chrome CDP regression verification covered direct `/editor` without assets,
five repeated reloads, real Stone before/after F5, five cached-provider reloads,
in-place v1 to v2 migration with unchanged resource counts, and Y-Layer canvas
bootstrap. No browser exceptions were observed.

# 38. Current project autosave and F5 persistence

[x] Every `ProjectDocument` reference change observed while the editor is open is
fed into the existing persistence/autosave pipeline. History operations cover
place, delete, neighbor-derived changes, BlockState edits, rotation, groups,
multi-block objects, and group moves; direct persistent Y-layer settings use the
same workspace signal. The canonical project remains in IndexedDB, while
`localStorage` contains only the active project ID.

[x] Autosave is debounced and revision-aware. It writes a recovery snapshot,
then the complete canonical document atomically through `ProjectStore.save`, and
removes the recovery snapshot only after success. Saves are serialized: an edit
created while an older revision is in flight remains dirty and is written next.
A stale completion cannot mark a newer revision clean. Save failures retain both
dirty state and the recovery snapshot and are surfaced as `Save error`.

[x] Editor status now reports `Saving...`, `Saved`, or `Save error`. Editor
teardown performs a best-effort flush, but the primary reload guarantee comes
from the short autosave debounce rather than relying on asynchronous browser
unload behavior.

[x] Chrome CDP acceptance persisted Stone, Fence, an atomic Door pair, group
metadata/membership, a group move, and rapid edits across hard reload. A delete
followed by Undo was autosaved and survived the next reload. Switching from
Project A to Project B restored B after F5, while reopening A retained its own
edits. Undo/Redo stacks remain intentionally session-only; their resulting
`ProjectDocument` state is persistent.

# 39. Default vanilla assets and special visual foundation

[x] Asset bundles now use a reusable vanilla/mod-compatible source contract.
Startup tries a gitignored local default bundle, then IndexedDB, with JAR import
as the File API fallback. The Block Browser is an expandable responsive grid
showing thumbnail, display name, and source rather than technical badges.

[x] Static special visual adapters now cover beds, containers, signs/hanging
signs, banners, heads/skulls, and shulker boxes where generic models have no
elements. They are visual-only Partial coverage; unsupported families keep their
explicit audit diagnostics.

# 40. Chain attachment, perspective thumbnails, and quick palette

[x] Chain attachment candidates are now resolved by a pure placement helper:
vertical Chain extends above/below based on hit half, while Lantern and Soul
Lantern snap below with `hanging=true`. Normal bounds, occupancy, and rule
validation remain authoritative.

[x] Bed special visuals now request the verified per-color entity bed texture.
The browser lazily upgrades cached texture icons to perspective previews through
one shared offscreen renderer, with a safe texture fallback. A project-local
Quick Block Bar pins stateful active blocks outside project-history mutations.

# 41. Bed descriptor, transparent previews, and lighting refinement

[x] Bed visuals no longer map the entire entity atlas over a generic block. A
descriptor-driven vanilla Bed half creates distinct mattress, outward legs, and
headboard geometry from `part`/`facing`, using the verified entity Bed texture
resource when present. The descriptor registry is an extension point for future
normalized mod beds.

[x] Perspective previews retain transparent canvases, card/Quick Bar images do
not add a colored thumbnail square, and world/thumbnail lighting now adds a
neutral directional fill while preserving textured materials. Quick Bar slots
are 50px with a distinct active state.

# 42. Bed alignment, Wall Sign data, and WASD camera

[x] Bed rendering now uses a descriptor-driven head/foot model with separate
mattress, legs, headboard, facing rotation, and atlas regions for the verified
vanilla entity texture. Custom namespaces can register another descriptor.

[x] Verified vanilla wall signs use clicked-face facing and opposite support
validation. Sign block entity data is persisted as typed front/back four-line
data with color, glowing, waxed, and raw-data extension fields; text edits are
history operations and survive the existing autosave/F5 path.

[x] 3D and Y-Layer viewport engines support smooth camera-relative WASD motion
with Shift acceleration. Text inputs, textareas, selects, and contenteditable
elements are excluded, and camera movement never enters project history.

# 43. Bed/Wall Sign visual correction and Quick Bar thumbnail restore

[x] The Bed special visual uses the 1.21.1 renderer-layer body and leg
dimensions/atlas origins for each head and foot half. It no longer creates a
separate approximate headboard or repeats one large atlas crop over every Bed
box. The descriptor remains the extension point for future normalized mod Beds.

[x] Vanilla wall-sign blockstates resolve to a `builtin/entity` sign model with
no JSON elements, so the block-entity visual remains responsible for its board.
The board and text are now transformed together from the sign facing and pinned
to the support-side local voxel face; this avoids a world-direction-specific
offset and keeps the board flush with its support.

[x] Sign editing is a single four-line textarea in the normal Right Inspector.
Front/back data stays independent, advanced metadata is collapsed, and commits
remain history/autosave operations. The editor provides a width warning only;
it does not reject text using a guessed character-count limit.

[x] Quick Bar persistence contains logical ID/state/slot data only. Thumbnail
URLs are derived by the same provider as the Block Browser and keyed by asset
generation, registry ID, canonical BlockState, and renderer version. Restored
slots request their thumbnail again when an asset provider becomes ready.

# 44. Camera input and hanging-sign interaction contract

[x] The editor input contract is `Ctrl+LMB` Delete, `Alt+LMB` Pick, and normal
LMB Place/Select. Shift is no longer an editor Delete modifier.

[x] Camera movement uses physical keyboard codes: WASD is camera-relative on
the horizontal plane, Space is world +Y, and either Shift key is world -Y.
Shift is not a speed boost. Input state clears on window blur, hidden document,
focus entering editable UI, pointer cancellation/lost capture, and viewport
disposal so orbit plus movement cannot leave a stuck key state.

[x] Wall Hanging Signs have a separate static connector hierarchy from Wall
Signs while sharing one facing-root transform for board and text. The attachment
snap helper supports verified hanging-sign candidates below a vertical Chain or
another vanilla hanging sign; normal occupancy and bounds validation remain
authoritative.

# 45. Versioned Bed visuals and thumbnail reliability

[x] Special model rendering now consumes a renderer-independent ModelPart-style
descriptor. Providers declare game edition/version, namespace, visual family,
and priority. The verified Java 1.21.1 Bed provider is selected only for the
matching asset version; an unverified future version does not claim exact Bed
coverage. The provider uses the verified head/foot cuboids, pivots, rotations,
64x64 texture atlas origins, and world transform without an extra foot offset.

[x] The generic ModelPart cuboid UV routine derives six face regions from
`uv(u,v)`, dimensions, texture size, and optional mirror. Three.js only builds
descriptor geometry/material; it has no Bed/color/version knowledge.

[x] Modifier actions now have precedence over normal tools: `Ctrl+LMB` deletes
from both Place and Select modes, while `Alt+LMB` remains Pick. Existing editor
mutation paths retain logical-object, group-lock, history, and autosave rules.

[x] Block Browser and Quick Bar thumbnails request the same visual provider as
the viewport, using authoritative default state. The browser no longer limits
thumbnail requests to the first 160 results. Texture load failures are retryable
and invalid/non-finite visual bounds fall back instead of being cached as a
successful blank perspective image.

# 46. ModelPart transform and selection deletion

[x] Special ModelPart transforms now use explicit Java `rotationZYX(roll, yaw,
pitch)` parity rather than Three.js's implicit default Euler order. The Bed
1.21.1 fixture verifies every head/foot visual remains within its local voxel
across all horizontal facings, without a Bed-specific positioning offset.

[x] `Ctrl+A` / `Meta+A` selects all structure voxels through logical-object
closure. `Delete` and `Backspace` delete the current selection atomically;
locked members abort the entire mutation and native input editing remains
unaffected.

[x] Active Group controls distinguish `Delete Group` (metadata/unassignment)
from `Delete group blocks` (destructive structure deletion). The latter asks
for confirmation, keeps group metadata, expands logical-object closure, and is
one undoable, lock-checked transaction.

# 47. Java 1.21.1 Sign foundation

[x] The special visual registry now has a versioned Java 1.21.1 Sign provider.
It retains all four canonical registry forms as explicit placement contracts.
Normal signs use the verified board/stick
ModelPart dimensions and transform; hanging signs use verified board, plank,
normal-chain, and zero-depth vertical-chain parts with state-driven visibility.

[x] Verified sign support rules cover standing support below, wall-sign support
behind, hanging-sign support above, and wall-hanging perpendicular support,
including compatible wall-hanging neighbours. Unknown modded sign blocks are
not assigned these vanilla behaviors.

[x] Sign block entity data retains independent front/back four-line text, color,
glow, waxed state, optional filtered messages, and raw extension data. Text edits
remain a single undoable document mutation. The inspector has one active side
with an `Edit other side` action; exact Java font metrics remain a documented
future provider, with a conservative 90/60-pixel fallback warning today.

## 47.1 Strict Sign placement contract

[x] The four vanilla Sign registry blocks are now explicit editor placement
entries. The editor does not auto-convert a selected standing Sign into a Wall
Sign, or a selected Hanging Sign into a Wall Hanging Sign. Standing and Hanging
Signs use sixteen-step rotation; both wall variants use cardinal facing only.

[x] The editor world exposes a generic virtual solid floor directly below Y=0
for rules that require support below. It enables standing Sign placement at Y=0
without leaking to wall, hanging, or wall-hanging support checks.

[x] Sign text uses a local draft while the textarea has focus and commits one
history edit on blur or when switching side. The physical 3D face ray selects
front versus back text; editable controls remain excluded from global editor
and camera shortcuts.

# 48. Group move window UX

[x] Group movement is opened explicitly with `Show move` for the Active Group.
The floating window can be dragged by its header, keeps a reachable header when
clamped to the editor viewport, and does not enter project history.

[x] Closing or hiding the move window cancels its unsaved offset while keeping
the Active Group and memberships unchanged. Switching groups resets the preview
offset; the last panel position is stored as a lightweight editor preference.

# 49. Group search UI

[x] The Groups tab now filters the local group list immediately by group name
or locked/unlocked status. Clearing the query restores the full list without
changing Active Group, selection, memberships, or project data.

# 50. Item-centric vanilla palette

[x] The normal Blocks browser is built from a checked-in Minecraft 1.21.1
placeable-item manifest. Concrete standing/wall variants remain available in
the raw registry and project data, while the browser and Quick Bar store the
logical item identity and resolve the concrete block from placement context.

[x] Bed, door, and two-block tall-plant previews render their complete logical
object through the shared thumbnail renderer. Technical/runtime IDs are
excluded from the normal building palette and a reusable export eligibility
policy is provided. No NBT/structure exporter exists in this repository yet,
so the policy is not wired to an exporter.

# 51. Logical placement plans and Bed integrity

[x] Bed placement derives its facing from the Minecraft player-yaw mapping and
creates foot/head atomically. Bed facing edits and rotations move the head
around the foot anchor as one history transaction, with bounds, collision, and
lock checks before mutation.

[x] The shared placement-plan API now feeds validation, logical ghost previews,
and placement. Composite previews preserve final state and coordinates for
beds, doors, and tall plants without mutating project data.

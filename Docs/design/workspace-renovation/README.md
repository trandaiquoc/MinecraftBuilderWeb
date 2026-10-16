# Workspace Renovation Evidence

## Approved Workspace compositions

These are the four approved Stitch Workspace frames, kept separate from the browser evidence below. They are visual references only; their mock canvas content, metrics, and unsupported controls are not application behavior.

| Theme     | Approved source frame                                                           |
| --------- | ------------------------------------------------------------------------------- |
| Minecraft | [approved-workspace-minecraft.png](references/approved-workspace-minecraft.png) |
| Raccoon   | [approved-workspace-raccoon.png](references/approved-workspace-raccoon.png)     |
| Light     | [approved-workspace-light.png](references/approved-workspace-light.png)         |
| Dark      | [approved-workspace-dark.png](references/approved-workspace-dark.png)           |

The source frames are 1600 x 1280. The files in `evidence/` are real browser captures and must not be described as the Stitch artwork.

The earlier screenshots in `evidence/` were captured from the running Angular Workspace through Chrome CDP. They are actual Three.js output, not Stitch canvas artwork or mock data. A newer, same-state set is listed below.

| File                               | Theme               |
| ---------------------------------- | ------------------- |
| `evidence/workspace-minecraft.png` | Minecraft (`craft`) |
| `evidence/workspace-raccoon.png`   | Raccoon             |
| `evidence/workspace-light.png`     | Light               |
| `evidence/workspace-dark.png`      | Dark                |

The latest navigation pass has a separate 1600 x 1200 set; all four captures use identical viewport dimensions and application state. The approved source frames are 1600 x 1280. The captures use the same 16 x 16 x 16 Java 1.21.1 project, single placed Stone block, camera, Comfortaa/Normal font, 230/230 px sidebars, English locale, and selected Blocks tab. They are browser output, not design references.

| Theme     | Browser capture                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------- |
| Minecraft | [workspace-renovation-minecraft-20261016.png](evidence/workspace-renovation-minecraft-20261016.png) |
| Raccoon   | [workspace-renovation-raccoon-20261016.png](evidence/workspace-renovation-raccoon-20261016.png)     |
| Light     | [workspace-renovation-light-20261016.png](evidence/workspace-renovation-light-20261016.png)         |
| Dark      | [workspace-renovation-dark-20261016.png](evidence/workspace-renovation-dark-20261016.png)           |

The toolbar-switcher captures show the 3D Edit and Place choices selected in one shared track per control, at 1600 x 1200. Each pair has one sliding selected surface; the unselected option remains subdued in the same track. They use the same editor project, panel widths, English locale, and Comfortaa/Normal font.

| Theme     | Browser capture                                                                         |
| --------- | --------------------------------------------------------------------------------------- |
| Minecraft | [toolbar-switcher-craft-20261016.png](evidence/toolbar-switcher-craft-20261016.png)     |
| Raccoon   | [toolbar-switcher-raccoon-20261016.png](evidence/toolbar-switcher-raccoon-20261016.png) |
| Light     | [toolbar-switcher-light-20261016.png](evidence/toolbar-switcher-light-20261016.png)     |
| Dark      | [toolbar-switcher-dark-20261016.png](evidence/toolbar-switcher-dark-20261016.png)       |

The earlier segmented-control captures show the immediately preceding visual iteration and are retained as historical QA evidence.

| Theme     | Browser capture                                                                               |
| --------- | --------------------------------------------------------------------------------------------- |
| Minecraft | [workspace-segmented-craft-20261016.png](evidence/workspace-segmented-craft-20261016.png)     |
| Raccoon   | [workspace-segmented-raccoon-20261016.png](evidence/workspace-segmented-raccoon-20261016.png) |
| Light     | [workspace-segmented-light-20261016.png](evidence/workspace-segmented-light-20261016.png)     |
| Dark      | [workspace-segmented-dark-20261016.png](evidence/workspace-segmented-dark-20261016.png)       |

## Selection inspector states

These browser captures show the empty-project inspector and a real selected Stone block, not a static mock. Each four-theme set shares one project state, camera, viewport (1600 x 1200), English locale, Comfortaa/Normal font, and 230 px sidebars. The selected set contains one Stone at X 9, Y 0, Z 9 with the existing Focus Selection action enabled.

| Theme     | Empty selection                                                                               | Selected Stone                                                                                            |
| --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Minecraft | [selection-inspector-craft-20261016.png](evidence/selection-inspector-craft-20261016.png)     | [selection-inspector-stone-craft-20261016.png](evidence/selection-inspector-stone-craft-20261016.png)     |
| Raccoon   | [selection-inspector-raccoon-20261016.png](evidence/selection-inspector-raccoon-20261016.png) | [selection-inspector-stone-raccoon-20261016.png](evidence/selection-inspector-stone-raccoon-20261016.png) |
| Light     | [selection-inspector-light-20261016.png](evidence/selection-inspector-light-20261016.png)     | [selection-inspector-stone-light-20261016.png](evidence/selection-inspector-stone-light-20261016.png)     |
| Dark      | [selection-inspector-dark-20261016.png](evidence/selection-inspector-dark-20261016.png)       | [selection-inspector-stone-dark-20261016.png](evidence/selection-inspector-stone-dark-20261016.png)       |

The narrow-sidebar empty-state captures use the same new 16 x 16 x 16 project, empty structure, camera, 1600 x 900 browser viewport, Comfortaa/Normal typography, and 180/200 px sidebar widths. They verify the structure overview and narrow navigation treatment in every theme.

| File                                            | Theme               |
| ----------------------------------------------- | ------------------- |
| `evidence/workspace-empty-narrow-minecraft.png` | Minecraft (`craft`) |
| `evidence/workspace-empty-narrow-light.png`     | Light               |
| `evidence/workspace-empty-narrow-raccoon.png`   | Raccoon             |
| `evidence/workspace-empty-narrow-dark.png`      | Dark                |

## Stitch comparison

The implementation retains the approved docked-workbench hierarchy: application menu, editor toolbar, left content browser, central live viewport, right inspector, Quick Bar, and pinned status footer. Minecraft keeps the grass/dirt/parchment treatment; Raccoon uses cushioned charcoal surfaces; Light stays neutral monochrome; Dark uses near-black layered surfaces. The four themes share the same component structure and behavior.

This pass improves state and interaction fidelity, but is not a full composition match yet. The Stitch frame shows a one-column block list and a larger summary/quick-actions inspector; the current app keeps its existing virtualized two-column catalog and state-driven inspector. The mock also depicts grid/snap controls, version/telemetry counters, and a 108K-block sample structure that are not equivalent to existing live controls/data, so they were deliberately not fabricated. The screenshot set is a same-state theme comparison, not a pixel-controlled A/B against the mock content.

`evidence/workspace-before.png` is the browser capture before this interaction pass; `evidence/workspace-after-dark-comparable.png` is the post-pass empty-project capture. Both use a 1600 x 857 viewport and the restored 180/200 px sidebar widths. These are useful visual checkpoints, not a pixel-controlled A/B: the active placement and catalog scroll state differ. The four real test placements, temporary theme changes, and temporary layout widths were reverted after capture; the persisted theme, widths, and project block count were verified in the browser.

The Import Structure JSON dialog was also exercised in Chrome at 780 x 437 and 640 x 520 with a long 210-block validation result. At 780 px the validation preview owns its scroll; at 640 px the stacked import layout owns page scrolling and the source textarea retains its own scroll after it is brought into view. The fixed dialog footer remained within the viewport and Import Mode could be reached. Create with AI was checked at both sizes across Description, Available content, Content limits, AI guidance, and JSON example; wheel input advanced the active scroll owner to its end and the long Description draft remained intact across tab changes. The browser used an empty imported-mod catalog, so populated third-party mod content was not part of that smoke run.

Block selection was checked in Chrome with `Stone` selected while `Stone Brick Slab` was hovered, then repeated through Minecraft, Raccoon, Light, and Dark. In every theme the selected card kept `aria-pressed="true"` and its check marker; selected and hover surfaces had distinct computed backgrounds. A keyboard Tab produced a visible 2 px focus outline. The capture project contains one placed Stone block and retains the same camera and panel widths across the four images.

The responsive status footer was checked in the same live browser at 780 x 437 and 640 x 520. At 780 px it retains all status fields on a readable row; at 640 px it wraps the asset state onto a second row. Both sizes stayed within the viewport without horizontal overflow.

## Adapted interaction references

The catalog was searched by interaction category and its agent skill/source CLI was used to retrieve and inspect the actual MIT HTML/CSS/JavaScript, not just the preview or text prompt. Source reviewed: [039 Sliding Tabs](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/039-sliding-tabs-pill.html), [040 Expanding Side Rail](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/040-vertical-rail-expand.html), [008 Copy to Check](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/008-copy-to-check.html), [075 Upload Progress Panel](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/075-upload-toast-progress.html), [083 Indeterminate Progress Bar](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/083-indeterminate-bar.html), [101 Split Pane](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/101-split-pane.html), [072 Dismissible Inline Alert](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/072-inline-alert-dismiss.html), [038 Context Menu](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/038-context-menu-origin.html), and [141 Shortcut Recorder](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/141-shortcut-recorder.html). Their real transitions, easing, DOM events, keyboard behavior, state changes, reduced-motion behavior, and timers were inspected before deciding whether their interaction contract fits this app.

- 039 informs the shared `aria-selected`-driven `.ui-tab-strip` indicator and its spring easing. The left Blocks/Decorations/Groups tablist now uses the same visible icon+label treatment at its default width, preserves a compact icon rail only below the measured label-fit width, and has one roving keyboard tab stop. Content and tab state remain owned by the existing feature signals.
- 040 informs the restrained panel transition treatment; the existing sidebar visibility and persisted resize owners remain unchanged.
- 008 informs the Copy-to-Check feedback in External AI. The check appears only after the actual clipboard promise succeeds.
- 075 and 083 were reviewed, but their demo upload records, timing, and simulated progress were not adopted. Existing import/download progress remains sourced from real operation state.
- 101 was reviewed; the existing persisted sidebar resize session already owns split-pane pointer capture and keyboard resizing, so no duplicate splitter was added.
- 072 was reviewed; no synthetic dismiss/delay behavior was added to status or validation messages.
- 038 was reviewed but its cursor-positioned context menu was not added: Workspace menus are opened from existing triggers, and adding right-click/long-press semantics would create a new interaction contract.
- 141 was reviewed against the existing Settings capture flow. Its key recording, modifier handling and Escape cancellation are already owned by the shortcut session, so no second recorder was introduced.

Workspace action buttons keep their visible labels and use Lucide icons to reinforce the meaning of group creation, visibility, locking, selection membership, isolation, movement and deletion. Selection is not communicated by color alone: block, decoration, painting, group and toolbar choices expose their existing check marks and selected state; the check mark receives a short token-timed entry motion. Hover only changes the surface, keyboard focus keeps its visible outline, and disabled controls retain their actual disabled semantics. Reduced-motion preferences collapse the transition timing through the shared Workspace rule.

In the 2026-10-16 Chrome pass, the left tab indicator was observed moving through intermediate transforms during its 180 ms spring transition. ArrowRight changed the actual selected tab and focus target; focus showed the visible outline, while hovering an unselected tab used its separate hover surface. English and Vietnamese labels were measured in-browser and fit without horizontal clipping. The Settings popover's 150 ms enter animation and check feedback were observed as running CSS animations. At 780 x 437 and 640 x 520, the responsive drawer opened with all tab labels and no document horizontal overflow.

The 3D/Y-Layer and Place/Select pairs share one continuous track each, with a flush sliding selected surface instead of two raised button faces. The unselected option is visually subdued while keeping at least 4.5:1 text contrast against its track: 4.68:1 (Minecraft), 4.69:1 (Raccoon), 4.93:1 (Light), and 4.71:1 (Dark), measured from resolved Chrome colors. Browser clicks update exactly one `aria-checked` option per group; pointer dragging moves the selected surface between equal-width options. Reduced-motion preferences still disable the transition.

Raccoon Block Library rows use one uniform base surface. There is no `nth-child(odd)`/`nth-child(even)` card color rule; selected cards still use the same semantic selected fill, border and check indicator as the other themes, while Raccoon's rounded geometry and inset/raised surfaces provide its softer treatment.

Only interaction patterns were adapted; no Lucian Labs component source, CSS, script, sample content, dependency, or visual asset was copied. The reference repository declares an MIT license; these independently implemented patterns do not include copied source. See the [Lucian Labs UI catalog](https://lucianlabs.dev/uxui-prompt/) and [source repository/license](https://github.com/Seokwoooo/lucian-uxui-prompt).

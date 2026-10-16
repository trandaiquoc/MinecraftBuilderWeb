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

### Grass/dirt theme surface refresh

These live browser captures verify the Craft-only Minecraft treatment: a sparse, deterministic grass patch motif over the green header and a pixel-stepped grass edge over the dirt toolbar. All themes retain the same workspace layout and toolbar actions. The four theme captures were recorded in one live Chrome session from the same 16 x 16 x 16 Java 1.21.1 project, with one Stone at X 9, Y 0, Z 9. The camera, 1600 x 900 viewport, English locale, Comfortaa/Normal font, selected Blocks tab, and 230/230 px sidebar preferences stayed fixed; only the theme changed. The wide-sidebar capture uses the same project and camera at the same viewport with 320/300 px sidebars. The block is placed in the editor; the images do not imply terrain rendering or a grass-texture asset.

| Theme / layout           | Browser capture                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Minecraft                | [workspace-grass-dirt-craft-20261016.png](evidence/workspace-grass-dirt-craft-20261016.png)                             |
| Raccoon                  | [workspace-grass-dirt-raccoon-20261016.png](evidence/workspace-grass-dirt-raccoon-20261016.png)                         |
| Light                    | [workspace-grass-dirt-light-20261016.png](evidence/workspace-grass-dirt-light-20261016.png)                             |
| Dark                     | [workspace-grass-dirt-dark-20261016.png](evidence/workspace-grass-dirt-dark-20261016.png)                               |
| Minecraft, wide sidebars | [workspace-grass-dirt-wide-sidebars-craft-20261016.png](evidence/workspace-grass-dirt-wide-sidebars-craft-20261016.png) |

The keyboard resize smoke check focused the left separator at 320 px, sent `ArrowRight`, observed 336 px and the prevented default event, then restored 320 px. The persisted widths in the temporary browser profile were reset after captures.

### Minecraft grass edge refresh

The Craft header pattern now uses larger, spaced pixel clusters, and the grass-to-dirt edge has more varied notches and an 18 px visual height. The SVG remains decorative (`aria-hidden`, non-focusable, and pointer-transparent); its CSS is enabled only for Craft. No component state, toolbar action, project data, or renderer code changed. The before/after pair uses the same live 79-block, 16 x 16 x 16 project, camera, and 1600 x 900 viewport. Light, Raccoon, and Dark were captured from that same session and project. Chrome-resolved header text contrast is 7.00:1 and toolbar text contrast is 6.66:1.

| Theme / viewport                 | Browser capture                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Craft before refresh, 1600 x 900 | [workspace-grass-refresh-before-craft-20261016.png](evidence/workspace-grass-refresh-before-craft-20261016.png)   |
| Craft after refresh, 1600 x 900  | [workspace-grass-refresh-craft-20261016.png](evidence/workspace-grass-refresh-craft-20261016.png)                 |
| Light, 1600 x 900                | [workspace-grass-refresh-light-20261016.png](evidence/workspace-grass-refresh-light-20261016.png)                 |
| Raccoon, 1600 x 900              | [workspace-grass-refresh-raccoon-20261016.png](evidence/workspace-grass-refresh-raccoon-20261016.png)             |
| Dark, 1600 x 900                 | [workspace-grass-refresh-dark-20261016.png](evidence/workspace-grass-refresh-dark-20261016.png)                   |
| Craft, 640 x 520                 | [workspace-grass-refresh-craft-640x520-20261016.png](evidence/workspace-grass-refresh-craft-640x520-20261016.png) |
| Craft, 390 x 520                 | [workspace-grass-refresh-craft-390x520-20261016.png](evidence/workspace-grass-refresh-craft-390x520-20261016.png) |

The 390 px capture in this grass-refresh set predates the Quick Bar wrapping fix below. It records a clipped English empty-state hint while the document itself stayed within the viewport.

### Minecraft palette refresh and menu stacking

The Craft Workspace now uses a dark soil sidebar (`#36281D`), charcoal-stone panels (`#403D37`), and a layered raised surface (`#4D4941`). Grass green remains on navigation, selection, and primary actions; the existing dirt toolbar and block visuals are unchanged. Destructive button fills have dedicated semantic tokens so panel error text stays readable. The light, Raccoon, and Dark palette values remain unchanged. The palette contract and text/control contrast checks cover all 25 roles across all four themes.

The before/after Craft captures use the same live 79-block project, camera, 1600 × 900 viewport, and workspace state. The three other themes were captured from the same project and viewport. A second four-theme set keeps Block Usage selected; all four show the same 79 total blocks, 58 unique types, and 6 missing assets with the thumbnail rows, search, sort, and usage ratios intact.

| Evidence                                 | Browser capture                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Craft before palette refresh, 1600 × 900 | [workspace-palette-craft-before-20261016.png](evidence/workspace-palette-craft-before-20261016.png)               |
| Craft after palette refresh, 1600 × 900  | [workspace-palette-craft-after-20261016.png](evidence/workspace-palette-craft-after-20261016.png)                 |
| Raccoon, 1600 × 900                      | [workspace-palette-raccoon-20261016.png](evidence/workspace-palette-raccoon-20261016.png)                         |
| Light, 1600 × 900                        | [workspace-palette-light-20261016.png](evidence/workspace-palette-light-20261016.png)                             |
| Dark, 1600 × 900                         | [workspace-palette-dark-20261016.png](evidence/workspace-palette-dark-20261016.png)                               |
| Block Usage, Craft                       | [workspace-palette-block-usage-craft-20261016.png](evidence/workspace-palette-block-usage-craft-20261016.png)     |
| Block Usage, Raccoon                     | [workspace-palette-block-usage-raccoon-20261016.png](evidence/workspace-palette-block-usage-raccoon-20261016.png) |
| Block Usage, Light                       | [workspace-palette-block-usage-light-20261016.png](evidence/workspace-palette-block-usage-light-20261016.png)     |
| Block Usage, Dark                        | [workspace-palette-block-usage-dark-20261016.png](evidence/workspace-palette-block-usage-dark-20261016.png)       |

At 545 × 900, opening View reproduced a stacking defect: `.app-menu-row` established an isolated stacking context below the following toolbar row, so the toolbar painted over the menu's first option. Giving the menu row a higher stacking level keeps the popover fully visible. A browser hit test at the first option's center resolves to the `3D Edit` menu item after the fix.

| Evidence                                 | Browser capture                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| View menu before stacking fix, 545 × 900 | [workspace-menu-stacking-before-20261016.png](evidence/workspace-menu-stacking-before-20261016.png) |
| View menu after stacking fix, 545 × 900  | [workspace-menu-stacking-after-20261016.png](evidence/workspace-menu-stacking-after-20261016.png)   |

### Quick Bar empty-state hint at narrow widths

The empty-state hint previously kept `white-space: nowrap` inside a width-constrained slot row with hidden overflow. At 390 px, Chrome measured the hint at 374.3 px inside a 310.8 px slot row, which cut off the final words without creating document overflow. Normal text wrapping now keeps the full localized instruction visible. The duplicate `.slots`, `.slot`, `.collapse`, and `.slot-remove` style declarations were consolidated while preserving their effective dimensions, spacing, and overflow behavior. At 390 px, English and Vietnamese hints measure 310.8 x 37.3 px; at 320 px, the Vietnamese hint measures 240.8 x 37.3 px. In both cases hint `scrollWidth` equals `clientWidth`, and document `scrollWidth` equals the viewport width. At 1600 px, the English hint remains a single 374.3 x 18.7 px line. Browser clicks collapsed and restored the bar, leaving its state expanded afterward.

The four-theme English captures use the same live 79-block, 16 x 16 x 16 project at 390 x 520. The Vietnamese Craft and Dark captures use that same project at 390 x 520 and 320 x 520, respectively. The before capture is byte-identical to the previously recorded Craft mobile capture.

| Theme / locale / state             | Browser capture                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Before: Craft, English             | [workspace-grass-refresh-craft-390x520-20261016.png](evidence/workspace-grass-refresh-craft-390x520-20261016.png)       |
| After: Craft, English              | [quick-bar-empty-state-craft-en-390x520-20261016.png](evidence/quick-bar-empty-state-craft-en-390x520-20261016.png)     |
| After: Craft, Vietnamese           | [quick-bar-empty-state-craft-vi-390x520-20261016.png](evidence/quick-bar-empty-state-craft-vi-390x520-20261016.png)     |
| After: Light, English              | [quick-bar-empty-state-light-en-390x520-20261016.png](evidence/quick-bar-empty-state-light-en-390x520-20261016.png)     |
| After: Raccoon, English            | [quick-bar-empty-state-raccoon-en-390x520-20261016.png](evidence/quick-bar-empty-state-raccoon-en-390x520-20261016.png) |
| After: Dark, English               | [quick-bar-empty-state-dark-en-390x520-20261016.png](evidence/quick-bar-empty-state-dark-en-390x520-20261016.png)       |
| After: Dark, Vietnamese, 320 x 520 | [quick-bar-empty-state-dark-vi-320x520-20261016.png](evidence/quick-bar-empty-state-dark-vi-320x520-20261016.png)       |

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

Block Usage was captured in Chrome with the same 7-block, 5-type project at a 180 px left sidebar and 200 px inspector in all four themes: [Minecraft](evidence/block-usage-craft-20261016.png), [Raccoon](evidence/block-usage-raccoon-20261016.png), [Light](evidence/block-usage-light-20261016.png), and [Dark](evidence/block-usage-dark-20261016.png). Metric labels wrap instead of clipping in the narrow inspector. At 780 x 437, the real right drawer retained its metrics and search/sort controls, showed a 59 px virtual-list viewport backed by 320 px of scroll content, and wheel scrolling reached the final row. At 640 x 520, the list viewport measured 101 px. Both sizes had no horizontal overflow; the short-height layout keeps the list as the scroll owner. The horizontal overflow root cause was the hidden centered tooltip on the drawer's edge-aligned close button; the tooltip is now aligned inward rather than removed.

### Block Usage refresh

The captures below show the current Block Usage composition; the preceding 7-block set is retained as pre-refresh evidence. The refreshed inspector gives total blocks visual priority, keeps unique/missing counts grouped, and adds a proportional usage rail to each virtualized row alongside the block thumbnail, exact ID, source, count, and share. The rail is derived from the row count and project total; it is not an operation-progress indicator.

All four Chrome captures use the same Java 1.21.1, 16 x 16 x 16 project with 13 placed blocks / 10 block types, the same camera and 3D mode, 180 px left sidebar, 200 px inspector, English, Comfortaa/Normal, and Block Usage tab at 1440 x 900. Themes were applied through the live `ThemeService` and restored to Minecraft after capture: [Minecraft](evidence/block-usage-redesign-craft-20261016.png), [Raccoon](evidence/block-usage-redesign-raccoon-20261016.png), [Light](evidence/block-usage-redesign-light-20261016.png), and [Dark](evidence/block-usage-redesign-dark-20261016.png). This set verifies this panel's shared structure and theme treatment; it does not claim full EN/VI or font-matrix acceptance.

The hidden inspector's virtual viewport measured 0 before its first activation. After opening Block Usage, `ResizeObserver` caused CDK to remeasure it to 426 px at 1440 x 900 and render all 10 types. With 740 px of list content, real wheel input moved `scrollTop` to 314 and advanced the rendered range to rows 2-10. At 780 x 437, the open right drawer measured 360 px wide, KPI bounds did not overlap, and the list had a 59 px viewport over the same 740 px content; wheel input advanced to row 10. At 640 x 520, the list viewport was 102 px. Neither short viewport had horizontal overflow.

The responsive status footer was checked in the same live browser at 780 x 437 and 640 x 520. At 780 px it retains all status fields on a readable row; at 640 px it wraps the asset state onto a second row. Both sizes stayed within the viewport without horizontal overflow.

The detached selected-tab marker was removed from the shared `.ui-tab-strip`, not patched per theme. The Blocks/Decorations/Groups active tab now owns its selected surface, with no separate moving green bar or underline in Minecraft, Raccoon, Light, or Dark. The four Block Usage captures above show the same tab treatment in each theme.

Asset Manager was opened in the live browser with restored Java 1.21.1 vanilla assets and the same activity state at 1440 x 900. The four captures use the same content and viewport; metadata summaries use three columns and the JAR import action remains visible in each theme: [Minecraft](evidence/asset-manager-craft-20261016.png), [Raccoon](evidence/asset-manager-raccoon-20261016.png), [Light](evidence/asset-manager-light-20261016.png), and [Dark](evidence/asset-manager-dark-20261016.png). At 640 x 520 the dialog has one vertical scroll owner, reaches the end of its content, keeps the import action visible, and has no horizontal overflow. No mod JAR fixture was imported for these captures.

Settings Appearance was opened from the live Workspace project and captured at 1440 x 900 after selecting each application theme through the Settings controls and applying it. The same Reality background draft, restored asset catalog, ground/sky preview state, project, and layout were used in all four captures: [Minecraft](evidence/settings-background-minecraft-20261016.png), [Raccoon](evidence/settings-background-raccoon-20261016.png), [Light](evidence/settings-background-light-20261016.png), and [Dark](evidence/settings-background-dark-20261016.png). Runtime inspection confirmed all five top-level sections, exactly two Appearance tabs, seven ground presets, four sky presets, and the selected Plains grass/Overworld day state. The Interface tab retains the four theme options, three approved font options, and font-size control. At 640 x 520, real wheel input moved the Settings content from `scrollTop=0` to its end (`431/431`); the final sky preset became visible while the footer stayed inside the viewport at y=440..503: [short viewport](evidence/settings-reality-dark-640x520-20261016.png).

Structure JSON Export was checked in Chrome using the same empty 16 x 16 x 16 project at 1440 x 900, 780 x 437, 640 x 520, and 390 x 520: [1440 x 900](evidence/structure-json-export-dark-1440x900-20261016.png), [780 x 437](evidence/structure-json-export-dark-780x437-20261016.png), [640 x 520](evidence/structure-json-export-dark-640x520-20261016.png), and [390 x 520](evidence/structure-json-export-dark-390x520-20261016.png). At 640 x 520, the former 680 px breakpoint stacked metadata above the workspace and left the JSON editor only 29 px tall. Keeping the split layout through 461 px gives the editor 231 px at 640 x 520 and 170 px at 780 x 437; below 461 px, metadata and editor stack with separate scroll ownership. At 390 x 520 the editor is 72 px tall and independently scrollable, metadata can scroll, and the action footer remains visible. Short-height headers compact without hiding the logo, title, or description. These captures verify layout and access to the editor/actions, not non-empty export serialization.

## Adapted interaction references

The catalog was searched by interaction category and its agent skill/source CLI was used to retrieve and inspect the actual MIT HTML/CSS/JavaScript, not just the preview or text prompt. Source reviewed: [039 Sliding Tabs](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/039-sliding-tabs-pill.html), [040 Expanding Side Rail](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/040-vertical-rail-expand.html), [008 Copy to Check](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/008-copy-to-check.html), [075 Upload Progress Panel](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/075-upload-toast-progress.html), [083 Indeterminate Progress Bar](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/083-indeterminate-bar.html), [101 Split Pane](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/101-split-pane.html), [072 Dismissible Inline Alert](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/072-inline-alert-dismiss.html), [038 Context Menu](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/038-context-menu-origin.html), and [141 Shortcut Recorder](https://github.com/Seokwoooo/lucian-uxui-prompt/blob/main/src/elements/141-shortcut-recorder.html). Their real transitions, easing, DOM events, keyboard behavior, state changes, reduced-motion behavior, and timers were inspected before deciding whether their interaction contract fits this app.

- 039 was reviewed for its sliding-tab treatment, but the shared `.ui-tab-strip` does not use a detached moving indicator. The active tab itself carries the selected surface and text state; the left Blocks/Decorations/Groups tablist keeps its visible icon+label treatment at default width, compact icon rail below the measured label-fit width, and one roving keyboard tab stop. Content and tab state remain owned by the existing feature signals.
- 040 informs the restrained panel transition treatment; the existing sidebar visibility and persisted resize owners remain unchanged.
- 008 informs the Copy-to-Check feedback in External AI. The check appears only after the actual clipboard promise succeeds.
- 075 and 083 were reviewed, but their demo upload records, timing, and simulated progress were not adopted. Existing import/download progress remains sourced from real operation state.
- 101 was reviewed; the existing persisted sidebar resize session already owns split-pane pointer capture and keyboard resizing, so no duplicate splitter was added.
- 072 was reviewed; no synthetic dismiss/delay behavior was added to status or validation messages.
- 038 was reviewed but its cursor-positioned context menu was not added: Workspace menus are opened from existing triggers, and adding right-click/long-press semantics would create a new interaction contract.
- 141 was reviewed against the existing Settings capture flow. Its key recording, modifier handling and Escape cancellation are already owned by the shortcut session, so no second recorder was introduced.

A real Chrome keyboard pass on the five External AI tabs found and fixed a focus gap: arrow keys previously changed the active panel but left focus on the old tab, and all five tabs remained sequential Tab stops. The active tab is now the single tab stop; ArrowRight, End, and Home update selection and focus together. A browser click on Copy complete prompt with a non-empty description resolved the Clipboard API promise before showing the check and `Copied to clipboard` live status. At 640 × 520, real wheel input scrolled the External AI panel (`scrollTop=343`, `scrollHeight=604`, `clientHeight=260`) while the document stayed 640 px wide with no horizontal overflow.

| Evidence                                                    | Browser capture                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Copy success after clipboard write resolves, Craft, English | [external-ai-copy-success-craft-en-20261016.png](evidence/external-ai-copy-success-craft-en-20261016.png)     |
| Five-tab panel scroll, Craft, English, 640 × 520            | [external-ai-scroll-craft-en-640x520-20261016.png](evidence/external-ai-scroll-craft-en-640x520-20261016.png) |

Workspace action buttons keep their visible labels and use Lucide icons to reinforce the meaning of group creation, visibility, locking, selection membership, isolation, movement and deletion. Selection is not communicated by color alone: block, decoration, painting, group and toolbar choices expose their existing check marks and selected state; the check mark receives a short token-timed entry motion. Hover only changes the surface, keyboard focus keeps its visible outline, and disabled controls retain their actual disabled semantics. Reduced-motion preferences collapse the transition timing through the shared Workspace rule.

The 2026-10-16 Chrome pass documented the earlier left-tab sliding marker and its 180 ms spring transition; that marker was later removed after visual review because it appeared detached/misaligned across themes. Current browser verification confirms that the selected tab itself owns the selected surface in Minecraft, Raccoon, Light, and Dark, with no shared `::before` track or selected-tab underline rule. ArrowRight still changes the actual selected tab and focus target; focus retains its visible outline, while hovering an unselected tab uses its separate hover surface. Earlier English/Vietnamese label-fit and responsive drawer checks remain historical evidence for that captured revision.

The 3D/Y-Layer and Place/Select pairs share one continuous track each, with a flush sliding selected surface instead of two raised button faces. The unselected option is visually subdued while keeping at least 4.5:1 text contrast against its track: 4.68:1 (Minecraft), 4.69:1 (Raccoon), 4.93:1 (Light), and 4.71:1 (Dark), measured from resolved Chrome colors. Browser clicks update exactly one `aria-checked` option per group; pointer dragging moves the selected surface between equal-width options. Reduced-motion preferences still disable the transition.

Raccoon Block Library rows use one uniform base surface. There is no `nth-child(odd)`/`nth-child(even)` card color rule; selected cards still use the same semantic selected fill, border and check indicator as the other themes, while Raccoon's rounded geometry and inset/raised surfaces provide its softer treatment.

Only interaction patterns were adapted; no Lucian Labs component source, CSS, script, sample content, dependency, or visual asset was copied. The reference repository declares an MIT license; these independently implemented patterns do not include copied source. See the [Lucian Labs UI catalog](https://lucianlabs.dev/uxui-prompt/) and [source repository/license](https://github.com/Seokwoooo/lucian-uxui-prompt).

## Project diagnostics presentation contract

Diagnostics group repeated block findings by stable semantic identity: issue code, category, severity, and canonical block ID. Each group retains its affected block-instance count. Errors appear before warnings and informational items. Missing content and unresolved IDs remain separate errors. Partial and fallback visuals remain separate warnings; partial behavior is a warning, while unknown behavior is informational. Localized wording never participates in grouping.

Behavior coverage describes what the editor can simulate. It does not determine whether a placed block is valid. For example, `minecraft:trapped_chest` remains behavior-unknown until a verified reusable behavior profile is available; its known block ID and visual support do not prove inventory or neighbor behavior coverage. The diagnostic copy explicitly separates simulation coverage from placement validity.

The semantic report is collected when the project, catalog, or asset-ready state changes. Repeated IDs reuse one catalog lookup during collection. Localization is a separate projection over collected issue codes, so changing EN/VI text does not rescan project blocks or look up definitions again. Search, category/severity filters, and list paging operate on the collected groups. Content errors and asset warnings stay in the primary issue list. Visual and behavior compatibility findings are grouped in a separate disclosure that starts closed and opens when search or filters target compatibility findings. Each issue list keeps its own scroll area and initially renders at most 40 groups; the existing Show more control adds another page without rescanning blocks. The summary shows total groups, affected block instances, and error/warning/info group counts. Search, renderer performance metrics, and Asset Audit stay outside the compatibility disclosure and remain accessible in the dialog.

Browser evidence uses a deterministic 79-block synthetic project: 22 fence instances across 11 partial-behavior IDs, 6 trapped chests, 6 missing-content instances, and 45 unresolved IDs. It produces 58 semantic issue groups and 79 affected-block findings. The English Craft and Dark captures show missing/unresolved errors first, filters and paging directly below the summary, and renderer metrics after the issue area. The Vietnamese capture selects the Behavior category and shows 12 groups / 28 affected instances; the 640 x 520 capture verifies that this explanation and the renderer heading remain reachable in a short viewport. Current disclosure evidence shows the primary error list and closed compatibility summary together in English Craft, plus the trapped chest behavior-unknown explanation expanded in Vietnamese Craft at 640 x 520. The unknown behavior remains informational and does not claim the placed block is invalid.

| Evidence                                                     | Browser capture                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| English, Craft, 1440 x 900                                   | [diagnostics-grouped-craft-en-20261016.png](evidence/diagnostics-grouped-craft-en-20261016.png)                                               |
| Vietnamese, Craft, 1440 x 900                                | [diagnostics-grouped-craft-vi-20261016.png](evidence/diagnostics-grouped-craft-vi-20261016.png)                                               |
| Vietnamese, Craft, 640 x 520                                 | [diagnostics-grouped-craft-vi-640x520-20261016.png](evidence/diagnostics-grouped-craft-vi-640x520-20261016.png)                               |
| Trapped chest query, Vietnamese, Craft                       | [diagnostics-trapped-chest-craft-vi-20261016.png](evidence/diagnostics-trapped-chest-craft-vi-20261016.png)                                   |
| Compatibility details closed, English, Craft                 | [diagnostics-compatibility-collapsed-craft-en-20261016.png](evidence/diagnostics-compatibility-collapsed-craft-en-20261016.png)               |
| Trapped chest details expanded, Vietnamese, Craft, 640 x 520 | [diagnostics-trapped-chest-expanded-craft-vi-640x520-20261016.png](evidence/diagnostics-trapped-chest-expanded-craft-vi-640x520-20261016.png) |
| English, Dark, 1440 x 900                                    | [diagnostics-grouped-dark-en-20261016.png](evidence/diagnostics-grouped-dark-en-20261016.png)                                                 |

In the 110,000-block analysis benchmark, collecting once and applying three UI filters took a median 34.31 ms versus a median 102.60 ms for repeating collection per query; each value is the median of five samples (2.99x faster). Browser query, category/severity filters, paging, inner-list scrolling, and dialog scrolling did not invoke another project scan or catalog lookup. That benchmark covers diagnostics analysis and repeated UI queries; it does not import a 110,000-block project in the browser.

## Large-project browser render

A separate real-browser pass activated a synthetic 48 × 48 × 48 stone project (110,592 blocks, Minecraft Java 1.21.1) in the existing Angular workspace. It used Chrome 155 headless with WebGL2 through SwiftShader software rendering, DPR 1, and a 1122 × 645 renderer backing surface. The browser runtime reported 110,592 rendered and resident blocks, 26 terrain chunks, 28 completed terrain worker jobs, and zero worker failures. After hydration, a 12-second viewport trace recorded 0.75 ms p50/p95 render CPU time, 6.9/7.0 ms p50/p95 frame intervals, no long tasks, and one frame over 100 ms (166.6 ms maximum).

The same session switched from 3D to Y-Layer and back. Both modes retained the 110,592-block project; the 3D viewport returned active with all blocks resident. A real right-button orbit drag over 24 input steps produced 25 scene renders from 26 requests, rotated the camera 7.86 degrees, and measured 0.54 ms p95 render CPU and 7.0 ms p95 frame interval, with no long tasks or frames over 16.7 ms in that interaction trace. The render-only project was activated in an isolated browser profile without saving it. These render results describe Chrome 155 headless with SwiftShader software WebGL and do not verify hardware-GPU performance.

A separate browser import pass used a 5,018,243-byte Structure JSON containing 110,592 `minecraft:stone` blocks. Worker parsing and validation completed with 110,592 total blocks, 4,096 within the original 16³ project bounds, and 106,496 out of bounds. Choosing “Resize & import” resized the project to 48³ and applied all 110,592 blocks. Autosave reported `Saved`; after a full page reload in the isolated profile, the same project ID restored at 48³ with all blocks present. This verifies the vanilla Structure JSON browser import and persistence path in Chrome 155 headless with SwiftShader; it does not verify a mod JAR or hardware-GPU performance.

| Evidence                                     | Browser capture                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 110,592 blocks rendered in Craft, 1600 × 900 | [workspace-110k-browser-render-20261016.png](evidence/workspace-110k-browser-render-20261016.png)             |
| 110,592 blocks imported in Craft, 1600 × 900 | [structure-json-import-110k-craft-en-20261016.png](evidence/structure-json-import-110k-craft-en-20261016.png) |

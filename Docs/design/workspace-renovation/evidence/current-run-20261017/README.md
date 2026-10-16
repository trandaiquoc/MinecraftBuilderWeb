# Workspace browser evidence — 2026-10-17

These PNG files are captures of the running Angular application in an isolated
Chrome profile. They are separate from the approved Stitch reference images.
The test project was a temporary, local 16×16×16 Java 1.21.1 project with zero
placed blocks unless a row says otherwise. No user project data was opened or
changed.

## Four theme shell comparison

All captures use English, Comfortaa/Normal, the same empty project, 1600×900,
and saved 260/230 px sidebars. Only the UI theme changes.

| Theme     | Capture                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Minecraft | [workspace-final-craft-en-1600x900-20261017.png](workspace-final-craft-en-1600x900-20261017.png)     |
| Raccoon   | [workspace-final-raccoon-en-1600x900-20261017.png](workspace-final-raccoon-en-1600x900-20261017.png) |
| Light     | [workspace-final-light-en-1600x900-20261017.png](workspace-final-light-en-1600x900-20261017.png)     |
| Dark      | [workspace-final-dark-en-1600x900-20261017.png](workspace-final-dark-en-1600x900-20261017.png)       |

## Mobile application menus

The File menu aligns inside the viewport at 390 px in English and Vietnamese.
At 320 px, Vietnamese menu labels wrap as needed; the long Minecraft NBT export
label uses two lines instead of creating horizontal scroll. All six application
menus were opened in Vietnamese at 320 x 520. Their items remained reachable by
scrolling inside the popover, and the page stayed 320 px wide. The File menu was
also checked at 320 px in all four themes and both locales: it stayed inside the
viewport and every menu item remained hit-testable. Escape and outside clicks
dismiss menus; Escape restores focus to the trigger.

| State / locale / viewport                           | Capture                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Before horizontal alignment fix, English, 390 x 520 | [workspace-menu-file-overflow-before-dark-en-390x520-20261017.png](workspace-menu-file-overflow-before-dark-en-390x520-20261017.png) |
| After alignment fix, English, 390 x 520             | [workspace-menu-file-mobile-dark-en-390x520-20261017.png](workspace-menu-file-mobile-dark-en-390x520-20261017.png)                   |
| After alignment fix, Vietnamese, 390 x 520          | [workspace-menu-file-mobile-dark-vi-390x520-20261017.png](workspace-menu-file-mobile-dark-vi-390x520-20261017.png)                   |
| After narrow-label wrapping, English, 320 x 520     | [workspace-menu-file-mobile-dark-en-320x520-20261017.png](workspace-menu-file-mobile-dark-en-320x520-20261017.png)                   |
| Before narrow-label wrapping, Vietnamese, 320 x 520 | [workspace-menu-file-overflow-before-dark-vi-320x520-20261017.png](workspace-menu-file-overflow-before-dark-vi-320x520-20261017.png) |
| After narrow-label wrapping, Vietnamese, 320 x 520  | [workspace-menu-file-mobile-wrap-dark-vi-320x520-20261017.png](workspace-menu-file-mobile-wrap-dark-vi-320x520-20261017.png)         |

The 320 px menus with taller content use their own vertical scrolling; after
scrolling each item into view, every item received pointer hit-testing inside
the menu bounds. The View and Settings menus therefore remain usable without
extending the document viewport.

## Settings

The Settings window was opened from the real Workspace. General is the initial
section and focus target. The dialog's Close button is neutral and is not
automatically focused. Desktop captures are 1600×900; narrow captures are
640×520 and 390×520. The Appearance background capture shows the separate
Workspace Background tab.

| Section / viewport                                    | Capture                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General, 1600×900                                     | [workspace-settings-final-general-dark-en-1600x900-20261017.png](workspace-settings-final-general-dark-en-1600x900-20261017.png)                             |
| Appearance, 1600×900                                  | [workspace-settings-final-appearance-dark-en-1600x900-20261017.png](workspace-settings-final-appearance-dark-en-1600x900-20261017.png)                       |
| Workspace Background, 1600×900                        | [workspace-settings-final-appearance-background-dark-en-1600x900-20261017.png](workspace-settings-final-appearance-background-dark-en-1600x900-20261017.png) |
| Controls, 1600×900                                    | [workspace-settings-final-controls-dark-en-1600x900-20261017.png](workspace-settings-final-controls-dark-en-1600x900-20261017.png)                           |
| Shortcuts, 1600×900                                   | [workspace-settings-final-shortcuts-dark-en-1600x900-20261017.png](workspace-settings-final-shortcuts-dark-en-1600x900-20261017.png)                         |
| Accessibility, 1600×900                               | [workspace-settings-final-accessibility-dark-en-1600x900-20261017.png](workspace-settings-final-accessibility-dark-en-1600x900-20261017.png)                 |
| General, 640×520                                      | [workspace-settings-general-dark-640x520-20261017.png](workspace-settings-general-dark-640x520-20261017.png)                                                 |
| General, 390×520                                      | [workspace-settings-general-dark-390x520-20261017.png](workspace-settings-general-dark-390x520-20261017.png)                                                 |
| Accessibility selected by keyboard, 390×520           | [workspace-settings-accessibility-dark-390x520-keyboard-20261017.png](workspace-settings-accessibility-dark-390x520-keyboard-20261017.png)                   |
| Focus returned to Settings trigger by Escape, 390×520 | [workspace-settings-focus-return-dark-390x520-20261017.png](workspace-settings-focus-return-dark-390x520-20261017.png)                                       |
| Focus returned to Help trigger by Escape, 390×520     | [workspace-help-focus-return-dark-390x520-20261017.png](workspace-help-focus-return-dark-390x520-20261017.png)                                               |

At 390×520 the Settings dialog stays inside the viewport and keeps its footer
visible. Tab moved focus from General to Accessibility; Enter selected it and
scrolled the active item into view. The document did not overflow horizontally.

## Block Browser search recovery and mobile drawer

The empty search state is a bordered, centered panel announced as a polite
status. When a query has no matches, its Clear search button is keyboard
reachable; activating it restores all 906 results and returns focus to the
search input. Native Tab traversed the catalog through the final Zombie Head
entry; Shift+Tab returned to its Quick Bar action. The quick-add tooltip now
flips above and aligns inside the last compact row. At 390×520, the sidebar
drawer covers the viewport and keeps the search field and empty state inside
the visible panel. The document stayed at 390 px wide. Captures use the same
two-block audit project.

| State / theme / viewport                    | Capture                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before empty-state recovery, Dark, 1600×900 | [workspace-block-search-empty-before-dark-en-1600x900-20261017.png](workspace-block-search-empty-before-dark-en-1600x900-20261017.png)                                                   |
| After recovery, Minecraft, 1600×900         | [workspace-block-search-empty-craft-en-1600x900-20261017.png](workspace-block-search-empty-craft-en-1600x900-20261017.png)                                                               |
| After recovery, Raccoon, 1600×900           | [workspace-block-search-empty-raccoon-en-1600x900-20261017.png](workspace-block-search-empty-raccoon-en-1600x900-20261017.png)                                                           |
| After recovery, Light, 1600×900             | [workspace-block-search-empty-light-en-1600x900-20261017.png](workspace-block-search-empty-light-en-1600x900-20261017.png)                                                               |
| After recovery, Dark, 1600×900              | [workspace-block-search-empty-dark-en-1600x900-20261017.png](workspace-block-search-empty-dark-en-1600x900-20261017.png)                                                                 |
| Cleared by keyboard, Dark, 1600×900         | [workspace-block-search-cleared-dark-en-1600x900-20261017.png](workspace-block-search-cleared-dark-en-1600x900-20261017.png)                                                             |
| Empty state, Vietnamese, Raccoon, 390×520   | [workspace-block-search-empty-raccoon-vi-390x520-20261017.png](workspace-block-search-empty-raccoon-vi-390x520-20261017.png)                                                             |
| Last virtual row before tooltip fix         | [workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017.png](workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017.png)                                     |
| Last virtual row after tooltip fix          | [workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017-after-tooltip-fix.png](workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017-after-tooltip-fix.png) |

The narrow drawer measured 340×520 at x=0 with no document overflow. Both the
search input and empty panel remained inside its bounds. Chrome's native Tab
and Enter activated Clear search; the query became empty, all 906 blocks
returned, and `#block-search` regained focus. The native Tab pass reached the
last virtual row and then left the list; Shift+Tab returned to the final row's
Quick Bar action. The screenshot pair shows the tooltip clipping before the
row-aware flip and its corrected placement afterward.

## Block Browser unavailable-assets recovery

The unavailable-assets message now uses `role="alert"`; Retry and Open Asset
Manager remain separate native buttons outside the live region. Native Tab
moved from search to Retry and then Open Asset Manager. Enter opened Asset
Manager on its Vanilla tab; Escape closed it and returned focus to the opener.
At 390×520, the Raccoon drawer kept the Vietnamese alert and both actions
inside its 340 px width, with no horizontal document overflow.

| State / theme / viewport               | Capture                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before alert semantics, Dark, 1600×900 | [workspace-block-browser-no-assets-before-dark-en-1600x900-20261017.png](workspace-block-browser-no-assets-before-dark-en-1600x900-20261017.png) |
| Alert state, Dark, 1600×900            | [workspace-block-browser-no-assets-after-dark-en-1600x900-20261017.png](workspace-block-browser-no-assets-after-dark-en-1600x900-20261017.png)   |
| Alert state, Minecraft, 1600×900       | [workspace-block-browser-no-assets-craft-en-1600x900-20261017.png](workspace-block-browser-no-assets-craft-en-1600x900-20261017.png)             |
| Alert state, Light, 1600×900           | [workspace-block-browser-no-assets-light-en-1600x900-20261017.png](workspace-block-browser-no-assets-light-en-1600x900-20261017.png)             |
| Alert and actions, Raccoon VI, 390×520 | [workspace-block-browser-no-assets-raccoon-vi-390x520-20261017.png](workspace-block-browser-no-assets-raccoon-vi-390x520-20261017.png)           |

The no-assets presentation was forced in the isolated browser after normal
bootstrap to capture the fallback; no asset download or cache removal was
started. The component spec verifies the real no-assets branch and alert role.
This visual pass does not simulate a network failure or verify Retry's
download result.

## Workspace panels and responsive shell

| State / viewport                                   | Capture                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark shell, 780×437                                | [workspace-editor-dark-780x437-20261017.png](workspace-editor-dark-780x437-20261017.png)                                                                               |
| Dark shell, after resizing back to 1600×900        | [workspace-editor-dark-after-resize-1600x900-20261017.png](workspace-editor-dark-after-resize-1600x900-20261017.png)                                                   |
| Dark shell, 390×520                                | [workspace-editor-dark-after-resize-390x520-20261017.png](workspace-editor-dark-after-resize-390x520-20261017.png)                                                     |
| Dark shell with narrow-screen drawer open, 390×520 | [workspace-editor-dark-390x520-drawer-after-20261017.png](workspace-editor-dark-390x520-drawer-after-20261017.png)                                                     |
| Decorations                                        | [workspace-decoration-dark-en-1600x900-20261017-final.png](workspace-decoration-dark-en-1600x900-20261017-final.png)                                                   |
| Empty Groups state                                 | [workspace-groups-empty-dark-en-1600x900-20261017.png](workspace-groups-empty-dark-en-1600x900-20261017.png)                                                           |
| Quick Bar with Stone added                         | [workspace-quickbar-stone-dark-en-1600x900-20261017.png](workspace-quickbar-stone-dark-en-1600x900-20261017.png)                                                       |
| Empty Block Usage                                  | [workspace-block-usage-empty-dark-en-1600x900-20261017.png](workspace-block-usage-empty-dark-en-1600x900-20261017.png)                                                 |
| Block Usage, one Stone                             | [workspace-block-usage-one-stone-dark-en-1600x900-20261017.png](workspace-block-usage-one-stone-dark-en-1600x900-20261017.png)                                         |
| Block Usage, Stone and Oak Stairs                  | [workspace-block-usage-two-types-dark-en-1600x900-20261017.png](workspace-block-usage-two-types-dark-en-1600x900-20261017.png)                                         |
| Block Usage, Oak Stairs highlighted by keyboard    | [workspace-block-usage-two-types-oak-highlighted-dark-en-1600x900-20261017.png](workspace-block-usage-two-types-oak-highlighted-dark-en-1600x900-20261017.png)         |
| Selected Stone, empty BlockState                   | [workspace-inspector-selected-stone-dark-en-1600x900-20261017.png](workspace-inspector-selected-stone-dark-en-1600x900-20261017.png)                                   |
| Selected Oak Stairs, BlockState controls           | [workspace-inspector-oak-stairs-controls-dark-en-1600x900-20261017.png](workspace-inspector-oak-stairs-controls-dark-en-1600x900-20261017.png)                         |
| Oak Stairs Facing edited to South                  | [workspace-inspector-oak-stairs-edited-facing-south-dark-en-1600x900-20261017.png](workspace-inspector-oak-stairs-edited-facing-south-dark-en-1600x900-20261017.png)   |
| Oak Stairs details in the mobile inspector         | [workspace-inspector-oak-stairs-mobile-details-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-details-dark-en-390x520-20261017.png)               |
| Oak Stairs controls in the mobile inspector        | [workspace-inspector-oak-stairs-mobile-controls-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-controls-dark-en-390x520-20261017.png)             |
| Mobile Facing options open                         | [workspace-inspector-oak-stairs-mobile-facing-options-dark-en-390x520-20261017.png](workspace-inspector-oak-stairs-mobile-facing-options-dark-en-390x520-20261017.png) |
| Datapack ZIP download complete, 1600 x 900         | [workspace-nbt-datapack-export-success-two-blocks-dark-en-1600x900-20261017.png](workspace-nbt-datapack-export-success-two-blocks-dark-en-1600x900-20261017.png)       |
| Datapack ZIP download complete, 390 x 520          | [workspace-nbt-datapack-export-success-two-blocks-dark-en-390x520-20261017.png](workspace-nbt-datapack-export-success-two-blocks-dark-en-390x520-20261017.png)         |
| Standalone NBT download complete, 1600 x 900       | [workspace-nbt-standalone-export-success-two-blocks-dark-en-1600x900-20261017.png](workspace-nbt-standalone-export-success-two-blocks-dark-en-1600x900-20261017.png)   |

Stone was added to and then removed from the Quick Bar through the UI. The
project stayed at zero placed blocks for that interaction. Later inspector
and populated Block Usage captures use the same isolated synthetic project
with one Stone and one Oak Stairs; the stairs Facing value was restored to
North after the edit check. No user project data was opened or changed.
Existing 2026-10-16 evidence in the
[Workspace renovation index](../../README.md) covers populated Block Usage,
data-heavy flows, menus, diagnostics, and renderer output.

The selected-block pass confirms the Inspector shows the exact registry ID,
position, group, and canonical BlockState. Oak Stairs exposes Facing, Half,
Shape, and Waterlogged; Shape is marked auto-derived and disabled. Changing
Facing to South by pointer updated both the Inspector and the selected
combobox. A keyboard Escape/ArrowDown/Enter flow changed it to West, then the
value was restored to North. Block Usage showed 2 total blocks, 2 unique
types, 0 missing blocks, and both exact registry IDs at 50% each. The
inspector itself scrolls when a selected block has several state properties;
the document viewport remains fixed without horizontal overflow. In Block
Usage, Tab from the sort control focused Oak Stairs and Enter toggled its
highlight button to `aria-pressed=true`; the recorded capture shows the
highlighted row. At 390 x 520, the Inspector opens as a 340 px drawer with a
270 px scroll viewport. Internal scrolling exposes the selected block details
and all four state controls. The Facing option menu stays within the drawer
and viewport, and the document has no horizontal overflow.

The browser exported the two-block project in both supported formats. The
downloaded `workspace-ui-audit.zip` contained only `pack.mcmeta` and
`data/theblocklaundromat/structure/workspace-ui-audit.nbt`; its pack format was 48. Both NBT outputs decoded with the empty root name, DataVersion 3955, size
16 x 16 x 16, and 4,096 block entries. The palette preserved Stone and Oak
Stairs with `facing=north`, `half=bottom`, `shape=straight`, and
`waterlogged=false`; the two non-air block positions were X4/Y0/Z3 and
X4/Y0/Z4. The dialog displayed successful byte counts of 8,646 for the ZIP
and 8,252 for the standalone NBT. The 390 x 520 datapack dialog retained its
download and cancel actions with no horizontal overflow. The File menu offers
Structure JSON import but no Structure NBT import; NBT loading in Minecraft
was not part of this browser check.

## Decorations and Groups sidebar tabs

| State / viewport | Screenshot |
| --- | --- |
| Decorations selected with visible keyboard focus, two-block project, 390 x 520 | [workspace-decorations-keyboard-dark-en-390x520-20261017.png](workspace-decorations-keyboard-dark-en-390x520-20261017.png) |
| Groups selected with visible keyboard focus, two-block project, 390 x 520 | [workspace-groups-keyboard-dark-en-390x520-20261017.png](workspace-groups-keyboard-dark-en-390x520-20261017.png) |

Native ArrowRight moved Blocks → Decorations → Groups; Home and End selected
the first and last tabs. Only the selected tab is in the tab sequence, and Tab
from Groups entered the Group name field. Escape closed the 390 x 520 drawer
and returned focus to its Blocks opener. The Decorations and Groups labels stay
visible at this drawer width, so their tooltips are suppressed instead of
covering tab content; tooltips remain available in the narrow icon-only mode.
The Manage sources tooltip is aligned to the selector's right edge: before the
fix the selector measured 286/327 px (client/scroll width) and the Decorations
panel 307/338 px; afterward both measured equal widths (286/286 and 307/307).
The document stayed 390 px wide without horizontal overflow.

## Quick Bar collapse and save status announcements

| State / viewport | Screenshot |
| --- | --- |
| Quick Bar collapsed with keyboard focus, Dark EN, 390 x 520 | [workspace-quickbar-collapsed-dark-en-390x520-20261017.png](workspace-quickbar-collapsed-dark-en-390x520-20261017.png) |

At 390 x 520, Enter collapsed and expanded the empty Quick Bar while keeping
focus on its toggle. The button exposes `aria-expanded=false/true` and the
localized Expand/Collapse action name; the slot panel is removed while
collapsed. The save label exposes `role=status`, polite live updates, and
atomic text for Saved, Saving, and Save error. The status semantics and
Quick Bar state were checked in Minecraft, Raccoon, Light, and Dark with both
English and Vietnamese; the document stayed 390 px wide. At 320 x 520 in
Vietnamese, the footer wrapped to two rows and remained 320 px wide. The
browser was returned to Dark/English with the empty Quick Bar expanded.

## Sidebar resize keyboard access

| State / viewport | Screenshot |
| --- | --- |
| Left resize separator focused, Dark EN, 1600 x 900 | [workspace-sidebar-resizer-keyboard-dark-en-1600x900-20261017.png](workspace-sidebar-resizer-keyboard-dark-en-1600x900-20261017.png) |
| Focus transferred to Open inspector after resizing to mobile mode, Dark EN, 780 x 437 | [workspace-resize-focus-mobile-opener-dark-en-780x437-20261017.png](workspace-resize-focus-mobile-opener-dark-en-780x437-20261017.png) |

At 1600 x 900, the left and right separators expose localized names,
`aria-valuemin`, `aria-valuenow`, and `aria-valuemax`. ArrowRight increased
the left width from 260 to 276 px; ArrowLeft restored it to 260 px while the
visible keyboard focus stayed on the separator. At 900 px, the current
260/230 px columns report maximum widths of 350/320 px. At 851 px, three
ArrowRight presses clamp the left column at 301 px, leaving the 320 px minimum
center workspace; its announced maximum updates to 301. The saved width was
restored to 260 px after the clamp check.

The accessible names and ranges were checked in Minecraft, Raccoon, Light, and
Dark with English and Vietnamese. At 780 x 437 and 390 x 520, the resize
separators are hidden and the responsive sidebar controls are available; the
document has no horizontal overflow. When a focused desktop separator becomes
hidden at 780 x 437, focus moves to the matching responsive sidebar opener and
remains visible. The browser was returned to the 260/230 px saved widths.

## Structure JSON browser round trip

| Step                                          | Screenshot                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Export                                        | [workspace-structure-json-export-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-export-two-blocks-dark-en-1600x900-20261017.png)                                 |
| Import validation, desktop                    | [workspace-structure-json-import-validated-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-import-validated-two-blocks-dark-en-1600x900-20261017.png)             |
| Import validation, 390 x 520                  | [workspace-structure-json-import-validated-two-blocks-dark-en-390x520-20261017.png](workspace-structure-json-import-validated-two-blocks-dark-en-390x520-20261017.png)               |
| Replace confirmation                          | [workspace-structure-json-import-confirm-replace-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-import-confirm-replace-two-blocks-dark-en-1600x900-20261017.png) |
| Inspector after save                          | [workspace-structure-json-roundtrip-inspector-two-blocks-dark-en-1600x900-20261017.png](workspace-structure-json-roundtrip-inspector-two-blocks-dark-en-1600x900-20261017.png)       |
| Invalid JSON syntax                           | [workspace-structure-json-invalid-syntax-dark-en-1600x900-20261017.png](workspace-structure-json-invalid-syntax-dark-en-1600x900-20261017.png)                                       |
| Simulated file-read failure                   | [workspace-structure-json-file-read-error-dark-en-1600x900-20261017.png](workspace-structure-json-file-read-error-dark-en-1600x900-20261017.png)                                     |
| Valid source after error                      | [workspace-structure-json-recovered-valid-source-dark-en-1600x900-20261017.png](workspace-structure-json-recovered-valid-source-dark-en-1600x900-20261017.png)                       |
| Escape returns focus to File                  | [workspace-structure-json-import-focus-return-dark-en-1600x900-20261017.png](workspace-structure-json-import-focus-return-dark-en-1600x900-20261017.png)                             |
| Initial focus on Import JSON                  | [workspace-structure-json-import-initial-focus-dark-en-1600x900-20261017.png](workspace-structure-json-import-initial-focus-dark-en-1600x900-20261017.png)                           |
| ArrowRight selects Create with AI             | [workspace-structure-json-ai-tab-keyboard-dark-en-1600x900-20261017.png](workspace-structure-json-ai-tab-keyboard-dark-en-1600x900-20261017.png)                                     |
| ArrowRight selects Available content, desktop | [workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-1600x900-20261017.png](workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-1600x900-20261017.png)         |
| ArrowRight selects Available content, mobile  | [workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-390x520-20261017.png](workspace-structure-json-ai-inner-content-tab-keyboard-dark-en-390x520-20261017.png)           |
| Native Tab reaches Available content, mobile  | [workspace-structure-json-ai-inner-tab-native-tab-focus-dark-en-390x520-20261017.png](workspace-structure-json-ai-inner-tab-native-tab-focus-dark-en-390x520-20261017.png)           |

The app exported a 466-byte Structure JSON file from the same isolated project,
then imported that downloaded file through the visible file picker. Validation
reported 2 blocks total, 2 valid, 0 missing definitions, 0 out-of-bounds, 0
invalid states, 0 duplicates, and 2 positive-offset warnings. At 390 x 520,
the import dialog measured 374 x 504 px, kept Apply Import visible in its
footer, and had no horizontal overflow. Applying Replace showed an explicit
confirmation to replace 2 current blocks with 2 imported blocks. After
confirmation, the app reported Saved; the Inspector showed Oak Stairs at
X4/Y0/Z3 with `facing=north`, `half=bottom`, `shape=straight`, and
`waterlogged=false`. Stone remained at X4/Y0/Z4. This verifies the non-empty
browser export/import/replace/save path for this synthetic project.

Malformed JSON syntax showed “The text is not valid JSON.” in a `role=alert`
region, left Apply Import unavailable, and kept the project Saved with its two
blocks. Loading a valid file cleared the error, reported 2 valid blocks with no
blocking issues, and enabled Apply Import; the recovery check did not apply it.
Escape closed the dialog and returned keyboard focus to the File menu trigger
with a visible focus ring. A simulated `Blob.text()` rejection also showed the
localized read-error alert, left Apply Import unavailable, and preserved the
saved two-block project. Loading a valid file afterward cleared the alert and
restored the validation preview. The browser API override used for this
simulation was restored immediately after the read-error check.

Opening the dialog puts focus on the selected Import JSON tab rather than the
Cancel button. The outer tablist uses roving focus: ArrowRight switches to
Create with AI, ArrowLeft returns to Import JSON, and the selected tab is the
only tab stop. Unit coverage also verifies wraparound plus Home/End. Escape
from the tablist closes the dialog and restores focus to File.

The nested Create with AI tablist also uses roving focus with ArrowLeft,
ArrowRight, Home, and End. At 390 x 520, the Home then ArrowRight keyboard
sequence selects and focuses Available content; the focused tab is fully
visible inside the scrollable AI workspace and the document has no horizontal
overflow. The measured workspace spans y=223 to 466 and the focused tab spans
y=323 to 365. Native Tab traversal from Create with AI also reaches the
selected Available content tab with the same visible focus and scroll position.
The screenshots record both paths and the persistent dialog footer.

## Project Diagnostics focus and empty state

| State / viewport                                 | Screenshot                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Initial empty state before focus fix, 1600 x 900 | [workspace-diagnostics-overview-dark-en-1600x900-20261017.png](workspace-diagnostics-overview-dark-en-1600x900-20261017.png)       |
| Initial empty state before focus fix, 390 x 520  | [workspace-diagnostics-overview-dark-en-390x520-20261017.png](workspace-diagnostics-overview-dark-en-390x520-20261017.png)         |
| Title focus and neutral close, 1600 x 900        | [workspace-diagnostics-title-focus-dark-en-1600x900-20261017.png](workspace-diagnostics-title-focus-dark-en-1600x900-20261017.png) |
| Title focus and neutral close, 390 x 520         | [workspace-diagnostics-title-focus-dark-en-390x520-20261017.png](workspace-diagnostics-title-focus-dark-en-390x520-20261017.png)   |

The initial captures use the isolated two-block project and show zero issue
groups. Before the update, opening Diagnostics focused the red Cancel close
control. Afterward, focus lands on the dialog title and the close control uses
the neutral shared color. At 390 x 520 the dialog measures 374 x 504 px; its
body scrolls internally and the document remains 390 px wide with no horizontal
overflow. The renderer interval label and hint explain that the value is
smoothed and includes idle time. A five-block browser sample also checked
diagnostics classification using current catalog definitions: Stone had no
finding; `minecraft:oak_fence` produced a partial-behavior warning, and
`minecraft:trapped_chest` produced an informational unknown-behavior note. One
missing-content block and one unresolved ID produced separate errors. The
summary reported 4 groups / 4 affected blocks (2 errors, 1 warning, 1 info).
Compatibility details stayed collapsed on open, then expanded with
`aria-expanded=true` and two labeled cards. Both behavior messages say that
coverage does not determine placement validity.

Filtering to Warning changed the polite `role="status"` message to “1 Issue
group; 1 Affected block”. At 390 x 520 in Vietnamese Raccoon, the warning card
remained reachable by scrolling inside the dialog, the full explanation was
visible, and the document had no horizontal overflow. Short issue lists now
size to their contents; larger lists retain their own scroll region. These
checks do not validate Minecraft placement rules: Project Diagnostics reports
content, asset, visual, and behavior-coverage findings and has no
placement-validity finding in its current contract.

| State / theme / viewport                         | Screenshot                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mixed errors and compatibility summary, Dark EN | [workspace-diagnostics-mixed-findings-dark-en-1600x900-20261017.png](workspace-diagnostics-mixed-findings-dark-en-1600x900-20261017.png)                     |
| Compatibility expanded, Minecraft EN           | [workspace-diagnostics-compatibility-expanded-craft-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-craft-en-1600x900-20261017.png)     |
| Compatibility expanded, Raccoon EN             | [workspace-diagnostics-compatibility-expanded-raccoon-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-raccoon-en-1600x900-20261017.png) |
| Compatibility expanded, Light EN               | [workspace-diagnostics-compatibility-expanded-light-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-light-en-1600x900-20261017.png)     |
| Compatibility expanded, Dark EN                | [workspace-diagnostics-compatibility-expanded-dark-en-1600x900-20261017.png](workspace-diagnostics-compatibility-expanded-dark-en-1600x900-20261017.png)       |
| Warning filter, Raccoon VI, 390 x 520           | [workspace-diagnostics-warning-raccoon-vi-390x520-20261017.png](workspace-diagnostics-warning-raccoon-vi-390x520-20261017.png)                               |

The expanded mixed report retained the same error/warning/info order and
readable issue-card contrast across Minecraft, Raccoon, Light, and Dark.

## Asset Manager tabs and empty Mods state

| State / viewport                                      | Screenshot                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial Vanilla state before keyboard fix, 1600 x 900 | [workspace-asset-manager-initial-dark-en-1600x900-20261017.png](workspace-asset-manager-initial-dark-en-1600x900-20261017.png)                             |
| Initial Vanilla state before keyboard fix, 390 x 520  | [workspace-asset-manager-initial-dark-en-390x520-20261017.png](workspace-asset-manager-initial-dark-en-390x520-20261017.png)                               |
| Vanilla tab receives initial focus, 1600 x 900        | [workspace-asset-manager-tabs-initial-focus-dark-en-1600x900-20261017.png](workspace-asset-manager-tabs-initial-focus-dark-en-1600x900-20261017.png)       |
| Arrow/Home/End select Mods, 1600 x 900                | [workspace-asset-manager-tabs-keyboard-dark-en-1600x900-20261017.png](workspace-asset-manager-tabs-keyboard-dark-en-1600x900-20261017.png)                 |
| ArrowLeft/Right select Mods, 390 x 520                | [workspace-asset-manager-tabs-keyboard-dark-en-390x520-20261017.png](workspace-asset-manager-tabs-keyboard-dark-en-390x520-20261017.png)                   |
| Escape returns focus to Tools, 1600 x 900             | [workspace-asset-manager-focus-return-to-tools-dark-en-1600x900-20261017.png](workspace-asset-manager-focus-return-to-tools-dark-en-1600x900-20261017.png) |

The initial captures show Vanilla selected with the Close button focused. The
updated dialog focuses the selected Vanilla tab, keeps only the selected tab
in the regular Tab sequence, and uses ArrowLeft/Right with wraparound plus
Home/End. At 390 x 520, selecting Mods by keyboard keeps its focus ring visible
inside the dialog; the dialog measures 374 x 504 px and the document has no
horizontal overflow. Escape closes Asset Manager, restores focus to Tools, and
leaves the saved two-block test project unchanged. The synthetic project has
no imported mods. Actual mod JAR inspection and failure recovery remain open
pending a trusted fixture.

## Asset Manager Mod help overlay

The Mods tab help control previously opened the tooltip on focus and toggled
it closed again on the same mouse click. The first click therefore only showed
focus; a second click was needed to read the help. The control now opens
idempotently and exposes its open state through `aria-expanded`, `aria-controls`,
and `aria-describedby`. Moving focus away closes the help. Escape closes only
the help overlay, keeps Asset Manager open, and leaves focus on its trigger.
Clicking outside the help also dismisses only that overlay. No mod JAR was
imported; the Mods list remains empty.

| Step / state                                            | Screenshot                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor before opening Tools                             | [workspace-overlay-01-editor-start-dark-en-1600x900-20261017.png](workspace-overlay-01-editor-start-dark-en-1600x900-20261017.png)                         |
| Tools menu                                              | [workspace-overlay-02-tools-menu-dark-en-1600x900-20261017.png](workspace-overlay-02-tools-menu-dark-en-1600x900-20261017.png)                             |
| Asset Manager, Vanilla tab                              | [workspace-overlay-03-asset-manager-vanilla-dark-en-1600x900-20261017.png](workspace-overlay-03-asset-manager-vanilla-dark-en-1600x900-20261017.png)       |
| Asset Manager, empty Mods tab                           | [workspace-overlay-04-asset-manager-mods-dark-en-1600x900-20261017.png](workspace-overlay-04-asset-manager-mods-dark-en-1600x900-20261017.png)             |
| Before fix: first click leaves help closed              | [workspace-overlay-05-help-click-no-popover-dark-en-1600x900-20261017.png](workspace-overlay-05-help-click-no-popover-dark-en-1600x900-20261017.png)       |
| Before fix: second click opens help                     | [workspace-overlay-06-help-open-after-second-click-dark-en-1600x900-20261017.png](workspace-overlay-06-help-open-after-second-click-dark-en-1600x900-20261017.png) |
| After fix: first click opens help                       | [workspace-overlay-07-help-open-first-click-dark-en-1600x900-20261017.png](workspace-overlay-07-help-open-first-click-dark-en-1600x900-20261017.png)         |
| Tab moves focus away and closes help                    | [workspace-overlay-08-help-dismissed-by-tab-dark-en-1600x900-20261017.png](workspace-overlay-08-help-dismissed-by-tab-dark-en-1600x900-20261017.png)       |
| Escape closes help and keeps Asset Manager open         | [workspace-overlay-09-help-dismissed-by-escape-dark-en-1600x900-20261017.png](workspace-overlay-09-help-dismissed-by-escape-dark-en-1600x900-20261017.png) |
| Outside click closes help and keeps Asset Manager open  | [workspace-overlay-10-help-dismissed-by-backdrop-dark-en-1600x900-20261017.png](workspace-overlay-10-help-dismissed-by-backdrop-dark-en-1600x900-20261017.png) |

## Changes verified in this pass

- Resizing the viewport 1600→390→1600 kept saved sidebar preferences at
  260/230 px. The rendered columns narrowed temporarily and restored when the
  viewport grew.
- Settings opened on General; the Close button no longer receives initial
  focus or danger-red emphasis.
- Keyboard selection of Accessibility at 390×520 keeps the selected nav item
  visible and the dialog footer accessible.
- Cancel and Escape return focus to the owning menu trigger for Settings and
  Shortcuts Help; Escape was verified at 390×520 with a visible focus ring.
- Structure JSON parse and file-read failures appear as alerts and prevent
  Apply Import; a valid-file retry restores the preview, and Escape returns
  focus to File.
- Import JSON is the dialog's initial focus; ArrowLeft/Right and Home/End
  navigate the outer tabs while preserving a visible focus ring.
- Home and ArrowRight navigate the nested AI tabs; the focused tab scrolls into
  view at 390 x 520 with no document-level horizontal overflow.
- Diagnostics starts focus at its heading, uses a neutral close control, and
  labels its render interval as smoothed with idle time included.
- Diagnostics distinguishes missing and unresolved content errors from the
  current oak-fence behavior warning and trapped-chest unknown-behavior info;
  filtering announces the matching group and affected-block counts.
- Short Diagnostics lists fit their cards; larger lists keep independent
  scroll areas. Behavior coverage remains separate from placement validity.
- Asset Manager starts focus on Vanilla; Arrow/Home/End navigate between its
  Vanilla and Mods tabs with one tab stop.
- The narrow Workspace drawer and the 780×437 shell fit without document-level
  horizontal overflow.

Before the file-read error fix, the Workspace suite passed with
`--isolate=false` (308 files passed, 7 skipped; 1,923 tests passed, 11 skipped),
along with production build, app/spec/worker TypeScript checks, tool tests (2/2),
encoding, Prettier, and `git diff --check`. The default worker-isolated full
suite run failed with Vitest worker timeouts and IPC errors; the successful run
disabled test isolation. The follow-up file-read and tab-navigation changes
passed two focused specs (19 tests total), production build, encoding check,
Prettier, and `git diff --check`. The nested AI mobile-focus follow-up passed
its focused component spec (4 tests), production build, encoding check,
Prettier, `git diff --check`, and a check that its 49 linked PNGs exist. Native
Tab entry and arrow navigation were both checked in Chrome at 390 x 520. The
Diagnostics focus and wording follow-up passed its focused component spec (8
tests), production build, encoding check, Prettier, `git diff --check`, and a
check that all 53 linked PNGs exist. Asset Manager tab navigation passed its
focused component spec (1 test), production build, encoding check, Prettier,
`git diff --check`, and a check that all 59 linked PNGs exist. Browser checks
verified initial Vanilla focus, Arrow/Home/End behavior, the 390 x 520 Mods
state without horizontal overflow, and Escape focus return to Tools. Workspace
acceptance remains in progress. Remaining checks cover trusted mod/JAR
fixtures, Asset Manager load and failure recovery, External AI, Diagnostics warning/error cases, all locales
and fonts, focus return for other dialogs, and reduced-motion behavior. The non-empty
Structure JSON browser round trip is recorded above. Both non-empty NBT
export modes were decoded in this pass; manual loading in Minecraft remains
pending. The repository's independent Java 1.21.1 NBT fixture is covered by
codec contract tests. NBT import is not exposed in the Workspace File menu.

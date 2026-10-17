# Workspace UI acceptance inventory

**Status:** in progress. This is a working audit matrix, not a claim that
Workspace acceptance is complete. Evidence is split between the current
browser pass and the earlier captures catalogued in the
[Workspace browser evidence archive](evidence/README.md).

## Rating key

- **Good:** current source and recorded browser evidence support the intended
  behavior and presentation.
- **Needs recheck:** recorded evidence exists, but the current pass must repeat
  the workflow after the renovation changes settle.
- **Open:** the required state or an external fixture is not available yet.
- **Regression risk:** low, medium, or high; based on the code boundary changed
  in the current pass.

## Acceptance matrix

| Area                                                              | Visual and theme quality                                                                                   | Layout and usability                                                                                                        | Accessibility and motion                                                                                                      | Functional regression risk | Current evidence / next check                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| App shell, menus, header, toolbar                                 | Good in recorded four-theme passes                                                                         | Menus align inside 390 px and 320 px viewports; long labels wrap at 320 px without page overflow                            | Arrow/Home/End menu navigation, Tab dismissal, Escape trigger return, and focus-out dismissal verified; shared menu motion follows the app-wide reduced-motion rule | Low | [Current shell, mobile menu, keyboard captures, and motion audit](evidence/current-run-20261017/README.md); menu alignment checked in four themes and both locales |
| Block Browser and search | No-results and unavailable-assets recovery states verified across themes; cards expose canonical registry IDs | Clear search restores 906 results; the 390 px touch drawer keeps search/errors visible without document overflow and exposes a visible 24 px Quick Add target | Tab reaches the last virtual row and recovery buttons; selection names include the registry ID | Low | [Current search, error, drawer, last-row, and touch evidence](evidence/current-run-20261017/README.md#block-browser-touch-quick-add-and-registry-identity); real network retry remains open |
| Decorations and Groups                                            | Good in current Dark captures                                                                              | Decorations view and empty Groups state verified at 390×520 with no horizontal overflow                                      | Arrow/Home/End roving focus; Tab enters the active panel; Escape closes the drawer and restores focus to its opener             | Low                        | [Current sidebar tab captures and measurements](evidence/current-run-20261017/README.md); visible-label tooltips no longer cover tabs |
| Inspector and BlockState                                          | Selected Stone and Oak Stairs captured in Dark; mobile detail and control states also captured             | Exact ID, position, group, and state values shown; Facing changed by pointer and keyboard; narrow drawer scrolls internally | Combobox exposes active option; Escape closes only its popup; Tab advances to Half and closes it; focus treatment checked in all themes and locales | Low | [Current selected-block and combobox evidence](evidence/current-run-20261017/README.md); two-block synthetic project |
| Block Usage | Existing populated Dark captures predate the keyboard update | 1-block and 2-type states show totals, missing count, exact IDs, counts, and shares | A one-stop listbox now supports Arrow/Home/End navigation across virtualized rows, Enter/Space highlight toggling, and option position metadata; component test and build pass; browser and assistive-technology verification remain open | Medium | [Existing populated captures and implementation checkpoint](evidence/current-run-20261017/README.md#block-usage-keyboard-navigation-implementation-checkpoint), [component template](../../../Frontend/src/app/features/editor/inspector/block-usage/block-usage-panel.component.html), and [component implementation](../../../Frontend/src/app/features/editor/inspector/block-usage/block-usage-panel.component.ts) |
| Quick Bar and Status Bar | Expanded and collapsed Quick Bar captured in Dark; no layout change across four themes | Enter collapses/expands without losing focus; 390×520 and Vietnamese 320×520 footer fit without horizontal overflow | `aria-expanded` tracks the Quick Bar; one visible/live save status follows the status bar preference; browser/assistive-technology behavior still needs recheck | Low | [Current collapse screenshot and announcement checks](evidence/current-run-20261017/README.md) and [save status announcement ownership](evidence/current-run-20261017/README.md#workspace-save-status-announcement-ownership); add/remove of Stone remains verified |
| Settings: General, Appearance, Controls, Shortcuts, Accessibility | All five sections and Workspace Background captured in Dark                                                | Desktop and 640×520/390×520 dialog layout captured; initial focus starts at General                                         | Escape closes an open select only; Tab dismisses its popup and continues through Settings; the dialog stays open              | Medium                     | [Current select and keyboard evidence](evidence/current-run-20261017/README.md) plus earlier section captures                         |
| Structure JSON import/export                                      | Round trip, error recovery, initial focus, and keyboard tab switching captured in Dark                     | Two-block round trip and valid retry verified; footer remains visible at 390 x 520; invalid input cannot be applied         | Errors use role=alert; outer Arrow/Home/End navigation; Escape restores File focus                                            | Medium                     | [Current round-trip evidence](evidence/current-run-20261017/README.md); NBT import is not exposed by the File menu                    |
| Create with AI / External AI                                      | Five inner tabs stay readable at 320 px; copy feedback remains visible when it wraps; Content Limits uses a labeled checkbox group; search placeholder contrast passes in all themes | At 320×520, English tabs scroll horizontally and Vietnamese fits without it; the two-line copy error stays above the footer; all five labels fit at 390×520; the candidate list fits without document overflow | Home/ArrowRight reaches all tabs with visible focus; status and validation feedback scroll into view; 220 ms copy animation clamps to 1 ms with reduced motion; checkbox group is named from its visible heading; search placeholder measures at least 5.50:1 across all themes; full AI workflow review remains open | Low | [External AI narrow-tab evidence](evidence/current-run-20261017/README.md#external-ai-tabs-at-320-px), [copy feedback/motion checks](evidence/current-run-20261017/README.md#copy-feedback-at-320-px), [Content Limits evidence](evidence/current-run-20261017/README.md#content-limits-checkbox-group), and [Workspace-wide placeholder contrast evidence](evidence/current-run-20261017/README.md#workspace-form-placeholder-contrast) |
| NBT / Datapack export                                             | Both download modes captured in Dark; datapack also captured at 390 x 520                                  | Two-block ZIP and standalone NBT downloaded and decoded; fixed footer remains visible on mobile                             | Close returns focus to File; recheck validation announcements; Minecraft load remains pending                                 | Medium                     | [Current decoded exports](evidence/current-run-20261017/README.md); golden fixture is codec-tested                                    |
| Asset Manager and Mod Import | Vanilla and empty Mods tabs plus help overlay captured in Dark | 1600 x 900 and 390 x 520 layouts fit; dialog scrolls internally with no horizontal overflow | History uses a labeled log; only operation phases use a status announcement, while per-callback progress and the preflight card stay outside live regions; progressbar retains its current value; browser announcement checks, recovery, and trusted mod JAR fixture remain open | High | [Current tab and help-overlay evidence](evidence/current-run-20261017/README.md) and [activity live-region source checkpoint](evidence/current-run-20261017/README.md#asset-manager-activity-announcements-source-checkpoint) |
| Project Diagnostics | Expanded mixed findings captured across all four themes; compatibility remains grouped and collapsed by default | Errors, a real partial-behavior warning, and unknown-behavior info stay distinct; the narrow dialog scrolls internally without horizontal overflow | Placement validity is not inferred from behavior coverage; browser cases and current UI contract recorded | High | [Current Diagnostics captures and narrow dialog audit](evidence/current-run-20261017/README.md#project-diagnostics-narrow-dialog-audit); no placement-validity finding is defined in this report |
| Help, shortcuts, dialogs                                          | Existing help and shortcut UI recorded; shared close control is now neutral                                | Confirm close/cancel/apply/save behaviors after style changes                                                               | Settings and Shortcuts Help focus return verified; shared dialog entry/exit clamp to 1 ms; recheck remaining dialog actions and assistive-technology behavior | Medium | Current Settings/Help focus-return captures plus [the Workspace motion audit](evidence/current-run-20261017/README.md#workspace-motion-audit-across-ui-states) |
| Context menus, tooltips, overlays                                 | Existing menu stacking fix, tooltip, Asset Manager help, and select popup states documented                | All six application menus are reachable at 320 px in Vietnamese; long File labels wrap and tall popovers scroll internally | Menus and selects dismiss on keyboard focus changes; nested Escape closes the active popup without dismissing its owner         | Medium                     | [Current menu, help, and select evidence](evidence/current-run-20261017/README.md) plus prior context-menu captures in [README](README.md) |
| Loading, empty, error, warning, success states | Several states have dedicated recorded captures | Current empty Groups/Block Usage and Quick Bar add/remove states verified | Asset activity history and operation phases announce at milestones; per-callback progress remains available on the progressbar without being repeatedly announced; browser/assistive-technology verification remains open | Medium | Current captures plus source notes in [README](evidence/current-run-20261017/README.md) |
| Responsive layout and sidebar resizing                            | Dark shell and keyboard focus captured at 1600×900 and 780×437; normal and Large font checked at 390×520 across four themes; Large also checked at 640×520 | Camera actions wrap at narrow widths for all fonts; when a short screen needs more room the page scrolls and keeps a 12rem editor body, separating Quick Bar from drawer openers | Separators expose localized names/ranges; focus transfers to the matching drawer opener when the handle hides                  | Low                        | [Narrow font matrix](evidence/current-run-20261017/README.md#narrow-workspace-font-sample) and [Large-font responsive captures](evidence/current-run-20261017/README.md#large-workspace-font-at-narrow-and-short-viewports); saved widths restored to 260/230 px |
| Preferences, locale, fonts, workspace backgrounds                 | Normal-size 3-font/4-theme EN/VI matrices captured at 390×520 and 320×520; Small 3-font coverage captured across all themes/locales at 390×520 and 320×520; Large 3-font coverage captured across all themes/locales at 320×520, plus Comfortaa across all themes/locales at 390×520 and 640×520 and Craft/Vietnamese at 390×600; renderer Dark/Light/Reality × all four UI themes × EN/VI captured at 1600×900 | 320 px Normal and Large states scroll vertically; Small mostly fits, with Comfortaa/Minecraft/Vietnamese scrolling 7 px; Camera remains inside and Quick Bar stays clear of drawer openers; renderer background remains independent from the selected UI theme in all 24 combinations | Main Workspace, File menu, and all five Settings sections pass 4.5:1 text scans in all themes; other dialogs/dynamic states remain open | Medium                  | [Narrow font matrix](evidence/current-run-20261017/README.md#narrow-workspace-font-sample), [Small-font check](evidence/current-run-20261017/README.md#small-workspace-font-at-narrow-viewports), [theme/font matrix](evidence/current-run-20261017/README.md#workspace-theme-and-font-matrix), [Large-font responsive check](evidence/current-run-20261017/README.md#large-workspace-font-at-narrow-and-short-viewports), [renderer background matrix](evidence/current-run-20261017/README.md#renderer-background-independence-across-ui-themes), and [contrast scan](evidence/current-run-20261017/README.md#workspace-text-contrast-across-themes) |
| Animation and reduced motion | Source audit covers popover/dialog entry and exit, selection marks, AI copy success, and indeterminate progress | Menu, dialog, selection, and progress states were exercised in all four themes and both locales; reduced motion uses 1 ms animation/transition durations and one iteration, with indeterminate progress rendered as a static full-track fill | Real AI copy success changed from 220 ms to 1 ms in Craft/English; Workspace dialog and selected-block states had no layout shift | Low | [Workspace motion state and theme/locale evidence](evidence/current-run-20261017/README.md#workspace-motion-audit-across-ui-states); renderer camera movement and assistive-technology/browser combinations remain separate acceptance work |
| Renderer, large structures, project data                          | Existing 110,592-block browser evidence is recorded                                                        | No renderer, persistence, or domain behavior changed in this pass                                                           | Not applicable to current source edits                                                                                        | Low                        | Earlier renderer evidence in [README](README.md); rerun benchmark only if renderer code changes                                       |

## Latest acceptance update

| Area | Result | Evidence |
| --- | --- | --- |
| Create with AI / External AI tabs | Fixed overlapping English tab labels at 320×520; all five tabs keep visible keyboard focus across the 24-state Normal matrix, with extra Small/Large checks | [External AI narrow-tab evidence](evidence/current-run-20261017/README.md#external-ai-tabs-at-320-px) |
| Create with AI / External AI feedback | Copy success and failure remain visible at 320×520; reduced motion shortens the check animation from 220 ms to 1 ms | [Before/after failure, success, and reduced-motion captures](evidence/current-run-20261017/README.md#copy-feedback-at-320-px) |
| Settings Appearance inner tabs | Verified one tab stop, ArrowLeft/Right wrapping, Home/End, Tab into the selected panel, and visible focus across all four themes and both locales | [Appearance tab captures and browser notes](evidence/current-run-20261017/README.md#settings-appearance-tab-keyboard-navigation) |
| Structure JSON and Minecraft Structure export dialogs | Escape closes each dialog and restores visible focus to File; NBT dialog scrolls internally with its footer visible | [Current export dialog flow and focus return](evidence/current-run-20261017/README.md#file-export-dialog-close-and-focus-return) |
| Application menu keyboard navigation | Arrow keys move sequentially and wrap; Home/End jump to the ends; Tab dismisses the popup; Escape returns visible focus to the trigger | [Application menu keyboard evidence](evidence/current-run-20261017/README.md#application-menu-keyboard-navigation) |
| Application menu focus across themes and locales | Help menu first-item focus ring visible in all four themes and both English and Vietnamese; labels fit at 1600×900 without horizontal overflow | [Eight-state focus matrix](evidence/current-run-20261017/README.md#application-menu-focus-across-themes-and-locales); formal contrast ratios, other menu items, fonts, and viewports remain open |
| Workspace text contrast | Main-screen, File-menu, and all five Settings sections scan at 4.5:1 or above in all four themes; selected metadata and the Shortcuts destructive actions were corrected | [Before/after captures and four-theme scan notes](evidence/current-run-20261017/README.md#workspace-text-contrast-across-themes); other dialogs, dynamic states, and font-size combinations still need coverage |
| Workspace typography combinations | All 12 theme/font combinations and both English and Vietnamese locales rendered with loaded fonts and no document horizontal overflow at 1600×900 | [24-state Workspace font matrix](evidence/current-run-20261017/README.md#workspace-theme-and-font-matrix); Large font-size coverage beyond the recorded viewports and formal contrast checks remain open |
| Compact Workspace shell | Closed shell wraps its toolbar, exposes drawer openers, and has no document overflow across four themes and EN/VI at 780×437 | [Eight-state compact shell matrix](evidence/current-run-20261017/README.md#compact-workspace-shell-across-themes-and-locales); drawer contents are handled by their own viewport checks |
| Narrow Workspace font sample | All three fonts loaded at 390×520 across four themes and EN/VI; Normal, Small, and Large 320×520 matrices pass without horizontal overflow, clipped Camera buttons, or Quick Bar/drawer overlap; Normal and Large scroll to keep the Quick Bar/status bar reachable | [390 px font matrix](evidence/current-run-20261017/README.md#narrow-workspace-font-sample), [Normal at 320 px](evidence/current-run-20261017/README.md#normal-font-at-320px-viewport), [Small at 320 px](evidence/current-run-20261017/README.md#small-font-at-320px-viewport), and [Large at 320 px](evidence/current-run-20261017/README.md#large-font-at-320px-viewport) |
| Large font at narrow and short viewports | Camera controls fit across all four themes and EN/VI at 390×520 and 640×520; all three fonts, four themes, and EN/VI at 320×520 scroll vertically with no clipping or Quick Bar/drawer overlap | [Before/after, theme, and scrolled captures with geometry](evidence/current-run-20261017/README.md#large-workspace-font-at-narrow-and-short-viewports), plus the [24-state 320 px matrix](evidence/current-run-20261017/README.md#large-font-at-320px-viewport); 600 px height checks remain open |
| Small font at narrow viewports | All three fonts at Small size across four themes and EN/VI at 390×520 and 320×520; no document overflow, Camera clipping, or Quick Bar/drawer overlap | [48-state Small-font captures and measurements](evidence/current-run-20261017/README.md#small-workspace-font-at-narrow-viewports), with the single 320 px scrolled state also captured |
| Project Diagnostics and About dialogs | Both Escape paths close the dialog and return visible focus to Tools or Help; no focus-return issue found | [Diagnostics and About focus-return captures](evidence/current-run-20261017/README.md#project-diagnostics-and-about-focus-return) |
| Application reduced motion | Verified the popover/dialog/selection/progress matrix across four themes and English/Vietnamese; measured real AI-copy success in Craft/English. [Evidence](evidence/current-run-20261017/README.md#workspace-motion-audit-across-ui-states); renderer camera motion and assistive-technology/browser combinations remain separate acceptance work |
| Block Browser touch quick-add and registry identity | Added canonical registry IDs to cards and accessible selection names; quick-add controls remain visible at 24 px on coarse pointers | [390 px touch baseline and four-theme/locale after matrix](evidence/current-run-20261017/README.md#block-browser-touch-quick-add-and-registry-identity) |
| Project Diagnostics narrow dialog | Confirmed internal vertical scrolling, visible close control, and no horizontal overflow at 390 x 520 | [Narrow dialog audit and flow captures](evidence/current-run-20261017/README.md#project-diagnostics-narrow-dialog-audit) |

## Current code changes under review

- Settings opens with its General section as the initial focus target, avoiding
  automatic focus on the red destructive-looking Close control.
- Chrome returns focus to the active menu trigger before emitting its action,
  giving menu-opened dialogs a stable focus restoration target. Settings and
  Shortcuts Help Escape behavior was verified in the browser.
- Shared application and Camera menus now open on the first or last item from
  ArrowDown/ArrowUp, move sequentially with wrapping, support Home/End, and
  close when Tab moves focus out. Unavailable commands remain focusable and
  cannot activate. Menu items have one managed focus path rather than each
  being a page Tab stop.
- The reduced-motion stylesheet now covers the complete application root and
  CDK overlays, so Projects page transitions receive the same duration clamp as
  Workspace transitions.
- Shared dialog close controls use neutral text and surface-hover colors;
  destructive actions retain their semantic danger styling.
- Project Diagnostics now focuses its labeled heading on open and describes the
  smoothed render interval as including idle time.
- Asset Manager starts on its selected Vanilla tab and supports roving keyboard
  focus across the Vanilla and Mods panels.
- Settings Appearance tabs keep only the selected tab in the Tab sequence,
  support ArrowLeft/Right with wrapping and Home/End, and let Tab continue into
  the active panel. Focus was checked in all four themes and both locales.
- Decorations and Groups sidebar tabs use Arrow/Home/End roving focus; mobile
  labels remain clear of tooltips, and Manage sources no longer expands the
  Decorations panel's horizontal scroll range.
- Quick Bar exposes its expanded state on the keyboard-operated disclosure;
  autosave feedback is a polite status announcement in both locales.
- Sidebar separators expose localized names and current resize ranges; keyboard
  resizing follows the same clamp as pointer resizing, and focus transfers to
  the matching mobile opener when a separator becomes hidden.
- Block Browser empty results now explain the state in a dedicated live region
  and offer a keyboard-accessible Clear search action that restores focus.
- On narrow viewports, sidebar drawers cover the viewport so their controls and
  results are no longer clipped by the shorter editor work area.
- On narrow viewports, Camera actions wrap within the toolbar for every font.
  On short screens the shell grows only as needed and retains a minimum editor
  body height, keeping the Quick Bar below the mobile drawer openers.
- Native Tab reaches the last virtualized Block Browser item; its compact-row
  quick-add tooltip now flips above the control and remains visible.
- Block Browser cards show their canonical registry ID and include it in the
  accessible selection name; touch devices keep Quick Add visible with a 24 px
  target. Four themes and both locales were checked at 390 x 520.
- Unavailable vanilla assets announce the error separately from the Retry and
  Asset Manager recovery controls; keyboard focus returns after the dialog.
- Sidebar widths constrained by a narrow viewport are transient. Only an
  actual pointer drag or keyboard resize updates the saved width.
- The Inspector renders a selected vanilla block's exact ID, position, group,
  BlockState, editable properties, and derived-property state. Pointer and
  keyboard interaction both changed Oak Stairs `facing`; the synthetic project
  was restored to its original `north` value afterward.
- Populated Block Usage was checked with one Stone and with Stone plus Oak
  Stairs; totals, unique types, missing count, exact IDs, and percentage shares
  matched the synthetic project's contents.
- External AI inner tabs now size to their labels and scroll horizontally when
  needed at 320 px; the existing keyboard-focus scrolling keeps the selected
  tab visible without adding document-level horizontal overflow.
- External AI copy success/error and description-validation feedback scroll
  into view after rendering; pending scroll frames are canceled on replacement
  and component destruction.
- Content Limits candidates are independent native checkboxes; their container
  exposes a group name from the visible heading. Chrome verified the group and
  mobile candidate-list layout without document-level horizontal overflow; see
  [the desktop and mobile captures](evidence/current-run-20261017/README.md#content-limits-checkbox-group).
- Workspace input and textarea placeholders use the active theme's secondary
  text without browser-default opacity. Block Browser search measured at least
  5.50:1 across all four themes; the broader External AI scan found no normal
  text pair below 4.5:1. Source and before/after captures are indexed in the
  [Workspace placeholder evidence](evidence/current-run-20261017/README.md#workspace-form-placeholder-contrast)
  and [Content Limits evidence](evidence/current-run-20261017/README.md#content-limits-checkbox-group).

The 45 functional-reference screenshots mentioned in the project objective
were not present in the repository or attached files. The user confirmed to
continue from source and existing documentation, so this matrix records that
gap rather than inventing reference behavior. Full Workspace acceptance is
still open, including a trusted mod JAR fixture, the remaining External AI
content/mod-fixture and broader interaction audit, diagnostics, the remaining
theme/locale/font combinations, keyboard traversal through longer
virtualized lists, and reduced motion. The repository contains the independent
Java 1.21.1 NBT fixture at
`Frontend/src/app/core/persistence/minecraft-structure/fixtures/golden_1_21_1.nbt`;
codec tests use it. The browser exported and decoded a non-empty two-block
Structure NBT and datapack ZIP in this pass; loading the output in Minecraft
remains pending. NBT import is not exposed in the Workspace File menu.

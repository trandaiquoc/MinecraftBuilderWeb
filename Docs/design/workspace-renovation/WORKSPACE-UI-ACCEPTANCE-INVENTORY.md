# Workspace UI acceptance inventory

**Status:** in progress. This is a working audit matrix, not a claim that
Workspace acceptance is complete. Evidence is split between the current
browser pass and the earlier captures catalogued in
[Workspace renovation evidence](README.md).

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
| App shell, menus, header, toolbar                                 | Good in recorded four-theme passes                                                                         | Menus align inside 390 px and 320 px viewports; long labels wrap at 320 px without page overflow                            | Arrow/Home/End menu navigation, Tab dismissal, Escape trigger return, and focus-out dismissal verified; reduced motion remains open | Low                        | [Current shell, mobile menu, and keyboard captures](evidence/current-run-20261017/README.md); menu alignment checked in four themes and both locales |
| Block Browser and search                                          | No-results and unavailable-assets recovery states verified across themes                                   | Clear search restores 906 results; 390×520 drawer keeps search/errors visible without document overflow                     | Tab reaches the last virtual row and recovery buttons; asset failure is announced with role=alert                             | Low                        | [Current search, error, drawer, and last-row captures](evidence/current-run-20261017/README.md); real network retry remains open      |
| Decorations and Groups                                            | Good in current Dark captures                                                                              | Decorations view and empty Groups state verified at 390×520 with no horizontal overflow                                      | Arrow/Home/End roving focus; Tab enters the active panel; Escape closes the drawer and restores focus to its opener             | Low                        | [Current sidebar tab captures and measurements](evidence/current-run-20261017/README.md); visible-label tooltips no longer cover tabs |
| Inspector and BlockState                                          | Selected Stone and Oak Stairs captured in Dark; mobile detail and control states also captured             | Exact ID, position, group, and state values shown; Facing changed by pointer and keyboard; narrow drawer scrolls internally | Combobox exposes active option; Escape closes only its popup; Tab advances to Half and closes it; focus treatment checked in all themes and locales | Low | [Current selected-block and combobox evidence](evidence/current-run-20261017/README.md); two-block synthetic project |
| Block Usage                                                       | User-approved design retained; populated current Dark state captured                                       | 1-block and 2-type states show totals, missing count, exact IDs, counts, and shares                                         | Tab and Enter activated the first row and toggled its highlight; virtualized keyboard traversal across more rows remains open | Low                        | [Current populated captures](evidence/current-run-20261017/README.md) plus prior four-theme populated captures in [README](README.md) |
| Quick Bar and Status Bar                                          | Expanded and collapsed Quick Bar captured in Dark; no layout change across four themes                     | Enter collapses/expands without losing focus; 390×520 and Vietnamese 320×520 footer fit without horizontal overflow          | `aria-expanded` tracks the Quick Bar; save status announces Saved, Saving, and Save error politely in EN/VI                     | Low                        | [Current collapse screenshot and announcement checks](evidence/current-run-20261017/README.md); add/remove of Stone remains verified    |
| Settings: General, Appearance, Controls, Shortcuts, Accessibility | All five sections and Workspace Background captured in Dark                                                | Desktop and 640×520/390×520 dialog layout captured; initial focus starts at General                                         | Escape closes an open select only; Tab dismisses its popup and continues through Settings; the dialog stays open              | Medium                     | [Current select and keyboard evidence](evidence/current-run-20261017/README.md) plus earlier section captures                         |
| Structure JSON import/export                                      | Round trip, error recovery, initial focus, and keyboard tab switching captured in Dark                     | Two-block round trip and valid retry verified; footer remains visible at 390 x 520; invalid input cannot be applied         | Errors use role=alert; outer Arrow/Home/End navigation; Escape restores File focus                                            | Medium                     | [Current round-trip evidence](evidence/current-run-20261017/README.md); NBT import is not exposed by the File menu                    |
| Create with AI / External AI                                      | Existing panels and five tabs recorded                                                                     | Keyboard tab selection and copy success verified; mobile focus scrolls into view at 390 x 520                               | Inner Arrow/Home/End navigation and visible focus verified; reduced motion remains to recheck                                 | Medium                     | [Current keyboard evidence](evidence/current-run-20261017/README.md); earlier interaction notes in [README](README.md)                |
| NBT / Datapack export                                             | Both download modes captured in Dark; datapack also captured at 390 x 520                                  | Two-block ZIP and standalone NBT downloaded and decoded; fixed footer remains visible on mobile                             | Close returns focus to File; recheck validation announcements; Minecraft load remains pending                                 | Medium                     | [Current decoded exports](evidence/current-run-20261017/README.md); golden fixture is codec-tested                                    |
| Asset Manager and Mod Import                                      | Vanilla and empty Mods tabs plus help overlay captured in Dark                                               | 1600 x 900 and 390 x 520 layouts fit; dialog scrolls internally with no horizontal overflow                                 | Help opens on first click; blur, Escape, and outside click dismiss it without closing the dialog                              | High                       | [Current tab and help-overlay evidence](evidence/current-run-20261017/README.md); loading/error recovery and trusted mod JAR fixture remain open |
| Project Diagnostics                                               | Expanded mixed findings captured across all four themes; compatibility remains grouped and collapsed by default | Errors, a real partial-behavior warning, and unknown-behavior info stay distinct; filters announce matching counts      | Placement validity is not inferred from behavior coverage; browser cases and current UI contract recorded                    | High                       | [Current Diagnostics captures](evidence/current-run-20261017/README.md); no placement-validity finding is defined in this report      |
| Help, shortcuts, dialogs                                          | Existing help and shortcut UI recorded; shared close control is now neutral                                | Confirm close/cancel/apply/save behaviors after style changes                                                               | Settings and Shortcuts Help focus return verified; recheck remaining dialogs and reduced motion                               | Medium                     | Current Settings/Help focus-return captures plus earlier captures in [README](README.md)                                              |
| Context menus, tooltips, overlays                                 | Existing menu stacking fix, tooltip, Asset Manager help, and select popup states documented                | All six application menus are reachable at 320 px in Vietnamese; long File labels wrap and tall popovers scroll internally | Menus and selects dismiss on keyboard focus changes; nested Escape closes the active popup without dismissing its owner         | Medium                     | [Current menu, help, and select evidence](evidence/current-run-20261017/README.md) plus prior context-menu captures in [README](README.md) |
| Loading, empty, error, warning, success states                    | Several states have dedicated recorded captures                                                            | Current empty Groups/Block Usage and Quick Bar add/remove states verified                                                   | Recheck live regions and recovery actions                                                                                     | Medium                     | Current captures plus state notes in [README](README.md)                                                                              |
| Responsive layout and sidebar resizing                            | Dark shell and keyboard focus captured at 1600×900 and 780×437; narrow drawers still fit at 390×520         | Arrow keys resize within the reported range; 851 px clamp preserves a 320 px center; responsive controls fit without overflow | Separators expose localized names/ranges; focus transfers to the matching drawer opener when the handle hides                  | Low                        | [Current resize and responsive focus evidence](evidence/current-run-20261017/README.md); saved widths restored to 260/230 px            |
| Preferences, locale, fonts, workspace backgrounds                 | All four themes and both locales captured at 1600×900; Comfortaa compact shell at 780×437; all fonts at 390×520 EN/VI in Minecraft theme | Font fit in other themes at narrow widths and independent Dark/Light/Reality background choices remain open             | Menu-item focus checked in all theme/locale combinations; formal contrast and Small/Large font-size preference matrix remain open | Medium                  | [Theme/font and viewport matrices](evidence/current-run-20261017/README.md#workspace-theme-and-font-matrix) plus existing responsive captures |
| Animation and reduced motion                                      | Default and reduced-motion states captured for Projects and Workspace menus                                | No layout change between motion preferences                                                                                 | The app-wide rule clamps animations and transitions to 1 ms and disables smooth scrolling; remaining animated states still need a pass | Low | [Reduced-motion captures and computed styles](evidence/current-run-20261017/README.md#reduced-motion-across-projects-and-workspace); check remaining animated states and locales |
| Renderer, large structures, project data                          | Existing 110,592-block browser evidence is recorded                                                        | No renderer, persistence, or domain behavior changed in this pass                                                           | Not applicable to current source edits                                                                                        | Low                        | Earlier renderer evidence in [README](README.md); rerun benchmark only if renderer code changes                                       |

## Latest acceptance update

| Area | Result | Evidence |
| --- | --- | --- |
| Settings Appearance inner tabs | Verified one tab stop, ArrowLeft/Right wrapping, Home/End, Tab into the selected panel, and visible focus across all four themes and both locales | [Appearance tab captures and browser notes](evidence/current-run-20261017/README.md#settings-appearance-tab-keyboard-navigation) |
| Structure JSON and Minecraft Structure export dialogs | Escape closes each dialog and restores visible focus to File; NBT dialog scrolls internally with its footer visible | [Current export dialog flow and focus return](evidence/current-run-20261017/README.md#file-export-dialog-close-and-focus-return) |
| Application menu keyboard navigation | Arrow keys move sequentially and wrap; Home/End jump to the ends; Tab dismisses the popup; Escape returns visible focus to the trigger | [Application menu keyboard evidence](evidence/current-run-20261017/README.md#application-menu-keyboard-navigation) |
| Application menu focus across themes and locales | Help menu first-item focus ring visible in all four themes and both English and Vietnamese; labels fit at 1600×900 without horizontal overflow | [Eight-state focus matrix](evidence/current-run-20261017/README.md#application-menu-focus-across-themes-and-locales); formal contrast ratios, other menu items, fonts, and viewports remain open |
| Workspace typography combinations | All 12 theme/font combinations and both English and Vietnamese locales rendered with loaded fonts and no document horizontal overflow at 1600×900 | [24-state Workspace font matrix](evidence/current-run-20261017/README.md#workspace-theme-and-font-matrix); narrow viewport, Small/Large font-size settings, and formal contrast checks remain open |
| Compact Workspace shell | Closed shell wraps its toolbar, exposes drawer openers, and has no document overflow across four themes and EN/VI at 780×437 | [Eight-state compact shell matrix](evidence/current-run-20261017/README.md#compact-workspace-shell-across-themes-and-locales); drawer contents are handled by their own viewport checks |
| Narrow Workspace font sample | All three fonts loaded without document overflow at 390×520 in Minecraft theme, EN/VI; Vietnamese header, toolbar, and status bar wrap to extra rows | [Six-state narrow font sample](evidence/current-run-20261017/README.md#narrow-workspace-font-sample); other themes at narrow widths remain open |
| Project Diagnostics and About dialogs | Both Escape paths close the dialog and return visible focus to Tools or Help; no focus-return issue found | [Diagnostics and About focus-return captures](evidence/current-run-20261017/README.md#project-diagnostics-and-about-focus-return) |
| Reduced motion across Projects and Workspace | The project-row transition dropped from 120 ms to 1 ms; menu entry animation and trigger transitions also reduce to 1 ms | [Default/reduced captures and computed-style measurements](evidence/current-run-20261017/README.md#reduced-motion-across-projects-and-workspace) |

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
- Native Tab reaches the last virtualized Block Browser item; its compact-row
  quick-add tooltip now flips above the control and remains visible.
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

The 45 functional-reference screenshots mentioned in the project objective
were not present in the repository or attached files. The user confirmed to
continue from source and existing documentation, so this matrix records that
gap rather than inventing reference behavior. Full Workspace acceptance is
still open, including a trusted mod JAR fixture, External AI, diagnostics, the
remaining theme/locale/font combinations, keyboard traversal through longer
virtualized lists, and reduced motion. The repository contains the independent
Java 1.21.1 NBT fixture at
`Frontend/src/app/core/persistence/minecraft-structure/fixtures/golden_1_21_1.nbt`;
codec tests use it. The browser exported and decoded a non-empty two-block
Structure NBT and datapack ZIP in this pass; loading the output in Minecraft
remains pending. NBT import is not exposed in the Workspace File menu.

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
| App shell, menus, header, toolbar                                 | Good in recorded four-theme passes                                                                         | Good at desktop and narrow widths; menu stacking was previously fixed                                                       | Recheck keyboard traversal and reduced motion                                                                                 | Low                        | [Current four-theme shell captures](evidence/current-run-20261017/README.md); recheck all menus after remaining changes               |
| Block Browser and search                                          | No-results and unavailable-assets recovery states verified across themes                                   | Clear search restores 906 results; 390×520 drawer keeps search/errors visible without document overflow                     | Tab reaches the last virtual row and recovery buttons; asset failure is announced with role=alert                             | Low                        | [Current search, error, drawer, and last-row captures](evidence/current-run-20261017/README.md); real network retry remains open      |
| Decorations and Groups                                            | Good in current Dark captures                                                                              | Decorations view and empty Groups state verified at 390×520 with no horizontal overflow                                      | Arrow/Home/End roving focus; Tab enters the active panel; Escape closes the drawer and restores focus to its opener             | Low                        | [Current sidebar tab captures and measurements](evidence/current-run-20261017/README.md); visible-label tooltips no longer cover tabs |
| Inspector and BlockState                                          | Selected Stone and Oak Stairs captured in Dark; mobile detail and control states also captured             | Exact ID, position, group, and state values shown; Facing changed by pointer and keyboard; narrow drawer scrolls internally | Combobox name and option menu verified at 390 x 520; continue keyboard traversal in the drawer and other themes               | Low                        | [Current selected-block evidence](evidence/current-run-20261017/README.md); two-block synthetic project                               |
| Block Usage                                                       | User-approved design retained; populated current Dark state captured                                       | 1-block and 2-type states show totals, missing count, exact IDs, counts, and shares                                         | Tab and Enter activated the first row and toggled its highlight; virtualized keyboard traversal across more rows remains open | Low                        | [Current populated captures](evidence/current-run-20261017/README.md) plus prior four-theme populated captures in [README](README.md) |
| Quick Bar and Status Bar                                          | Expanded and collapsed Quick Bar captured in Dark; no layout change across four themes                     | Enter collapses/expands without losing focus; 390×520 and Vietnamese 320×520 footer fit without horizontal overflow          | `aria-expanded` tracks the Quick Bar; save status announces Saved, Saving, and Save error politely in EN/VI                     | Low                        | [Current collapse screenshot and announcement checks](evidence/current-run-20261017/README.md); add/remove of Stone remains verified    |
| Settings: General, Appearance, Controls, Shortcuts, Accessibility | All five sections and Workspace Background captured in Dark                                                | Desktop and 640×520/390×520 dialog layout captured; initial focus starts at General                                         | Tab to Accessibility and Enter select it; the narrow nav scrolls the selected button into view without document overflow      | Medium                     | Current captures and focus/responsive notes in [evidence index](evidence/current-run-20261017/README.md)                              |
| Structure JSON import/export                                      | Round trip, error recovery, initial focus, and keyboard tab switching captured in Dark                     | Two-block round trip and valid retry verified; footer remains visible at 390 x 520; invalid input cannot be applied         | Errors use role=alert; outer Arrow/Home/End navigation; Escape restores File focus                                            | Medium                     | [Current round-trip evidence](evidence/current-run-20261017/README.md); NBT import is not exposed by the File menu                    |
| Create with AI / External AI                                      | Existing panels and five tabs recorded                                                                     | Keyboard tab selection and copy success verified; mobile focus scrolls into view at 390 x 520                               | Inner Arrow/Home/End navigation and visible focus verified; reduced motion remains to recheck                                 | Medium                     | [Current keyboard evidence](evidence/current-run-20261017/README.md); earlier interaction notes in [README](README.md)                |
| NBT / Datapack export                                             | Both download modes captured in Dark; datapack also captured at 390 x 520                                  | Two-block ZIP and standalone NBT downloaded and decoded; fixed footer remains visible on mobile                             | Close returns focus to File; recheck validation announcements; Minecraft load remains pending                                 | Medium                     | [Current decoded exports](evidence/current-run-20261017/README.md); golden fixture is codec-tested                                    |
| Asset Manager and Mod Import                                      | Vanilla and empty Mods tabs captured in Dark                                                               | 1600 x 900 and 390 x 520 layouts fit; dialog scrolls internally with no horizontal overflow                                 | Vanilla gets initial focus; Arrow/Home/End navigate tabs; Escape restores focus to Tools                                      | High                       | [Current tab evidence](evidence/current-run-20261017/README.md); loading/error recovery and trusted mod JAR fixture remain open       |
| Project Diagnostics                                               | Expanded mixed findings captured across all four themes; compatibility remains grouped and collapsed by default | Errors, a real partial-behavior warning, and unknown-behavior info stay distinct; filters announce matching counts      | Placement validity is not inferred from behavior coverage; browser cases and current UI contract recorded                    | High                       | [Current Diagnostics captures](evidence/current-run-20261017/README.md); no placement-validity finding is defined in this report      |
| Help, shortcuts, dialogs                                          | Existing help and shortcut UI recorded; shared close control is now neutral                                | Confirm close/cancel/apply/save behaviors after style changes                                                               | Settings and Shortcuts Help focus return verified; recheck remaining dialogs and reduced motion                               | Medium                     | Current Settings/Help focus-return captures plus earlier captures in [README](README.md)                                              |
| Context menus, tooltips, overlays                                 | Existing menu stacking fix and tooltip states documented                                                   | Last virtualized row's Quick Bar tooltip flips up and stays inside the tile                                                 | Recheck menu dismissal and other overlay hit targets                                                                          | Medium                     | [Current last-row tooltip evidence](evidence/current-run-20261017/README.md) plus prior menu captures in [README](README.md)          |
| Loading, empty, error, warning, success states                    | Several states have dedicated recorded captures                                                            | Current empty Groups/Block Usage and Quick Bar add/remove states verified                                                   | Recheck live regions and recovery actions                                                                                     | Medium                     | Current captures plus state notes in [README](README.md)                                                                              |
| Responsive layout and sidebar resizing                            | Current Dark shell verified at 1600×900, 780×437, and 390×520; narrow drawers now use full viewport height | Viewport resize clamps columns without overwriting saved widths; drawer controls and empty results fit at 390×520           | Recheck keyboard resize and focus at all breakpoints                                                                          | Medium                     | [Current drawer and search captures](evidence/current-run-20261017/README.md); automated resize-session specs added                   |
| Preferences, locale, fonts, workspace backgrounds                 | Four themes captured; earlier tests cover available preferences                                            | Recheck EN/VI, Comfortaa/Chakra Petch/Pangolin, and independent Dark/Light/Reality background choices                       | Recheck contrast and focus in every theme                                                                                     | Medium                     | Prior palette and contrast records in [README](README.md); current pass is English/Comfortaa                                          |
| Animation and reduced motion                                      | Existing shared transitions use semantic state; this pass adds no animation                                | No layout motion regression identified in the current changes                                                               | Full reduced-motion browser pass remains open                                                                                 | Low                        | Recheck every changed transition under `prefers-reduced-motion` before Workspace acceptance                                           |
| Renderer, large structures, project data                          | Existing 110,592-block browser evidence is recorded                                                        | No renderer, persistence, or domain behavior changed in this pass                                                           | Not applicable to current source edits                                                                                        | Low                        | Earlier renderer evidence in [README](README.md); rerun benchmark only if renderer code changes                                       |

## Current code changes under review

- Settings opens with its General section as the initial focus target, avoiding
  automatic focus on the red destructive-looking Close control.
- Chrome returns focus to the active menu trigger before emitting its action,
  giving menu-opened dialogs a stable focus restoration target. Settings and
  Shortcuts Help Escape behavior was verified in the browser.
- Shared dialog close controls use neutral text and surface-hover colors;
  destructive actions retain their semantic danger styling.
- Project Diagnostics now focuses its labeled heading on open and describes the
  smoothed render interval as including idle time.
- Asset Manager starts on its selected Vanilla tab and supports roving keyboard
  focus across the Vanilla and Mods panels.
- Decorations and Groups sidebar tabs use Arrow/Home/End roving focus; mobile
  labels remain clear of tooltips, and Manage sources no longer expands the
  Decorations panel's horizontal scroll range.
- Quick Bar exposes its expanded state on the keyboard-operated disclosure;
  autosave feedback is a polite status announcement in both locales.
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

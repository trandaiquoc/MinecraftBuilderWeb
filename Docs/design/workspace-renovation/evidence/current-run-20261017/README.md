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

## Workspace panels and responsive shell

| State / viewport                                   | Capture                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Dark shell, 780×437                                | [workspace-editor-dark-780x437-20261017.png](workspace-editor-dark-780x437-20261017.png)                               |
| Dark shell, after resizing back to 1600×900        | [workspace-editor-dark-after-resize-1600x900-20261017.png](workspace-editor-dark-after-resize-1600x900-20261017.png)   |
| Dark shell, 390×520                                | [workspace-editor-dark-after-resize-390x520-20261017.png](workspace-editor-dark-after-resize-390x520-20261017.png)     |
| Dark shell with narrow-screen drawer open, 390×520 | [workspace-editor-dark-390x520-drawer-after-20261017.png](workspace-editor-dark-390x520-drawer-after-20261017.png)     |
| Decorations                                        | [workspace-decoration-dark-en-1600x900-20261017-final.png](workspace-decoration-dark-en-1600x900-20261017-final.png)   |
| Empty Groups state                                 | [workspace-groups-empty-dark-en-1600x900-20261017.png](workspace-groups-empty-dark-en-1600x900-20261017.png)           |
| Quick Bar with Stone added                         | [workspace-quickbar-stone-dark-en-1600x900-20261017.png](workspace-quickbar-stone-dark-en-1600x900-20261017.png)       |
| Empty Block Usage                                  | [workspace-block-usage-empty-dark-en-1600x900-20261017.png](workspace-block-usage-empty-dark-en-1600x900-20261017.png) |

Stone was added to and then removed from the Quick Bar through the UI. The
project stayed at zero placed blocks. Existing 2026-10-16 evidence in the
[Workspace renovation index](../../README.md) covers populated Block Usage,
data-heavy flows, menus, diagnostics, and renderer output.

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
- The narrow Workspace drawer and the 780×437 shell fit without document-level
  horizontal overflow.

Verification for the current code: full suite passed with `--isolate=false`
(308 files passed, 7 skipped; 1,923 tests passed, 11 skipped), production
build, app/spec/worker TypeScript checks, tool tests (2/2), encoding, Prettier,
and `git diff --check` passed. The default worker-isolated full-suite run
failed with Vitest worker timeouts and IPC errors; the successful run disabled
test isolation. This set is not whole-Workspace acceptance: BlockState,
non-empty import and export, trusted mod/JAR fixtures, External AI,
diagnostics, all locales and fonts, focus return for remaining dialogs, and
reduced-motion behavior
still require explicit rechecks.

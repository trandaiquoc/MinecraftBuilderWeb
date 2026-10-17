# Workspace Presentation Audit — 2026-10-17

This dated audit records a current browser review of the Workspace shell and
Settings menu. It does not close the broader Workspace visual acceptance.

## Audit scope

- Workspace 3D Edit shell: global toolbar, Block Browser, no-selection
  inspector, Quick Bar hint, and Status Bar.
- Dark, Light, Minecraft, and Raccoon themes at 1600 × 1280, compared with the
  approved frames at the same dimensions.
- Settings popover keyboard navigation and responsive bounds at 320 × 640 in
  English and Vietnamese.

## User goal and accessibility target

Open and use a structure in the editor, recognize the active visual theme, and
reach language and appearance settings from a narrow viewport by keyboard.
Review includes visible focus, menu reading order, keyboard movement, and
responsive reflow. It is not a full WCAG conformance audit.

## Steps and findings

1. **Review the Workspace shell in four themes.** The three-column shell, tool
   controls, no-selection inspector, canvas, and bottom status remain legible
   across the four palettes. The app keeps its renderer background independent
   from the interface theme, as required by the Workspace palette contract.
   Each comparison uses the approved 1600 × 1280 reference size.
2. **Open Settings at 320 × 640 and move to the last option with End.** Before
   the change, focus moved to the `Reality` menu item while its button extended
   below the menu's visible edge: the menu bottom was 558.8 px and the item
   bottom was 567.6 px. The focused option could be clipped.
3. **Repeat End after the fix.** Keyboard focus now scrolls the menu to the
   focused option. The menu scroll position reached 15 px; the `Reality`
   button ended at 552.6 px inside the 558.8 px menu edge. The 2 px focus
   outline is visible, and the document remains 320 px wide.
4. **Review the translated menu in Vietnamese.** The menu grows to about 210 px
   wide and remains inside the 320 px viewport. The header wraps `Trợ giúp` to
   a second line. The menu keeps its own scroll area, and the document does
   not overflow horizontally.
5. **Compare the header project context to the approved desktop reference.**
   The reference includes the active Minecraft version. The app now displays
   the selected project's saved version beside its name. At 390 px the project
   name and badge both fit; at 320 px the badge leaves the visual layout while
   remaining in the DOM instead of being removed with `display: none`.
   Screen-reader announcement quality was not tested. The badge's background,
   text, and border resolve to each of the four theme palettes.
6. **Close the menu with Escape.** Focus returns to the Settings trigger. The
   isolated browser is restored to `/editor`, Dark theme, English, 3D Edit,
   Place tool, and no open dialogs. The existing one-block project was not
   changed.

## Strengths

- The shell's layout and theme palettes remain consistent across the four
  approved compositions.
- The header identifies the active project's Minecraft Java version from
  saved project metadata without assuming a mod loader.
- The Settings menu has menu-item semantics and supports arrow movement,
  Home/End, and Escape.
- At 320 px, the menu stays within the page width in both locales and keeps
  its content in an independent scroll area.

## UX and accessibility risks

- The End-key focus target was clipped before this change; this is corrected
  and verified in the browser.
- The menu overlays much of the canvas at 320 px while open. Its controls stay
  visible and operable, and the menu closes with Escape.
- Screenshots and DOM checks cannot establish screen-reader announcement
  quality. No claim of full accessibility compliance is made.

## Evidence limits and remaining work

The isolated browser already contained one block and the vanilla catalog. The
approved frames show a large structure and extra mod assets. Those content
differences were not recreated or treated as UI failures; no project or asset
data was added for this review. Asset Manager import progress and failure
states still need the compatible Fabric mod JAR described in the
[acceptance inventory](../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md). The
remaining Workspace surfaces and workflows also require review before full
visual acceptance.

## Recommendations

- Keep focused menu items scrolled into view whenever menu keyboard navigation
  changes the active item.
- Continue the Workspace review across remaining surfaces and workflows; keep
  the real mod JAR checkpoint explicit.

## Captures

- [Dark shell](01-workspace-dark-1600x1280.png)
- [Light shell](02-workspace-light-1600x1280.png)
- [Minecraft shell](03-workspace-minecraft-1600x1280.png)
- [Raccoon shell](04-workspace-raccoon-1600x1280.png)
- [Settings menu before the focus-scroll fix](05-settings-menu-reality-focused-before-dark-320x640.png)
- [Settings menu after the focus-scroll fix](06-settings-menu-reality-focused-after-dark-320x640.png)
- [Vietnamese Settings menu](07-settings-menu-vietnamese-dark-320x640.png)
- [Project version in the desktop header](08-project-version-in-header-dark-1600x1280.png)
- [Project version beside the full name at 390 px](09-project-version-narrow-390x844.png)
- [Compact project context at 320 px](10-project-context-compact-dark-320x640.png)

# Workspace UI Renovation QA

**Final result: blocked**

The latest targeted interaction pass improves the toolbar's mode/tool selection and removes a 2 px Minecraft-only header layout shift. This does not close the end-to-end renovation: the outstanding P1 composition and untouched dialog/workflow findings below remain blockers.

## Evidence

- Approved visual sources: `/tmp/laundromat-stitch-approved/stitch_block_laundromat_workspace_design_system/workspace_{minecraft_theme,raccoon_theme,light_theme,dark_theme}/screen.png` (each 1600 x 1280 px).
- Full-view comparison: `/tmp/workspace-theme-qa-same-viewport.png` (all four source/implementation pairs in one image).
- Implementation captures: `/tmp/workspace-renovation-{craft,raccoon,light,dark}-1600x1280.png` (each 1600 x 1280 CSS px, device scale factor 1).
- Focused responsive captures: `/tmp/workspace-sidebar-tabs-1440-final.png`, `/tmp/workspace-sidebar-tabs-640-open.png`, `/tmp/json-import-{1440x900,780x437,640x520}.png`, `/tmp/ai-tabs-640.png`, and `/tmp/settings-appearance-vi-780x437.png`.
- Latest same-state toolbar captures: `Docs/design/workspace-renovation/evidence/workspace-segmented-{craft,raccoon,light,dark}-20261016.png` (1600 x 1200 each).
- Selection inspector captures: `Docs/design/workspace-renovation/evidence/selection-inspector-{theme}-20261016.png` and `selection-inspector-stone-{theme}-20261016.png` for craft, raccoon, light, and dark (1600 x 1200 each).
- Updated unified toolbar-switcher captures: `Docs/design/workspace-renovation/evidence/toolbar-switcher-{craft,raccoon,light,dark}-20261016.png` (1600 px wide, top 125 px; same Chrome project state).
- The comparison sheet preserves aspect ratio and fits each 1600 x 1280 image into an 800 x 640 cell without cropping. Source and implementation therefore share viewport dimensions and scale before normalization.

The earlier comparison captures use the same saved 16 x 16 x 16 project with zero placed blocks, camera, font (Chakra Petch, Normal), workspace background (Dark), locale (English), sidebar widths (180 px / 200 px), and viewport. Only the UI theme changes; the persisted theme was restored to `craft` after capture. These are historical comparison images; the newer dated captures listed above use a separate controlled state documented in `Docs/design/workspace-renovation/README.md`. The references show different sample content, including a simulated large structure and performance readouts. Those are not equivalent runtime states and were not copied; the editor screenshot shows the real canvas and current project.

## Findings

- **[P1] Full Workspace renovation remains incomplete.** The shell still differs materially in composition and control density from the approved screens, and most requested surfaces (Asset Manager, Mod Import, Diagnostics, Export, inspectors, Groups, Quick Bar, and other dialogs) were not redesigned in this implementation. The current work closes targeted reset, scrolling, and narrow-tab regressions; it does not satisfy the requested end-to-end visual renovation.
- **[P2] Raccoon treatment needs further visual iteration.** The implementation uses the shared charcoal theme and rounded controls, but the side-by-side view does not yet communicate the softer, cushioned/fluffy character of the approved reference as clearly. No new decorative treatment was added in this scoped pass.
- **Expected comparison difference:** the saved sidebar widths are narrower than the reference composition. They were preserved rather than overwritten; the comparison uses the user's actual persisted layout.

## Verified fixes and iteration evidence

- Appearance Interface reset now changes only theme, font, and font size; Workspace Background reset changes only background and Reality presets. Browser interaction verified Interface defaults (Minecraft, Comfortaa, Normal), Background defaults (Dark, Plains grass, Overworld day), and unchanged persisted preferences before Cancel/Discard. Settings session tests cover independent resets, Apply, Cancel, Save & Close, and draft behavior.
- Import JSON was exercised in Chrome at 1440 x 900, 780 x 437, and 640 x 520. Header, main tabs, and footer stayed available; the source editor and validation content scrolled; long validation results and Import Mode remained reachable. The 640 px layout uses the outer import content as its scroll owner while preserving textarea scrolling.
- Create with AI's five tabs were exercised with long content. At 640 x 520, active-panel scrollHeight/clientHeight were: Description 555/278, Available content 548/278, Content limits 1216/278, AI guidance 1917/278, JSON example 1679/278. Wheel/keyboard scrolling changed the active scroll position. At short/narrow viewports, the workspace host owns scrolling; ordinary viewports use the active panel. Prompt data was retained across tab changes.
- A browser review found the Groups tab clipped at the persisted 180 px sidebar. The left tab row was changed to three equal columns with single-line truncation; Chrome verified all three tabs at 180 px and full labels in the 360 px responsive drawer. Post-fix captures are linked above.
- The 3D/Y-Layer and Place/Select choices render in one continuous radio track per pair: a single sliding selected surface, a subdued alternate, and no gap between individual options. The switcher supports click, keyboard arrows/Home/End, and pointer drag across the same track. Chrome verified dragging both controls in either direction, `aria-checked` exclusivity, and no horizontal document overflow in Minecraft, Raccoon, Light, and Dark. Selected-label contrast is 9.00:1 / 5.79:1 / 13.32:1 / 11.48:1; subdued-label contrast is 4.74:1 / 6.26:1 / 6.04:1 / 7.94:1 in the same theme order.
- Chrome measured the Workspace body top at y=113.656 px in Minecraft, Raccoon, Light, and Dark. Minecraft's bottom separator is now inset-painted rather than layout-affecting, preserving its visible chrome treatment without the former 2 px theme shift.
- At 780 x 437 and 640 x 520, both segmented groups kept equal-width options without horizontal document overflow. Keyboard focus remained visible, and reduced-motion emulation reduced both indicator transitions to 0.001 seconds.
- The Selection inspector now groups the existing Select All, Clear Selection, Fit Structure, and Focus Selection commands near project overview. Chrome verified the no-selection disabled states, placed one Stone through a real canvas click, selected it through the Select tool, and confirmed its ID/position/state plus enabled Focus Selection. At a 200 px right sidebar, action labels and empty-state guidance fit without document overflow. EN and VI strings were checked in the live app.
- Browser review caught and fixed an intermediate contrast issue: overview labels and empty-state heading now sit on their semantic raised panel surface, while Quick Actions stays on the sidebar surface. Measured foreground/background tokens were inspected in all four themes; Raccoon uses its own charcoal levels, not the near-black Dark palette.

## Fidelity surfaces

- **Typography:** four themes use the same selected Chakra Petch UI font and consistent hierarchy in the captures. Full font-size and font-choice visual comparison across every dialog is not complete.
- **Spacing/layout:** shell proportions and overall density still diverge from the reference; the saved narrow sidebars are an intentional runtime state, while many other requested surfaces remain untouched.
- **Colors/tokens:** Minecraft keeps the grass/dirt transition, Light remains neutral, Dark near-black, and Raccoon charcoal. This pass did not audit every control's contrast against WCAG AA.
- **Images/assets:** the official logo and real viewport canvas are used. No fake structure, metrics, or generated UI imagery was introduced.
- **Copy/content:** English and Vietnamese Settings were checked at 780 x 437; long AI and validation content was checked in English. A complete EN/VI review across all dialogs is outstanding.

## Runtime and test notes

- Chrome CDP interaction produced no JavaScript exceptions, application console errors, or failed network requests during the checked Settings path.
- Browser warnings: Angular `NG02960` reports that the unchanged official SVG logo's 1774 x 887 intrinsic raster is larger than its rendered size; Chromium also reports automatic software-WebGL fallback deprecation. The latter is a headless/browser diagnostic. Neither was changed in this UI pass.
- Automated verification after these toolbar/inspector changes passed: full frontend tests (306 passed, 7 skipped; 1,897 passed, 11 skipped), app/spec/worker TypeScript checks, production build (1.77 MB initial raw bundle; editor shell remains lazy-loaded), tool tests (2/2), encoding check, Prettier, and `git diff --check`. The test runner prints jsdom `HTMLCanvasElement.getContext()` not-implemented diagnostics; they are test-environment warnings and did not fail tests. Renderer benchmark gates were not rerun because this presentation-only change does not touch rendering or performance paths; the last renderer gate result remains 8/8 from the prior pass.

## Remaining work

Complete the missing Workspace surfaces, iterate the Raccoon treatment against the approved reference, and run a full four-theme / EN-VI / accessibility visual pass before design acceptance.

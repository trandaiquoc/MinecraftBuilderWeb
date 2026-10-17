# Interaction Design Principles

These principles apply to current Workspace and Project Screen UI work. Use
the references to explore patterns, then adapt them to the product's existing
components, theme tokens, and data contracts.

## Findings

- [Lucian UX/UI Prompt](https://lucianlabs.dev/uxui-prompt/) and its
  [source repository](https://github.com/Seokwoooo/lucian-uxui-prompt) provide
  a broad catalog of interface and motion examples. The repository describes
  support for light and dark themes, pointer, touch, keyboard, and reduced
  motion. Treat it as a source of interaction ideas; many scroll, cursor, and
  marketing-page effects do not fit an editor.
- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh)
  focuses attention on the task, makes actions predictable, and uses borders
  only when they clarify relationships. Preserve the editor's information
  density while letting active work outrank orientation and navigation.
- [Figma's prototype animation guide](https://help.figma.com/hc/en-us/articles/360040522373-Prototype-animations)
  describes transitions through duration and easing, and Smart Animate as
  matching elements whose properties changed between states. Keep stable
  navigation in place and animate only the state or surface that changed.
- [Raycast's Action Panel](https://manual.raycast.com/action-panel) groups
  actions around the selected item, gives the primary action a clear place,
  and supports search and keyboard navigation. Keep editor actions contextual
  and reachable from their owning selection or tool.
- [VS Code's webview accessibility guidance](https://code.visualstudio.com/api/extension-guides/webview#accessibility)
  exposes reduced-motion preference to embedded UI. The Block Laundromat web
  app follows the browser's `prefers-reduced-motion` setting across Workspace
  surfaces.

## Application guidance

- Use movement to confirm a selection, reveal a surface, show progress, or
  report an action result. Do not add motion only to decorate the editor.
- Prefer short token-based transitions for buttons, tabs, menus, tooltips, and
  dialogs. Keep the interaction target and surrounding layout steady.
- Keep theme-aware hover, pressed, selected, and focus states distinct.
- Keep the primary action near its workflow; keep destructive or secondary
  actions visually quieter until needed.
- Honor reduced motion, and keep animations out of the renderer, pointer
  handling, and virtualized-list hot paths.

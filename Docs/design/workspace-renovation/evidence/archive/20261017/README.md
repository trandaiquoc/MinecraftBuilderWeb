# 2026-10-17 Workspace Browser Evidence

**Evidence status:** selected historical browser captures from before commit
`ed7b1a5`. They do not establish current visual acceptance and are not an
active task list. Current acceptance gaps live in the
[Workspace acceptance inventory](../../../WORKSPACE-UI-ACCEPTANCE-INVENTORY.md).

This archive retains 24 captures whose rendered state adds evidence beyond
source-level checks: focus appearance in all four themes, narrow-screen and
browser-specific behavior, Structure JSON validation and recovery, diagnostic
presentation, dialog focus return, native inspector selection, and renderer
backgrounds. Other captures were removed when equivalent behavior is covered
by tests or the image only repeated a historical theme, locale, font, or
viewport state.

## Focus appearance by theme

- [Dark](workspace-menu-focus-dark-en-1600x900-20261017.png)
- [Light](workspace-menu-focus-light-en-1600x900-20261017.png)
- [Minecraft](workspace-menu-focus-minecraft-en-1600x900-20261017.png)
- [Raccoon](workspace-menu-focus-raccoon-en-1600x900-20261017.png)

## Browser-specific and narrow-screen states

- [Large text in a narrow, scrolled Minecraft viewport](workspace-font-size-large-minecraft-vi-320x520-scrolled-20261017.png)
- [Block Browser last-item tooltip after the clipping fix](workspace-block-browser-keyboard-last-item-dark-en-1600x900-20261017-after-tooltip-fix.png)
- [Touch Block Browser with Vietnamese labels](workspace-block-browser-touch-after-craft-vi-390x520-20261017.png)
- [Settings dialog at a narrow viewport](workspace-settings-general-dark-390x520-20261017.png)
- [Asset Manager initial view at a narrow viewport](workspace-asset-manager-initial-dark-en-390x520-20261017.png)
- [Asset Manager focus returned to Tools](workspace-asset-manager-focus-return-to-tools-dark-en-1600x900-20261017.png)

## Structure JSON validation and recovery

- [Validated two-block import preview](workspace-structure-json-import-validated-two-blocks-dark-en-1600x900-20261017.png)
- [Invalid JSON feedback](workspace-structure-json-invalid-syntax-dark-en-1600x900-20261017.png)
- [Recovered valid source](workspace-structure-json-recovered-valid-source-dark-en-1600x900-20261017.png)
- [Import dialog focus return](workspace-structure-json-import-focus-return-dark-en-1600x900-20261017.png)

## Diagnostics

- [Mixed diagnostic findings](workspace-diagnostics-mixed-findings-dark-en-1600x900-20261017.png)

## Inspector selection keyboard states

- [Active option](workspace-inspector-select-active-option-dark-en-1600x900-20261017.png)
- [Tab navigation](workspace-inspector-select-tab-dark-en-1600x900-20261017.png)
- [Escape dismissal](workspace-inspector-select-escape-dark-en-1600x900-20261017.png)

## Selection dialog dismissal

- [Settings view before Escape](workspace-select-settings-escape-before-dark-en-1600x900-20261017.png)
- [Dismissal by Tab](workspace-select-dismissed-by-tab-dark-en-1600x900-20261017.png)
- [Dismissal by Escape](workspace-select-dismissed-by-escape-dark-en-1600x900-20261017.png)

## Renderer background modes

These captures show the independent renderer background preference in one UI
theme; the application theme does not change that preference.

- [Dark](workspace-renderer-background-dark-craft-en-1600x900-20261017.png)
- [Light](workspace-renderer-background-light-craft-en-1600x900-20261017.png)
- [Reality](workspace-renderer-background-reality-craft-en-1600x900-20261017.png)

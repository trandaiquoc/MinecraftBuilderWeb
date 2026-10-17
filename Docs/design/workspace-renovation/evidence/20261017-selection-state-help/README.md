# Selection State and Help Review - 2026-10-17

## Scope

The active `minecraft:oak_stairs` BlockState inspector was reviewed at 1600 x
1000 in all four themes and in the narrow Selection drawer at 390 x 844. The
sample used the default state from the checked-in Minecraft 1.21.1 block
registry and lived only in an isolated temporary browser profile. It was not
added as a project fixture.

Controls & Shortcuts was reviewed at desktop and narrow sizes. Its two-column
content becomes one scrollable column on narrow screens; the page itself stays
within the viewport.

## Review

- Before the label fix, state-effect words ran together and the derived Shape
  property showed both `Auto` and `Derived` for the same condition. After the
  fix, effect labels use separated badges and the automatic state is marked
  once.
- The selected block summary and state controls remain readable in Minecraft,
  Raccoon, Light, and Dark themes. The narrow Selection drawer opens over the
  workspace and scrolls its content without increasing page width.
- The Help dialog stays within desktop and narrow viewports. Mouse and keyboard
  sections remain available through internal scrolling.
- The Mods empty state and the Mod JAR Import menu destination were reviewed
  earlier. Import preflight, progress, result, and error states remain pending:
  the repository contains no real compatible mod JAR fixture.

## Captures

### BlockState labels

- [Before, Minecraft](blockstate-before-minecraft-1600x1000.png)
- [After, Minecraft](blockstate-after-minecraft-1600x1000.png)
- [After, Raccoon](blockstate-after-raccoon-1600x1000.png)
- [After, Light](blockstate-after-light-1600x1000.png)
- [After, Dark](blockstate-after-dark-1600x1000.png)
- [Selection drawer, narrow](blockstate-selection-drawer-mobile-390x844.png)

### Help

- [Controls & Shortcuts, desktop](help-shortcuts-desktop-1600x1000.png)
- [Controls & Shortcuts, narrow](help-shortcuts-mobile-390x844.png)

# Project Screen Mascot Motion Review — 2026-10-17

## Scope

The Project Screen was reviewed in Chrome against the current local app, with
one browser-local saved project. The two raccoons render as separate transparent
image layers above the theme-specific scene plate. The washer helper and map
reader use different idle animations: 5.4 seconds and 6.2 seconds, with a
staggered start.

## Browser checks

- Captured the Dark, Minecraft, Raccoon, and Light themes at 1600 × 900. Each
  theme loaded its background plate and both character images.
- At 390 × 844, both characters stayed inside the scene image. The page had no
  horizontal overflow (375 px document width inside a 390 px viewport).
- Repeated the narrow check in Vietnamese for all four themes; both image layers
  loaded and stayed inside the scene in each theme. Restored English and Dark
  after the checks.
- Emulated `prefers-reduced-motion: reduce` through Chrome DevTools Protocol.
  `matchMedia` reported `true`; both mascot animations were `none`, their
  transforms were `none`, and `will-change` returned to `auto`.
- No project data or editor state was changed.

## Captures

- [Dark desktop, 1600 px](01-dark-desktop-1600x900.png)
- [Minecraft desktop, 1600 px](02-craft-desktop-1600x900.png)
- [Raccoon desktop, 1600 px](03-raccoon-desktop-1600x900.png)
- [Light desktop, 1600 px](04-light-desktop-1600x900.png)
- [Dark mobile, 390 px](05-dark-mobile-390x844.png)
- [Dark desktop with reduced motion](06-dark-reduced-motion-1600x900.png)

At the time of this mascot review, the project preview cache had not yet been
implemented. The follow-up [real project preview review](../20261017-project-preview/README.md)
documents the selected washer capture and current metadata-only project board.

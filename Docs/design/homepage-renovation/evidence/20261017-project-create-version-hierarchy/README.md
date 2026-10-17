# Create Project Version Hierarchy — 2026-10-17

The create dialog repeated “Verified support” below the version selector, even
though the selected version already displayed that status inside the selector.
The repeated line also presented “Resource compatibility” as green success text
for other versions while warning that behavior could be incomplete.

The dialog now keeps the version status in one place. Non-default versions show
the existing behavior caveat in the theme's warning color. No version support
or project creation behavior changed.

## Browser verification

- The selected Minecraft Java 1.21.1 version shows one “Verified support” label
  and no caveat.
- Minecraft Java 1.21.11 retains “Resource compatibility” in the selector and
  shows the localized behavior caveat in warning color.
- The create dialog was checked across Minecraft, Raccoon, Light, and Dark in
  English and Vietnamese in an isolated browser context. Cross-theme checks
  verified the default state has one support label and that the non-default
  caveat text and warning color match each theme and locale.
- At 390 × 844 in Vietnamese Dark, the dialog stays within the viewport with
  no document-width overflow; the compatibility caveat remains visible.
- The Dark English caveat screenshot uses the visible version selector. The
  cross-theme checks set the same temporary form state after confirming that
  version existed in the loaded Mojang release list. The dialog was canceled;
  no project was created and the existing project was unchanged.

## Captures

- [Before: repeated status](before-dark-en-1600x900.png)
- [After: single default status](after-default-dark-en-1600x900.png)
- [After: non-default version caveat](after-compatibility-dark-en-1600x900.png)
- [Non-default caveat at narrow width](after-caveat-narrow-vi-390x844.png)

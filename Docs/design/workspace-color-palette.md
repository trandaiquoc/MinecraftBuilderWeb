# Workspace Color Palette — V1

> Status: Implemented Workspace palette specification. The approved values are owned by `Frontend/src/styles.scss` and applied only within the Workspace and overlays opened while it is active.
> Product: The Block Laundromat · Palette: Stone & Grass / Paper & Slate / Dusk Ash / Moonlit Navy.

## Scope and non-negotiable boundaries

- Four homepage / outside-theme concepts and their artwork remain unchanged. The palette below applies to the editor Workspace chrome (header, sidebar, toolbars, panels, dialogs, menus, forms, status bar and overlays opened from Workspace). Do not recolor the Project Screen / homepage merely because global tokens happen to be shared.
- Keep all four existing theme identities and persistence keys, including internal `craft` for Minecraft and `raccoon` for Raccoon. Preserve Settings behavior and EN/VI labels.
- Preserve the accepted font system (Comfortaa, Chakra Petch, Pangolin), font sizes and font/theme independence. No new fonts or typography redesign.
- The 3D and Y-Layer **renderer background** is a separate Dark / Light user preference. Never infer or reset it from application theme; do not recolor blocks, grid, selection, scene background, or add Colorful here.
- These UI colors should feel connected to the corresponding outside concept: Minecraft = stone/grass/oak; Light = paper/slate; Raccoon = warm ash/dusk lamps; Dark = moonlit navy.
- Flat, restrained visual design; keep layout, component behavior and responsive behavior unchanged. Gradients, textures, shadows and decoration are not part of this color approval.

## Canonical palette values

Hex values below are exact approved targets; preserve them by semantic role. Additional implementation-specific aliases or derived states may be chosen only to meet readability and UI contracts; document any intentional deviation.

| Semantic role       | Minecraft (`craft`) | Light   | Raccoon | Dark    |
| ------------------- | ------------------- | ------- | ------- | ------- |
| App Background      | #445449             | #F5F7FA | #CCC8C6 | #0B1422 |
| Header / Status bar | #344536             | #FFFFFF | #494C4E | #09101D |
| Sidebar             | #69776A             | #EDF1F5 | #B5B7B5 | #142136 |
| Panel / Dialog      | #D9DDCF             | #FFFFFF | #EAE6E2 | #1A2940 |
| Input / Raised      | #EEF0E5             | #F4F7FA | #F5F1EC | #20314A |
| Surface Muted       | #C8D0C0             | #EFF2F7 | #DDD8D3 | #111C2D |
| Surface Hover       | #CBD6C3             | #E4ECF4 | #DED6D0 | #293C59 |
| Selected Surface    | #B3C7A8             | #D9E6F2 | #CDC5C0 | #304B6B |
| Border              | #899A86             | #CED7E2 | #ADA7A3 | #344B67 |
| Primary Text        | #283629             | #1C2935 | #282D31 | #E8F0FA |
| Secondary Text      | #435545             | #526272 | #50575B | #AABDD2 |
| Header Text         | #F5F2E7             | #1C2935 | #F7F4F0 | #E8F0FA |
| Sidebar Text        | #FFFFFF             | #1C2935 | #282D31 | #E8F0FA |
| Disabled Text       | #667567             | #7E8E9D | #72787A | #7C8DA4 |
| Primary / Accent    | #30752D             | #344D68 | #596977 | #7EBBE7 |
| Primary Hover       | #245E24             | #293F59 | #465863 | #A7D5F4 |
| Text on Primary     | #FFFFFF             | #FFFFFF | #FFFFFF | #11263D |
| Secondary Accent    | #B78D5F             | #7D91A8 | #C49A6C | #B9C7DF |
| Focus / Outline     | #246824             | #344D68 | #465863 | #7EBBE7 |
| Success             | #206B3E             | #176C49 | #2D7059 | #79C99E |
| Warning             | #81531B             | #8C571A | #865521 | #E2B16B |
| Danger / Error      | #A92E2E             | #B32E35 | #A23E43 | #F08590 |
| Info                | #36657D             | #285A96 | #496B85 | #9EB8FF |

## Design intent

- **Minecraft · Stone & Grass:** `#445449` mossy-stone app background, `#344536` dark green header, `#69776A` stone-gray sidebar, `#D9DDCF` pale-stone panels, `#30752D` grass primary, `#B78D5F` oak-colored secondary _decorative accent_.
- **Light · Paper & Slate:** `#F5F7FA` clean paper canvas, white panels and slate-blue `#344D68` controls; calm and neutral.
- **Raccoon · Dusk Ash:** `#CCC8C6` warm gray canvas, charcoal `#494C4E` header, gray-beige `#EAE6E2` panels, blue-gray `#596977` primary; `#C49A6C` is only a warm-lamp _decorative accent_.
- **Dark · Moonlit Navy:** `#0B1422` midnight app background, `#09101D` header, blue-charcoal `#1A2940` panels, moonlight-blue `#7EBBE7` controls.

## Semantic CSS contract and ownership

- `Frontend/src/styles.scss` owns all 92 approved values under `--workspace-*`. No feature stylesheet defines a palette copy.
- Root `--app-bg`, `--surface`, and related application tokens remain the Project Screen palette. The semantic Workspace host `app-editor-shell` and the CDK container only while that host exists alias the approved Workspace values into existing tokens.
- Header and sidebar use explicit pairs: `--workspace-header-bg` / `--workspace-header-text` and `--workspace-sidebar-bg` / `--workspace-sidebar-text`. Sidebar panels must not substitute generic panel foregrounds for their heading-level foreground.
- `App Background`, `Panel / Dialog`, `Input / Raised`, `Surface Muted`, `Surface Hover`, `Selected Surface`, `Border`, and text roles map to `--app-bg`, `--surface`, `--surface-raised`, `--surface-muted`, `--surface-hover`, `--surface-selected`, `--border`, `--text`, `--text-muted`, and `--text-disabled` within the scoped Workspace.
- `Primary / Accent`, `Primary Hover`, and `Text on Primary` map to `--accent`, `--accent-hover`, and `--accent-contrast`, plus the `--button-primary-*` roles. Selected controls use `Selected Surface`; neutral secondary controls use muted/hover surfaces, not `Secondary Accent`.
- `Border / Outline` maps to `--border`; stronger control boundaries and keyboard focus use `Focus / Outline` through `--border-strong`, `--control-separator`, and `--focus-color`.
- Success/Warning/Danger/Info map to the corresponding status tokens. In the Minecraft and Raccoon dark headers only, status text uses a CSS `color-mix` foreground alias blended toward the approved header text to keep >=4.5:1 contrast. The four canonical status colors remain unchanged on panels. Light and Dark status foregrounds use the canonical status colors directly.
- `Secondary Accent` maps to `--secondary-accent` and remains decorative; it is not the secondary button background or body-text color. `--tone-*` diagnostic/export colors retain their separate semantic role.
- Dialogs rendered inside Workspace inherit from `app-editor-shell`. CDK overlays inherit Workspace tokens only while `app-editor-shell` is present; Project Screen Settings therefore retain the Project Screen palette.
- `ThemeService` continues to set `--editor-viewport-bg` directly from `appearance.editorBackground`; no renderer palette, scene, or block resource changes on application theme switches.

## Accessibility and verified checks

### Floating-surface regression contract

- Header triggers use the header foreground; their styles must not target
  descendant buttons inside an opened menu.
- Menus, dropdowns, dialogs, and shared overlays own a foreground token that
  matches their actual floating-surface background. Sidebar/header foregrounds
  must not leak into these descendants.
- Check normal, hover, selected/active, disabled, and keyboard-focus states for
  floating surfaces in all four themes. Danger actions must retain readable
  foreground/background pairs in normal and interactive states.
- Normal text must meet WCAG AA >= 4.5:1; meaningful control and focus
  indicators must meet >= 3:1 against adjacent colors.
- Resolve selector or mapping regressions without changing the 92 canonical
  HEX values.

Contrast values below were computed using WCAG relative luminance from the exact hex values (text/background ratios). These are _only audited pairs_, not a guarantee for every UI state.

| Audited pair                    | Minecraft |   Light | Raccoon |    Dark |
| ------------------------------- | --------: | ------: | ------: | ------: |
| Primary Text / Panel            |    9.21:1 | 14.81:1 | 11.20:1 | 12.73:1 |
| Secondary Text / Panel          |    5.79:1 |  6.27:1 |  5.92:1 |  7.61:1 |
| Header Text / Header            |    9.14:1 | 14.81:1 |  7.89:1 | 16.56:1 |
| Sidebar Text / Sidebar          |    4.72:1 | 13.05:1 |  6.89:1 | 14.05:1 |
| Text on Primary / Primary       |    5.66:1 |  8.72:1 |  5.66:1 |  7.42:1 |
| Text on Primary / Primary Hover |    7.77:1 | 10.77:1 |  7.40:1 |  9.84:1 |
| Primary Text / Selected Surface |    7.06:1 | 11.67:1 |  8.17:1 |  7.80:1 |
| Success / Panel                 |    4.70:1 |  6.41:1 |  4.73:1 |  7.43:1 |
| Warning / Panel                 |    4.77:1 |  6.01:1 |  5.07:1 |  7.48:1 |
| Danger / Panel                  |    4.87:1 |  6.25:1 |  5.12:1 |  5.90:1 |
| Info / Panel                    |    4.58:1 |  7.02:1 |  4.54:1 |  7.49:1 |
| Secondary Accent / Panel        |    2.17:1 |  3.24:1 |  2.07:1 |  8.57:1 |

- Normal text must meet **WCAG AA >= 4.5:1** with its actual rendered background; large text >= 3:1 and meaningful controls/indicators >= 3:1 where applicable. Check hover, focus, selection, disabled, icons, borders and status semantics in real UI.
- `Secondary Accent` on a light panel is **decorative only**, not text: Minecraft 2.17:1; Light 3.24:1; Raccoon 2.07:1. Dark 8.57:1. Use a legible semantic foreground instead of inventing new hex values or silently changing this approved decorative color.
- `Disabled Text` contrast is intentionally lower than ordinary body text; ensure disabled state is distinguishable without becoming a source of actionable instructions.
- Do not pair `--text` with header/sidebar colors arbitrarily. Use their explicit foreground partners.
- Minecraft and Raccoon status foregrounds in the header are derived with `color-mix` at 40% and 32% canonical status color respectively. At these settings the lowest audited header status contrast remains above 4.5:1; no canonical hex value changes.

## Acceptance / maintenance contract

1. Verify all four Workspace themes on header, left/right panels, toolbars, dropdowns, dialogs, forms, status, notifications, scroll areas and overlays; check keyboard focus and text contrast.
2. Verify homepage/Project Screen and outside concept colors have **not** changed from this task. Shared components must behave correctly in both contexts.
3. Verify UI theme switches do not change `editorBackground`, 3D/Y-Layer renderer palette, block content, persistence, Undo/Redo, or performance-sensitive resources.
4. Verify theme/font selection and prior saved preferences still work. Do not rework the font system.
5. Keep this file synchronized with shipped Workspace palette changes. If a specified value must change for accessibility, report exactly which semantic role, original value, replacement, contrast evidence and why.

## Historical provenance

This document records the Workspace Palette V1 discussed and accepted after the existing four-theme/three-font implementation. The homepage reference concepts remain in `Docs/design/references/01-minecraft.png` through `04-dark.png`. The palette is not a license to redesign those assets.

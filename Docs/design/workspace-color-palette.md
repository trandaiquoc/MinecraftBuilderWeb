# Workspace Color Palette — V2

> Status: canonical, implemented Workspace visual contract. `Frontend/src/styles.scss` owns the four theme palettes and maps them to existing component tokens only while the editor Workspace is active.

## Scope

- Applies to the editor Workspace: application chrome, toolbars, sidebars, browsers, inspectors, dialogs, menus, controls, status UI, and overlays opened from the Workspace.
- The Project Screen/Homepage retains its independent visual system and root tokens.
- Theme keys and persistence remain `craft`, `light`, `raccoon`, and `dark`; the product labels are Minecraft, Light, Raccoon, and Dark.
- All themes share the same Angular components, layout, spacing, behavior, content previews, and state. Theme-specific treatment is expressed through semantic tokens and a small set of shape/elevation tokens.
- The selected font remains one of Comfortaa, Chakra Petch, or Pangolin. System monospace is allowed only for technical code and identifiers; no additional UI font is introduced.
- The 3D/Y-Layer Dark, Light, and Reality workspace background is independent of application theme. This palette does not alter renderer colors, placed blocks, project data, or export output.
- The official logo at `Frontend/public/assets/brand/the-block-laundromat-logo.svg` is used unchanged.

## Canonical palette values

| Semantic role       | Minecraft (`craft`) | Light   | Raccoon | Dark    |
| ------------------- | ------------------- | ------- | ------- | ------- |
| App Background      | #35372F             | #F7F7F6 | #181A1C | #08090C |
| Header / Status bar | #416F2C             | #FFFFFF | #202326 | #050608 |
| Sidebar             | #564330             | #F1F1F0 | #292D30 | #0F1115 |
| Panel / Dialog      | #E4D9BE             | #FFFFFF | #35393D | #13161B |
| Input / Raised      | #F2E8D3             | #FAFAFA | #42474C | #1A1D24 |
| Surface Muted       | #D2C1A3             | #EEEEED | #2C3034 | #0E1014 |
| Surface Hover       | #DAC8AC             | #E8E8E7 | #4D545A | #222630 |
| Selected Surface    | #B5CB98             | #DEDEDD | #596068 | #2C333D |
| Border              | #887252             | #CCCCCA | #687178 | #343A45 |
| Primary Text        | #2A2117             | #171717 | #F5F4F1 | #F2F3F5 |
| Secondary Text      | #5B4A35             | #535353 | #C5C9CD | #B7BEC9 |
| Header Text         | #F9F4E6             | #171717 | #F8F7F4 | #F1F3F5 |
| Sidebar Text        | #FFF3DD             | #202020 | #EFEFED | #E6E9EF |
| Disabled Text       | #776E61             | #848484 | #95999F | #858B96 |
| Primary / Accent    | #427A25             | #252525 | #D1D5D7 | #A7B7CF |
| Primary Hover       | #30631C             | #111111 | #ECEBE7 | #C2D0E3 |
| Text on Primary     | #FFFFFF             | #FFFFFF | #1B1D20 | #0D121A |
| Secondary Accent    | #C48845             | #777777 | #B7BEC2 | #8D9AAF |
| Focus / Outline     | #286B1C             | #424242 | #ECEBE7 | #B1C3DE |
| Success             | #246E3C             | #237044 | #8BD0A0 | #80C89F |
| Warning             | #835217             | #8A5A1B | #E5B978 | #E0B77C |
| Danger / Error      | #AA3535             | #AB333C | #F29BA2 | #F08A98 |
| Info                | #315F83             | #424242 | #98BACB | #B2C4E0 |

## Theme treatment

- **Minecraft:** saturated grass-green top chrome, restrained dirt/stone toolbar and sidebar surfaces, warm pale-stone panels, crisp block-like controls, and a small pixel-step transition from header to toolbar. Green is reserved for primary actions and focus rather than washing every surface green.
- **Raccoon:** charcoal and gray surfaces with alternating light text/surface levels, soft elevated controls, and noticeably rounded component silhouettes. It remains a distinct product theme, not a dark-mode alias.
- **Light:** clean white, black, and neutral gray surfaces without a blue cast. Selected states use strong neutral contrast.
- **Dark:** near-black application background with subtle charcoal surface levels for comfortable night use.

All 23 roles in the table are exact palette values. Additional aliases for toolbar chrome, shape, and elevation are derived in `Frontend/src/styles.scss`; they do not create another palette or alter the 23-role contract. `Secondary Accent` is a decorative support color, not a general text or secondary-button color.

## Token ownership and boundaries

- `Frontend/src/styles.scss` owns the canonical values and Workspace-scoped aliases. Root application tokens remain owned by the Project Screen; `app-editor-shell` and the CDK overlay container only while it is present receive the Workspace mapping.
- Components use semantic tokens such as `--surface`, `--text`, `--control-selected`, `--button-primary-*`, `--danger`, `--focus-color`, `--radius-*`, and `--shadow-control-*`. Component styles may define geometry and state, but must not copy theme palettes.
- Header and sidebar foregrounds use their paired tokens. Open popovers/dialogs keep the foreground paired to their own surface instead of inheriting menu or sidebar text colors.
- The canonical Minecraft success color is retained as `--workspace-success`. Its panel text alias is derived 2% toward black to meet 4.5:1 against the approved parchment panel; header status text uses a separate contrast-adjusted alias. Other themes use their canonical success color directly.
- All functional controls must preserve normal, hover, selected, disabled, destructive, and keyboard-focus states. Focus and selection must remain visibly distinguishable in all four themes.
- `ThemeService` continues to set `--editor-viewport-bg` from the independent Dark/Light/Reality preference. Reality sky colors are shared by `editor-background-contract.ts`; Reality ground previews use the corresponding bundled or loaded texture. Neither is coupled to the UI theme.
- Minecraft block/item/decoration previews and the retained 3D renderer are content visuals, not theme artwork. Do not replace them with Stitch screenshots or recolor them with Workspace tokens.

## Interaction and motion contract

- `Frontend/src/styles.scss` owns the shared motion tokens: fast control feedback (120 ms), standard UI transitions (180 ms), and short enter/exit transitions (150 ms or less), with standard and emphasized easing curves.
- The same controls keep distinct state channels: hover lifts an unselected surface, keyboard focus uses the focus token, and active/selected controls use the selected token plus a persistent indicator or weight change. Do not communicate selection through color alone.
- `.ui-tab-strip` is the shared sliding indicator for multi-tab groups whose direct tab buttons expose `aria-selected`. Keep auxiliary actions outside the tablist so they do not change indicator geometry.
- The editor's 3D/Y-Layer and Place/Select pairs each use one shared segmented track. Its single sliding surface follows the real buttons' `aria-pressed` state; the selected label is bold and high-contrast while idle choices remain subdued. All four themes use their existing selected tokens, with no theme-specific duplicate control tree.
- Popovers and dialogs use short opacity/transform transitions. Progress and copy feedback remain driven by operation/clipboard results; animation must not invent progress or success.
- `prefers-reduced-motion` reduces Workspace and overlay transitions to effectively immediate changes. Motion is not used in renderer, camera, pointer, or virtual-list hot paths.

## References and verification

The four approved Workspace compositions are preserved separately from browser captures under `Docs/design/workspace-renovation/references/`. The similarly named images in `Docs/design/references/` are not these Workspace compositions and must not be used as their substitutes. Browser captures of the current implementation are kept in `Docs/design/workspace-renovation/evidence/`. The supplied archive also contains 45 original feature-reference screenshots used to check controls, states, and feature inventory; those reference images remain in the supplied archive rather than application source. Their HTML/Tailwind exports are design artifacts, not application source.

`Frontend/src/app/core/ui/theme/theme.service.spec.ts` verifies that the 23 canonical values match this table and that generic aliases remain scoped to the active Workspace. Visual review must include Minecraft, Light, Raccoon, and Dark, with both EN and VI where text is visible.

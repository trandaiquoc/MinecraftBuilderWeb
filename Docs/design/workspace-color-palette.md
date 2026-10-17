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
| App Background      | #241B14             | #F7F7F6 | #181A1C | #08090C |
| Header / Status bar | #315E27             | #FFFFFF | #202326 | #050608 |
| Sidebar             | #36281D             | #F1F1F0 | #292D30 | #0F1115 |
| Panel / Dialog      | #403D37             | #FFFFFF | #35393D | #13161B |
| Input / Raised      | #4D4941             | #FAFAFA | #42474C | #1A1D24 |
| Surface Muted       | #302C26             | #EEEEED | #2C3034 | #0E1014 |
| Surface Hover       | #5A5146             | #E8E8E7 | #4D545A | #222630 |
| Selected Surface    | #365A29             | #DEDEDD | #596068 | #2C333D |
| Border              | #B8A17B             | #CCCCCA | #687178 | #343A45 |
| Primary Text        | #FFF3DC             | #171717 | #F5F4F1 | #F2F3F5 |
| Secondary Text      | #D8C9AE             | #535353 | #C5C9CD | #B7BEC9 |
| Header Text         | #F3F7EB             | #171717 | #F8F7F4 | #F1F3F5 |
| Sidebar Text        | #FFF1D4             | #202020 | #EFEFED | #E6E9EF |
| Disabled Text       | #C9B996             | #848484 | #95999F | #858B96 |
| Primary / Accent    | #3D742D             | #252525 | #D1D5D7 | #A7B7CF |
| Primary Hover       | #316224             | #111111 | #ECEBE7 | #C2D0E3 |
| Text on Primary     | #FFFBEC             | #FFFFFF | #1B1D20 | #0D121A |
| Secondary Accent    | #A7783F             | #777777 | #B7BEC2 | #8D9AAF |
| Focus / Outline     | #E3B950             | #424242 | #ECEBE7 | #B1C3DE |
| Success             | #8ADB99             | #237044 | #8BD0A0 | #80C89F |
| Warning             | #FFD176             | #8A5A1B | #E5B978 | #E0B77C |
| Danger / Error      | #FF9188             | #AB333C | #F29BA2 | #F08A98 |
| Info                | #B4D8EE             | #424242 | #98BACB | #B2C4E0 |
| Destructive Button  | #8E352F             | #AB333C | #F29BA2 | #F08A98 |
| Destructive Hover   | #A7463D             | #AB333C | #F29BA2 | #F08A98 |

## Theme treatment

- **Minecraft:** grass-green navigation chrome with sparse, fixed pixel patches over a rich dirt-brown toolbar and a jagged grass-to-dirt edge. Deep soil-brown sidebars frame layered charcoal-stone panels and raised controls; green selection and primary actions remain distinct against those surfaces.
- **Raccoon:** charcoal and gray surfaces with alternating light text/surface levels, soft elevated controls, and noticeably rounded component silhouettes. It remains a distinct product theme, not a dark-mode alias.
- **Light:** clean white, black, and neutral gray surfaces without a blue cast. Selected states use strong neutral contrast.
- **Dark:** near-black application background with subtle charcoal surface levels for comfortable night use.

All 25 roles in the table are exact palette values. Additional toolbar, pixel-patch, shape, and elevation tokens are defined in `Frontend/src/styles.scss`. The Minecraft toolbar uses rich dirt brown (`#76502F`) with warm cream text (`#FFF7E7`) at 6.66:1 contrast; its hover surface (`#8A603A`) keeps 5.17:1. Header grass-patch colors maintain at least 4.92:1 with header text. The destructive button surfaces have their own semantic tokens so bright error text stays legible on the stone panel while destructive actions retain a high-contrast button fill. `Secondary Accent` is a decorative support color, not a general text or secondary-button color.

## Token ownership and boundaries

- `Frontend/src/styles.scss` owns the canonical values and Workspace-scoped aliases. Root application tokens remain owned by the Project Screen; `app-editor-shell` and the CDK overlay container only while it is present receive the Workspace mapping.
- Components use semantic tokens such as `--surface`, `--text`, `--control-selected`, `--button-primary-*`, `--danger`, `--focus-color`, `--radius-*`, and `--shadow-control-*`. Component styles may define geometry and state, but must not copy theme palettes.
- Header and sidebar foregrounds use their paired tokens. Open popovers/dialogs keep the foreground paired to their own surface instead of inheriting menu or sidebar text colors.
- Minecraft native selects use the same stone fill, compact frame, bottom edge, and text color as buttons; the browser-default arrow is replaced by a matching chevron. Focus remains grass green, while resting borders stay stone-neutral.
- Minecraft status colors are brightened for readable use against the dark grass header and stone panel. Raccoon's header status colors retain their existing `color-mix` treatment; the other themes use their canonical status colors directly.
- All functional controls must preserve normal, hover, selected, disabled, destructive, and keyboard-focus states. Focus and selection must remain visibly distinguishable in all four themes.
- `ThemeService` continues to set `--editor-viewport-bg` from the independent Dark/Light/Reality preference. Reality sky colors are shared by `editor-background-contract.ts`; Reality ground previews use the corresponding bundled or loaded texture. Neither is coupled to the UI theme.
- Minecraft block/item/decoration previews and the retained 3D renderer are content visuals, not theme artwork. Do not replace them with Stitch screenshots or recolor them with Workspace tokens.

## Interaction and motion contract

- `Frontend/src/styles.scss` owns the shared motion tokens: fast control feedback (120 ms), standard UI transitions (180 ms), and short enter/exit transitions (150 ms or less), with standard and emphasized easing curves.
- The same controls keep distinct state channels: hover changes an unselected surface, keyboard focus uses the focus token, and active/selected controls use the selected token plus a persistent indicator or weight change. Do not communicate selection through color alone.
- `.ui-tab-strip` is a shared tab surface. The selected tab itself carries the selected surface and text treatment; do not add a detached or moving indicator. Keep auxiliary actions outside the tablist so tab geometry and keyboard navigation remain stable.
- The editor's 3D/Y-Layer and Place/Select pairs each use one shared segmented track. Its single sliding surface follows the real buttons' `aria-pressed` state; the selected label is bold and high-contrast while idle choices remain subdued. All four themes use their existing selected tokens, with no theme-specific duplicate control tree.
- Popovers and dialogs use short opacity/transform transitions. Progress and copy feedback remain driven by operation/clipboard results; animation must not invent progress or success.
- `prefers-reduced-motion` reduces Workspace and overlay transitions to effectively immediate changes. Motion is not used in renderer, camera, pointer, or virtual-list hot paths.

## References and verification

The four approved Workspace compositions are preserved separately from browser captures under `Docs/design/workspace-renovation/references/`. The similarly named images in `Docs/design/references/` are the four Homepage concepts, not Workspace substitutes. Historical browser captures remain under `Docs/design/workspace-renovation/evidence/`, including the dated `current-run-20261017/` set. They predate commit `ed7b1a5` and do not establish current visual acceptance.

`Frontend/src/app/core/ui/theme/theme.service.spec.ts` verifies that the 25 canonical values match this table, checks text and control contrast, and verifies that generic aliases remain scoped to the active Workspace. Visual review must include Minecraft, Light, Raccoon, and Dark, with both EN and VI where text is visible.

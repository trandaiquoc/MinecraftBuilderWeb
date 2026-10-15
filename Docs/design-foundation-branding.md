# The Block Laundromat Design Foundation

This is the current product-facing brand and visual-direction reference. The
four supplied concept images are inspiration, not finished UI or runtime
artwork; the existing editor layout and behavior remain authoritative until a
later, explicitly scoped design phase.

## Brand

**The Block Laundromat** is a web application for building, editing, and
managing Minecraft Java structures. The supplied original logo is stored at
`Frontend/public/assets/brand/the-block-laundromat-logo.svg` and is used
unchanged. Its SVG contains one embedded PNG image (1774 x 887); it is not
vector artwork and has not been redrawn or optimized.

## Visual Direction

The references share one composition and differ by palette, lighting, and
scene:

| Direction | Palette and atmosphere                             | Status                                    |
| --------- | -------------------------------------------------- | ----------------------------------------- |
| Minecraft | Minecraft grass green with warm afternoon sunlight | Runtime theme (`craft` compatibility key) |
| Light     | Predominantly white, bright morning light          | Runtime theme                             |
| Raccoon   | Warm neutral gray surfaces                         | Independent runtime theme                 |
| Dark      | Navy and charcoal surfaces                         | Runtime theme                             |

The same layout should serve all four directions. Time-of-day language is
descriptive art direction, not a separate feature or setting.

## Typography and Workspace

Comfortaa, Chakra Petch, and Pangolin are self-hosted through Fontsource and
can each be selected independently of all four themes. Small, Normal, and Large
font sizes scale the shared UI typography. UI code, registry IDs, and coordinate
readouts use the selected family too; operating-system font stacks are not part
of the selectable UI font contract. Canvas-rendered Minecraft sign text uses
the bundled Comfortaa face independently of the UI preference. New preferences and Appearance reset
to Minecraft (`craft`), Comfortaa, and a Dark workspace background. Existing
saved preferences are retained; legacy Geist and Minecraft-style font values
migrate to Comfortaa and Chakra Petch when preferences are normalized. Reality's
separate preset defaults are plains grass and Overworld day.

The editor workspace background remains independent of application chrome and
supports Dark, Light, and Reality. Reality combines a separately selected ground
texture with an Overworld day/night, Nether, or End sky; its ground is
presentation-only and never enters project data. Dark/Light continue to use
their existing renderer palettes. Workspace background changes apply directly,
without a scene-transition animation.

Workspace application colors follow the canonical four-theme [Workspace Color
Palette V1](design/workspace-color-palette.md). That palette is scoped to the
editor workspace and its overlays; the Project Screen keeps its existing color
tokens. The renderer's Dark/Light/Reality environment remains independent of
both. Reality sky preset colors are shared through the editor background
contract so the renderer and Settings previews agree; ground and sky artwork
remain renderer-owned.

## Homepage Concept

The future homepage direction is a layered 2D/2.5D laundromat: a large outdoor
door and daylight on the left, a central washer that can display a project
thumbnail, project-management board and large rectangular window on the right,
two independently animated gray raccoons, wood flooring, and laundromat props.
Account controls belong at bottom left; language, theme, and settings stay
independent of the artwork at top right.

Layered, reusable artwork could later support seasonal events. On first project
selection the raccoons may inspect the washer thumbnail; leaving the workspace
may capture and cache a project preview. These are future concepts only: this
step does not implement the homepage, artwork system, thumbnail cache,
animation, weather, or event behavior.

## References

The source images are preserved byte-for-byte in [design references](design/references/):

1. [Minecraft](design/references/01-minecraft.png)
2. [Light](design/references/02-light.png)
3. [Raccoon](design/references/03-raccoon.png)
4. [Dark](design/references/04-dark.png)

They are documentation-only and are not loaded by the application.

## Compatibility and Scope

The product-facing brand is **The Block Laundromat**. Build identifiers are
`TheBlockLaundromat` (Angular project) and `the-block-laundromat` (npm
package). The repository is `trandaiquoc/TheBlockLaundromat`, and the local
checkout directory is `TheBlockLaundromat`.

New Project Backup and Structure JSON exports use The Block Laundromat format
identifiers; importers continue to accept the former `minecraftbuilder-*`
formats. New default preferences and NBT export configuration use
`theblocklaundromat`. Existing saved custom namespace values are preserved.
Browser-local preferences, active-project references, and Quick Bar data are
copied to canonical keys on first read while their old keys remain untouched.
Project and asset IndexedDB database names, the asset-bundle v1 envelope, public
schema URL, Minecraft resource namespaces, semantic manifests, and diagnostic
schemas remain compatibility contracts. New asset bundles use the canonical
brand marker while the legacy marker remains accepted. Historical decision
records retain MinecraftBuilder as provenance. The existing database names
remain active rather than copying potentially large projects/assets into a
second database while retaining the originals. The checked-in public schema
keeps its established `$id`; no new public domain has been assigned.

This foundation documents the current branding and compatibility boundaries. It
does not redesign the homepage or add account/backend behavior.

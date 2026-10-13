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

| Direction | Palette and atmosphere                             | Status                                                                 |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Minecraft | Minecraft grass green with warm afternoon sunlight | Current `craft` preset is labeled Minecraft; future homepage direction |
| Light     | Predominantly white, bright morning light          | Existing Light theme; future homepage direction                        |
| Raccoon   | Gray surfaces at dusk with warm lamps              | Concept only; no Raccoon theme is implemented                          |
| Dark      | Dark surfaces at night                             | Existing Dark theme; future homepage direction                         |

The same layout should serve all four directions. Time-of-day language is
descriptive art direction, not a separate feature or setting.

## Typography and Workspace

The approved font direction is Comfortaa for general UI, Chakra Petch for
Minecraft styling, and Pangolin for the future Raccoon theme. Font selection
is independent from theme. This step does not install or activate these fonts;
the current font preferences remain unchanged.

Future workspace backgrounds are Dark, Light, and Colorful. Colorful is planned
as a Minecraft sky, grass, and grid palette. Workspace background changes
should apply directly, without a scene-transition animation. Current workspace
preferences and defaults are unchanged in this step.

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
does not add a Raccoon theme, change runtime fonts or reset defaults, add the
Colorful workspace, redesign the homepage, or add account/backend behavior.

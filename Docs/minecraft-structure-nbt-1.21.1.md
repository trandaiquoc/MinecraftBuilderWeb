# Minecraft Java 1.21.1 Structure NBT contract

This document records the Prompt 15.1 boundary only. It is not an exporter
implementation and it does not enable the unavailable `Export Structure NBT`
menu action.

## Verified target

- Target: Minecraft Java `1.21.1`.
- `DataVersion`: `3955`.
- The code keeps this version gate explicit; it must not write `3955` for a
  project targeting another Minecraft version.
- The current product size policy is `<=48` blocks on every axis for the
  vanilla Structure Block workflow, `49..512` for the existing huge-structure
  workflow, and unsupported above `512`. This is a product limit, not a claim
  about the binary format.

## Structure Block guide audit

The current tree contains `minecraft:structure_block` catalog evidence and
uses `vanilla-structure-block` as the default project mode. A dedicated
Prompt 14.4.1 guide-only brightness value of 18 and its independent visual
guide treatment are not identifiable in the current source/docs search, so
that specific completion claim is not repeated here and remains a separate UI
audit item.

## StructureTemplate shape

Minecraft's 1.21.1 `StructureTemplate` API exposes `size`, `palette` (or
`palettes` for multiple palettes), `blocks`, and `entities`. The semantic
boundary in `minecraft-structure-types.ts` models the single-palette form:

- `DataVersion`: NBT Int.
- `size`: three NBT Int values in an NBT List.
- `palette`: an NBT List of compounds. Each entry has `Name` (String) and an
  optional `Properties` compound whose values are Strings.
- `blocks`: an NBT List of compounds. Each entry has `pos` (three Int values
  in an NBT List), `state` (palette index, Int), and optional `nbt` (Compound).
- `entities`: an NBT List of compounds. Each entry has `pos` (three Double
  values in an NBT List), `blockPos` (three Int values in an NBT List), and
  `nbt` (Compound).

The Java NBT binary is big-endian. Minecraft structure files are normally
gzip-compressed; compression detection and the root-name detail remain codec
responsibilities, not ProjectDocument responsibilities.

## Sparse/Air checkpoint

**BLOCKED pending a real fixture.** This repository has no Minecraft-generated
1.21.1 `.nbt` or `.nbt.gz` file. The source/API evidence confirms the palette
has an explicit `AIR` state, but it does not replace an independent saved
fixture for the exact saved-voxel policy (explicit air entries versus omitted
entries, and Structure Void interaction). No exporter assumption is made here.

Required fixture: a Structure Block save made by Minecraft Java 1.21.1 with a
bounding box larger than its non-air content, at least two palette states, one
non-trivial state such as stairs, and one verified block entity (a sign is a
good candidate). Include entities only if entity preservation is being tested.

## ResourceLocation and helper audit

The exporter boundary uses Minecraft's namespaced ResourceLocation character
rules: namespace `[a-z0-9_.-]`, path `[a-z0-9/._-]`. This is separate from ZIP
path sanitization and download filename validation. Existing content parsing
still supports bare and variable resource references; persisted/exported IDs
use the strict namespaced validator.

The existing semantic helpers are not treated as a general NBT codec:

- Sign data maps to `front_text`, `back_text`, `is_waxed`, and sign IDs, but
  unknown colors currently normalize to black. A future exporter must diagnose
  unsupported data instead of silently exporting that fallback.
- Decorated pot data uses Minecraft's `back,left,right,front` sherd order, but
  unknown sherds currently normalize to brick. A future exporter must reject or
  diagnose an unverified raw value.
- Conduit mapping intentionally emits only its block-entity ID.
- Container and decoration metadata can contain `Record<string, unknown>` or
  entity-like data. JSON numbers are not inferred as NBT byte/short/int/long or
  float/double. Unsupported raw data must produce an explicit diagnostic.
- Block-entity data (`blocks[].nbt`) stays separate from top-level structure
  entities (`entities[]`).

## Codec decision

No NBT dependency exists in the current package and no dependency was added.
The code defines a typed NBT model plus `MinecraftJavaNbtCodec` and
`MinecraftStructureAdapter` ports, keeping low-level binary code out of the
UI and ProjectDocument.

Two candidates were researched:

- `prismarine-nbt` 2.8.0: active, MIT, TypeScript declarations, Java big-endian
  support and gzip-aware parsing, but its documented browser path requires
  bundling and it brings the `protodef` dependency graph.
- `nbtify` 2.2.0: browser/ESM-oriented and MIT, but its release is older and
  it has a `mutf-8` dependency. It still needs golden-fixture verification.

Neither is approved or installed in Prompt 15.1. A codec should be selected
only after decoding the real fixture and checking bundle impact, deterministic
semantic output, full tag coverage, gzip behavior, and license/maintenance.

## Golden fixture status

No golden fixture is committed or fabricated. Unit tests cover pure contract
and canonicalization behavior only; they are not claimed as binary Minecraft
compatibility. The next checkpoint needs the independently saved fixture
described above before implementing conversion/encoding or enabling download.

## Boundary

The intended dependency direction is:

`UI -> application/domain export interface -> Structure adapter/canonical model -> typed NBT codec port -> binary/gzip implementation`

Renderer, asset availability, and `kind: "missing"` do not decide export
identity. Missing local assets preserve their exact registry ID and canonical
state; they are not converted to `minecraft:air`.

Sources used for this checkpoint:

- [Minecraft 1.21.1 `SharedConstants` mappings](https://mappings.dev/1.21.1/net/minecraft/SharedConstants.html)
- [Yarn 1.21.1 `StructureTemplate`](https://maven.fabricmc.net/docs/yarn-1.21.1%2Bbuild.1/net/minecraft/structure/StructureTemplate.html)
- [Yarn 1.21.1 `StructureTemplate.Palette`](https://maven.fabricmc.net/docs/yarn-1.21.1%2Bbuild.1/net/minecraft/structure/StructureTemplate.Palette.html)
- [NeoForge 1.21.1 `StructureTemplate`](https://lexxie.dev/neoforge/1.21.1/net/minecraft/world/level/levelgen/structure/templatesystem/StructureTemplate.html)
- [NeoForge 1.21.1 `ResourceLocation`](https://lexxie.dev/neoforge/1.21.1/net/minecraft/resources/ResourceLocation.html)
- [Java NBT format reference](https://formats.kaitai.io/minecraft_nbt/java-write.html)
- [prismarine-nbt package reference](https://www.npmjs.com/package/prismarine-nbt)
- [NBTify package reference](https://www.npmjs.com/package/nbtify)

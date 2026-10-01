# Minecraft Java 1.21.1 Structure NBT contract

This document records the Prompt 15.1/15.2 core boundary. It contains the
binary codec and exporter contract, but it does not enable the unavailable
`Export Structure NBT` menu action.

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
uses `vanilla-structure-block` as the default project mode. Prompt 14.4.1 is
present in the merged history: `STRUCTURE_GUIDE_BRIGHTNESS = 18` is applied
through guide-owned cloned materials, independently from normal block
brightness, without mutating shared source materials or using the old neon
outline treatment.

The editor guide follows the verified Structure Block workflow convention
Relative Position `0 1 0`: it is placed directly below the structure origin,
with the same X/Z as the project's minimum corner. This is the guide's chosen
workflow convention, not a claim that Minecraft Structure Blocks support only
that relative position.

## Standalone and datapack packaging checkpoint

Prompt 15.4 adds a non-UI packaging boundary around the existing production
exporter. A standalone `.nbt` keeps the exact gzip bytes produced by that
exporter and is intended for
`generated/<namespace>/structures/<path>.nbt`. A datapack plan uses the
singular Java 1.21+ entry path
`data/<namespace>/structure/<path>.nbt`; the plural `structures` is reserved
for the world `generated` path. Its root metadata is deterministic
`pack.mcmeta` with `pack.pack_format = 48` and a JSON-serialized description.

The approved browser ZIP dependency is now `fflate@0.8.3`. The production
`FflateZipArchiveWriter` implements the library-neutral writer port and uses
fflate's callback-based `zip()` API with per-entry options. Already-gzipped NBT
is passed with ZIP compression level `0` (method STORE), while `pack.mcmeta`
uses DEFLATE level `6`. A fixed DOS-compatible timestamp keeps artifacts
reproducible without leaking the local clock. No Blob, File, Node filesystem,
base64, or Angular dependency is present in the adapter.

The exact datapack tree is:

```
pack.mcmeta
data/<namespace>/structure/<path>.nbt
```

There is no outer archive directory, `generated/` directory, or plural
`structures` datapack directory. `prepareStructureExport()` runs the NBT
exporter once; the same `Uint8Array` is used by the standalone artifact and
the ZIP entry. Namespace/resource-location validation is separate from archive
filename and ZIP entry path validation. Archive names reject leading/trailing
whitespace, whitespace-only values, trailing dots, reserved Windows stems, and
unsafe suffixes without trimming submitted values. The writer rejects unsafe
relative paths and duplicate entry names at its boundary.

Export defaults cache only namespace, archive name, and description through UI
preferences; the structure path is derived from the current project name.
Unknown untyped raw NBT remains an explicit exporter diagnostic, and packaging
does not increase Vanilla Structure Block limits. Projects above 48 blocks per
axis retain Huge Structure Blocks compatibility metadata without claiming the
ZIP installs that mod.

The committed smoke artifact
`Frontend/src/app/core/persistence/minecraft-structure/fixtures/exporter_datapack_smoke_1_21_1.zip`
is **EXPORTER/PACKAGER-GENERATED — NOT A GOLDEN**. It has SHA-256
`420e4462c46d22f3ca71cc9870d856310e06855807f03d03c519f733cb47b661` and size
1853 bytes. It contains exactly the two entries above for
`minecraftbuilder:exporter_datapack_smoke_1_21_1`; `pack.mcmeta` is
`{"pack":{"pack_format":48,"description":"MinecraftBuilder 1.21.1 export smoke"}}`.
The embedded gzip NBT is 1448 bytes with SHA-256
`db755a1c655ce46bcc906b18ed30bc3ee099b7844d81c9e3fab5ad92412ede83`,
DataVersion 3955, dimensions 10x4x8, 8 palette entries, 320 block records with
274 Air records, 6 block entities (`minecraft:sign`, `minecraft:decorated_pot`,
`minecraft:hanging_sign`, `minecraft:chest`, `minecraft:barrel`,
`minecraft:hopper`), and 3 entities
(`minecraft:painting`, `minecraft:item_frame`,
`minecraft:glow_item_frame`). The permanent self-verification test decodes the
artifact through the production codec. It has **not yet been verified in a
Minecraft client**.

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

**VERIFIED for the standard Structure Block save below.** The immutable golden
fixture was generated by Minecraft Java 1.21.1 through Structure Block SAVE
with Include Entities ON. It has size `5 × 4 × 5`, exactly 100 block entries,
and one entry for every voxel in that volume. `minecraft:air` is an explicit
palette entry referenced by 83 block entries; empty source voxels are not
omitted and are not Structure Void.

The user also reloaded this fixture in Minecraft Java 1.21.1 over a target area
filled with Stone. The explicit Air entries cleared the corresponding Stone
voxels. This is recorded as manual Minecraft verification and is separate from
the automated binary inspection below.

Faithful Structure Block-style export must therefore materialize sparse
ProjectDocument empties as explicit Air entries. Prompt 15.2 still owns the
production materialization loop; this checkpoint does not implement it.

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

## Codec implementation

The approved dependency is `nbtify@2.2.0` (MIT). The production adapter lives
in `nbtify-minecraft-java-codec.ts` behind `MinecraftJavaNbtCodec` and uses the
actual package API:

- `read(bytes, { endian: 'big', compression: 'gzip', rootName: true, strict: true })`.
- `write(new NBTData(root, { rootName: '', endian: 'big', compression: 'gzip' }))`.
- nbtify `Int8`, `Int16`, `Int32`, `Float32`, `bigint`, typed arrays, and its
  `TAG_TYPE` list marker are mapped explicitly to the internal typed NBT model.

The adapter preserves Java big-endian encoding, unnamed root names, native
numeric tags, list element types, byte/int/long arrays, and Long precision.
nbtify uses browser `CompressionStream`/`DecompressionStream`; the current
target browsers therefore need those APIs plus BigInt and standard typed-array
support. Its only runtime dependency is `mutf-8`.

## Golden fixture status

The permanent reference fixture is:

`Frontend/src/app/core/persistence/minecraft-structure/fixtures/golden_1_21_1.nbt`

It is immutable, gzip-compressed, 1296 bytes, and has SHA-256
`fe1e881588eda3d8d262917e2aef7b01d25f0dee5c2a352466b7afaf1c4d49fe`.
It is Minecraft-generated reference data, not an exporter output.

Independent binary inspection confirmed an unnamed root Compound, DataVersion
3955, size `[5,4,5]`, palette length 14, blocks length 100, 83 explicit Air
entries, complete coordinate coverage, and two top-level entities:
`minecraft:glow_item_frame` and `minecraft:painting`. Palette states retain
String properties, including oak stairs, fences, chain, chest, and standing,
wall, hanging, and wall-hanging signs. Five block entities retain typed Chest,
Sign, and Hanging Sign compounds.

The typed contract is compatible with the observed root, INT/DOUBLE/COMPOUND/
STRING lists, palette properties, and nested block-entity tags. Permanent
semantic codec tests decode this binary fixture directly and also exercise a
typed encode/decode round-trip; they do not compare gzip bytes.

## Prompt 15.2 performance requirement

Verified explicit Air means future export cannot assume a sparse ProjectDocument
maps directly to a sparse `blocks` list:

- `64 × 18 × 64 = 73,728` voxels.
- `512 × 512 × 512 = 134,217,728` voxels.

Prompt 15.2 must benchmark memory amplification from compound/list objects,
main-thread blocking, gzip cost, canonical block ordering, and streaming or
chunked encoding. Codec choice must document whether it requires complete
in-memory materialization. The existing 512-axis product policy is unchanged;
no new export limit is invented here.

## Core exporter

`minecraft-structure-exporter.ts` converts a validated `ProjectDocument` to a
canonical `MinecraftStructureTemplate`, then uses the injected codec to emit a
gzip `.nbt` byte array. The UI, Blob/download flow, and menu action remain
disabled; the non-UI ZIP packaging layer consumes these exact bytes.

The exporter traverses voxels in deterministic `Y → Z → X` order and sorts the
palette by canonical state identity (`Name` plus sorted string Properties).
Occupied blocks are indexed by coordinate, giving `O(volume + placedBlocks)`
construction rather than scanning the project for every voxel. Every absent
voxel becomes explicit `minecraft:air`; Structure Void is never invented.
Missing and modded IDs retain their exact namespaced ID and state without asset
resolution. Duplicate coordinates, invalid versions/size/coordinates/IDs,
unsupported block entities, and non-empty decorations return diagnostics before
encoding. This phase always writes an empty `entities` list for supported core
projects; semantic block-entity and top-level entity export remains 15.3 scope.

Prompt 15.2.1 makes the block-entity capability boundary strict: every
`blockEntityData` value is rejected by the core exporter with
`unsupported-block-entity`, including semantic Sign and Decorated Pot data as
well as unknown or raw data. No block-entity data can pass validation and then
disappear from the emitted structure; intentional block-entity mapping remains
15.3 scope.

Generated Air uses the same canonical identity as an explicit Air block:
`structureStateIdentity('minecraft:air', {})`. Explicit and implicit Air
voxels therefore share one palette entry. Palette properties are emitted in
canonical sorted order as well as being used for identity.

The exporter smoke fixture
`Frontend/src/app/core/persistence/minecraft-structure/fixtures/exporter_smoke_1_21_1.nbt`
is a small exporter-generated file for manual Structure Block loading. It is
not a golden fixture. Manual Minecraft verification is **PASS (user report)**.
Its current integrity record is: 268 bytes, SHA-256
`9a32ab8c86687320396d8f24913dd0c5ad025632c8718958efacc44d729894cf`, gzip
compression, DataVersion `3955`, size `[3,2,3]`, three palette entries, and
18 block entries. Sixteen entries reference Air; the non-Air entries are Stone
and Oak Stairs with `facing=north`, `half=bottom`, `shape=straight`, and
`waterlogged=false`.

## Prompt 15.3 semantic block entities and entities

The exporter now maps only verified semantic data. The export menu, download
flow, ZIP/datapack packaging, and arbitrary raw-NBT preservation remain
disabled/deferred.

### Supported block entities

- Vanilla Sign-family blocks map to `minecraft:sign` or
  `minecraft:hanging_sign` with typed `front_text`, `back_text`, and
  `is_waxed` tags. Each side has exactly four String `messages`, String
  `color`, and Byte `has_glowing_text`; supplied `filtered_messages` are
  preserved as four String tags. Invalid colors, malformed lines, a
  sign/block mismatch, or non-empty raw data fail the export explicitly.
- `minecraft:decorated_pot` maps to the `minecraft:decorated_pot` Compound
  and preserves the semantic `back,left,right,front` sherd order. Valid
  namespaced IDs, including modded IDs, are retained. The `sherds` list is
  omitted for an all-`minecraft:brick` pot; invalid IDs and non-empty raw data
  fail explicitly. The older editor display helper may still normalize for
  visual editing, but the exporter never uses that lossy fallback.
- The current ProjectDocument has no persisted Conduit payload. Conduit is
  therefore UNSUPPORTED in this exporter rather than receiving guessed runtime
  fields or an invented block-entity record.
- `item-container` with `hostKind: "inventory-storage"` maps only verified
  vanilla block IDs: Chest and Barrel use 27 slots, Hopper uses 5 slots, and
  Furnace remains unsupported because the current semantic model cannot retain
  its burn/cook timers and recipe-use data losslessly. Chest/Barrel/Hopper emit
  their block-entity ID and `Items`; Hopper also emits the verified default
  `TransferCooldown: 0`. Empty inventories emit an empty `Items` list.
- Inventory slots are block-specific, integer, unique, and range-checked. The
  mapper rejects arbitrary block IDs, unknown raw fields, invalid components,
  duplicate slots, and out-of-range slots instead of guessing or dropping data.

### Supported top-level entities

Painting, Item Frame, and Glow Item Frame are emitted as StructureTemplate
`entities[]` entries. Each entry has typed Double `pos`, Int `blockPos`, and a
typed Compound `nbt`. Painting variants must be present in the active catalog
with verified dimensions; there is no missing-variant `kebab` or 1x1 fallback.
Painting facing uses the verified horizontal byte mapping south=0, west=1,
north=2, east=3. Item Frame and Glow Item Frame use the verified Facing
mapping down=0, up=1, north=2, south=3, west=4, east=5, plus typed Pos,
TileX/Y/Z, ItemRotation Byte, ItemDropChance Float, Fixed Byte, Invisible Byte,
and an optional typed item stack (`id` String, `count` Int). Item components
and invalid item IDs/counts fail explicitly. Decorations are sorted by anchor,
kind, facing, variant/item ID, rotation, and instance ID before export.

### Golden and smoke status

The immutable `golden_1_21_1.nbt` regression now asserts the observed Java
1.21.1 Chest `Items` list (Slot Byte, count Int, id String), Sign/Hanging Sign
compound shapes, Glow Item Frame Facing/ItemRotation bytes, and Painting
variant/facing tags. The generated fixture below is self-verified through the
production codec only; it is not independent Minecraft compatibility proof.

`exporter_be_entity_smoke_1_21_1.nbt` contains dimensions `10 x 4 x 8`, 320
explicit blocks (274 Air), a support wall, Sign and Hanging Sign block
entities, a non-default Decorated Pot with an item, Chest, Barrel, and Hopper
block entities, and Painting, Item Frame, and Glow Item Frame entities. Its
current integrity record is 1448 bytes, SHA-256
`db755a1c655ce46bcc906b18ed30bc3ee099b7844d81c9e3fab5ad92412ede83`.

### Sources

- [Minecraft 1.21.1 SignBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/SignBlockEntity.html)
- [Minecraft 1.21.1 DecoratedPotBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/DecoratedPotBlockEntity.html)
- [Minecraft 1.21.1 ChestBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/ChestBlockEntity.html)
- [Minecraft 1.21.1 BarrelBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/BarrelBlockEntity.html)
- [Minecraft 1.21.1 HopperBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/HopperBlockEntity.html)
- [Minecraft 1.21.1 AbstractFurnaceBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/AbstractFurnaceBlockEntity.html)
- [Minecraft 1.21.1 ConduitBlockEntity mappings](https://mappings.dev/1.21.1/net/minecraft/world/level/block/entity/ConduitBlockEntity.html)
- [Yarn ItemFrameEntity reference (1.21.1+build.1)](https://maven.fabricmc.net/docs/yarn-1.21.1%2Bbuild.1/net/minecraft/entity/decoration/ItemFrameEntity.html) (field-name cross-check; native 1.21.1 tags are locked by the golden fixture)
- [Yarn BlockAttachedEntity reference (1.21.1+build.3)](https://maven.fabricmc.net/docs/yarn-1.21.1%2Bbuild.3/net/minecraft/entity/decoration/BlockAttachedEntity.html) (attachment position and `canStayAttached` contract)
- [Deobfuscated Java 1.21.1 ItemFrameEntity source](https://raw.githubusercontent.com/Soumeh/1.21.1-Deobfuscated/main/minecraft/src/net/minecraft/entity/decoration/ItemFrameEntity.java) (fixed/support survival check and persisted frame tags)
- [Minecraft 1.21.1 Painting mappings](https://mappings.dev/1.21.1/net/minecraft/world/entity/decoration/Painting.html)
- [Java 1.21.1 StructureTemplate mappings](https://maven.fabricmc.net/docs/yarn-1.21.1%2Bbuild.1/net/minecraft/structure/StructureTemplate.html)
- The independent Minecraft-generated `golden_1_21_1.nbt` fixture is the
  primary source for observed native tag types and wrapper shape.

## Prompt 15.4.2 hanging-entity survival and block-entity completeness

The exporter now validates Painting, Item Frame, and Glow Item Frame
decorations against the complete ProjectDocument before mapping any NBT. The
support lookup is built once from resolved non-Air project voxels (unknown or
missing blocks do not qualify as verified support), and normal frames require the
exact block immediately behind their anchor for all horizontal facings. A
Painting uses its catalog dimensions and requires every backing voxel in its
footprint. Fixed Item Frames and Glow Item Frames retain the verified fixed
survival exception and therefore do not require a support voxel in this editor
contract. Invalid decorations fail the entire export; they are never pruned,
moved, made fixed, or replaced with fabricated support.

Decorated Pot data now optionally preserves its stored `item` ItemStack in the
typed `item` compound while retaining the lossless `back,left,right,front`
sherd order. Verified inventory storage maps are block-specific: Chest and
Barrel use 27 slots, Hopper uses 5 slots and emits `TransferCooldown: 0`, and
Furnace remains explicitly unsupported because its operational burn/cook and
recipe-use fields are not represented by the current semantic model. Slot
numbers are byte tags; item IDs are strings and counts are ints. Unsupported
components, unknown raw fields, invalid IDs/counts, duplicate slots, and
out-of-range slots fail explicitly.

Project persistence treats these additions as optional fields; no schema bump
was required. The committed smoke artifacts were regenerated through the
production exporter and ZIP writer, include a support wall plus all three
hanging entity types and Chest/Barrel/Hopper/Pot examples, and remain
**EXPORTER-GENERATED - NOT A GOLDEN**. They have not yet been manually checked
in Minecraft after the attachment survival timer.

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

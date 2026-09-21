# Minecraft Java 1.21.1 Asset Policy

This document defines how MinecraftBuilder obtains and uses Minecraft Java Edition 1.21.1 assets during development.

The goal is to keep the asset pipeline reproducible without committing the full set of Minecraft vanilla assets to this repository.

## 1. Scope

MinecraftBuilder needs Minecraft Java 1.21.1 resources for:

- block registry/catalog generation;
- BlockState parsing;
- block model resolution;
- texture lookup;
- English display-name lookup;
- representative rendering fixtures and tests.

The relevant resource paths are:

```text
assets/minecraft/blockstates/
assets/minecraft/models/block/
assets/minecraft/textures/block/
assets/minecraft/lang/en_us.json
```

## 2. Asset source

Use a Minecraft Java 1.21.1 client JAR that already exists on the developer or user's machine.

Do not make the repository depend on a third-party mirror of the complete Minecraft client assets.

### Modrinth App

For Modrinth App installations on Windows, Minecraft metadata and version files are commonly stored below:

```text
%APPDATA%\ModrinthApp\meta\
```

The development environment used when this policy was written verified a Minecraft 1.21.1 version JAR under:

```text
%APPDATA%\ModrinthApp\meta\versions\1.21.1-0.19.2\1.21.1-0.19.2.jar
```

Do not assume this exact loader/version directory exists on every machine. The extractor must accept a user-selected JAR path or discover a suitable local installation.

A developer can search Modrinth's local files with PowerShell:

```powershell
Get-ChildItem "$env:APPDATA\ModrinthApp" -Recurse -Filter "*.jar" -ErrorAction SilentlyContinue |
Where-Object { $_.Name -match "1\.21\.1|client" } |
Select-Object FullName, Length, LastWriteTime
```

## 3. Verified resource structure

The selected local JAR was verified to contain Minecraft resources under:

```text
assets/minecraft/blockstates/
assets/minecraft/models/block/
assets/minecraft/textures/block/
assets/minecraft/lang/
```

The following command can be used to inspect the relevant entries:

```powershell
$jar = "<path-to-minecraft-1.21.1-jar>"

tar -tf $jar |
Select-String '^assets/minecraft/(blockstates|models/block|textures/block|lang)/' |
Select-Object -First 30
```

The English language file was also verified:

```powershell
$entries = tar -tf $jar
$entries -contains "assets/minecraft/lang/en_us.json"
```

Expected result:

```text
True
```

## 4. Repository policy

### Commit to Git

The repository may contain:

- extractor/parser source code;
- normalized catalog schemas;
- documentation;
- small representative test fixtures;
- manually created or minimal generated test data when appropriate;
- tests that verify BlockState/model parsing behavior.

### Do not commit

Do not commit:

- the full Minecraft client JAR;
- a full extracted copy of vanilla assets;
- the complete vanilla texture set;
- local extraction caches;
- temporary parser output;
- machine-specific absolute paths.

MinecraftBuilder should be able to regenerate its local development cache from a locally available Minecraft Java 1.21.1 JAR.

## 5a. Authoritative item registry

Item Frame item eligibility is sourced from the normalized
`Frontend/public/assets/vanilla-item-registry-1.21.1.json`. This file is generated
from the Java 1.21.1 data-generator `reports/items.json` by
`Frontend/tools/generate-vanilla-item-registry.mjs`. Item model JSON files are
visual-only and are not used to decide whether an ItemStack can be selected.

## 5. Local extraction/cache strategy

The intended pipeline is:

```text
Local Minecraft 1.21.1 JAR
        |
        v
Asset reader / extractor
        |
        +--> blockstates
        +--> block models
        +--> texture references
        +--> en_us language entries
        |
        v
Normalized MinecraftBuilder catalog
        |
        +--> local development cache
        +--> representative fixtures/tests
```

The extractor should read only the resources required by MinecraftBuilder.

A full copy of the vanilla asset tree is not required in the repository.

## 5b. Composable content sources

Runtime resources are addressed through a generic `AssetResourceProvider` and
the explicit `CompositeAssetResourceProvider`. Each active content source has a
stable source identity and declares its owned namespaces; resources are routed
directly to that owner. The Vanilla source owns `minecraft`, and external
sources may reference Vanilla parents or textures without replacing it.

The normalized Vanilla cache is stored in IndexedDB by Minecraft version and is
never part of a project file. Imported Fabric resource-only mods are cached
separately and are activated only for their compatible project version.

## 6. Representative block fixture set

The following Minecraft 1.21.1 blocks are the initial representative set.

| Category | Block ID |
|---|---|
| Cube | `minecraft:stone` |
| Slab | `minecraft:stone_slab` |
| Stairs | `minecraft:oak_stairs` |
| Fence | `minecraft:oak_fence` |
| Wall | `minecraft:cobblestone_wall` |
| Pane | `minecraft:glass_pane` |
| Standing sign | `minecraft:oak_sign` |
| Wall sign | `minecraft:oak_wall_sign` |
| Door | `minecraft:oak_door` |
| Trapdoor | `minecraft:oak_trapdoor` |
| Torch | `minecraft:torch` |
| Wall torch | `minecraft:wall_torch` |
| Plant | `minecraft:dandelion` |
| Fluid | `minecraft:water` |

The local Minecraft 1.21.1 JAR was verified to contain a BlockState JSON entry for every block in this set.

PowerShell verification:

```powershell
$entries = tar -tf $jar

$blocks = @(
    "stone",
    "stone_slab",
    "oak_stairs",
    "oak_fence",
    "cobblestone_wall",
    "glass_pane",
    "oak_sign",
    "oak_wall_sign",
    "oak_door",
    "oak_trapdoor",
    "torch",
    "wall_torch",
    "dandelion",
    "water"
)

$blocks | ForEach-Object {
    $path = "assets/minecraft/blockstates/$_.json"

    [PSCustomObject]@{
        Block = $_
        BlockStateExists = $entries -contains $path
    }
}
```

## 7. Special rendering cases

The presence of a BlockState or model resource does not mean that MinecraftBuilder can render every block correctly using a generic JSON-model pipeline.

### Water

`minecraft:water` must be treated as a special/partial rendering case.

For the MVP it may participate in:

- catalog lookup;
- project storage;
- JSON import/export;
- state preservation;
- placeholder/partial visualization.

Do not assume that water can be rendered correctly as a normal opaque block model.

### Signs

`minecraft:oak_sign` and `minecraft:oak_wall_sign` should initially be treated as partial/special cases.

The model pipeline may resolve their base geometry, but sign text and other block-entity-specific rendering are outside the first generic block-model pass.

Unknown or unsupported rendering behavior must not cause the block to be silently replaced with `minecraft:air`.

## 8. Support levels

MinecraftBuilder uses:

```text
full
partial
fallback
```

Suggested interpretation:

- `full`: the available resource/state pipeline can represent the block adequately;
- `partial`: the block is recognized and substantially represented, but some runtime/special behavior is not implemented;
- `fallback`: the registry ID and state are preserved, but the renderer cannot accurately represent the block.

Support level describes MinecraftBuilder's current implementation capability, not whether a Minecraft block is valid.

## 9. Generated catalog

A generated vanilla catalog may contain normalized metadata such as:

- registry ID;
- namespace;
- display name;
- default/known BlockState information;
- model references;
- texture references;
- support level;
- source Minecraft version.

Generated data must identify its source version:

```text
minecraftVersion: 1.21.1
```

The application must reject or explicitly handle incompatible catalog versions rather than silently mixing resources from different Minecraft versions.

## 10. Development rules

When working on Minecraft asset support:

1. Treat Minecraft Java Edition `1.21.1` as the verified behavior profile. Other
   selected releases may use generic resource-derived rendering only.
2. Do not invent vanilla block/model behavior when a fixture can be checked.
3. Do not silently replace missing or unsupported blocks with `minecraft:air`.
4. Keep parsing/model-resolution code independent from Angular UI.
5. Keep Three.js render objects out of persistent project/domain data.
6. Add representative fixtures before expanding support for a new model family.
7. Preserve registry IDs and BlockState data even when visual support is partial.
8. Stop and inspect real assets when behavior cannot be verified from the current fixture set.

## 11. Checkpoint status

This asset-source checkpoint is considered complete because:

- the runtime source resolves official client JARs through Mojang's Piston metadata;
- the required resource directory structure has been verified;
- `en_us.json` has been verified;
- the representative BlockState fixture set has been verified;
- the repository policy avoids depending on a committed full vanilla asset tree;
- the asset source can be rediscovered or selected on another development machine;
- manual File API JAR import remains available as an explicit fallback.

The next implementation stage may proceed using this policy and the representative fixture set.

## 12. Browser asset loading implementation

For the selected project version, MinecraftBuilder first restores an exact
version from IndexedDB, then resolves and downloads the official client JAR via
Mojang's Piston metadata, and finally offers a user-selected JAR/ZIP as a
manual fallback. The browser reads the ZIP central directory locally and only
extracts namespaced JSON/PNG resources under `assets/`. The file is never sent
to a server and the application does not depend on a machine-specific path.

Normalized resources are cached in IndexedDB database
`minecraft-builder-assets`, store `asset-bundles`, under the exact Minecraft
version key (for example `1.21.1` or `1.20.6`). Project documents contain no
asset bytes. A cached bundle is restored on the next editor session; selecting
another project version never activates a different version's cache.
The normalized asset-cache schema is currently version 2. Version 1 used the
same resource payload, so it is migrated in place: JSON, PNG, language, and tag
resources are retained while only the metadata schema marker is upgraded. An
unsupported or incomplete bundle is not presented as ready; the registry-only
catalog remains available and the UI reports that import is required. Users do
not need to clear IndexedDB manually.

Supported resources are:

- namespaced blockstate JSON;
- namespaced model JSON and parent models;
- generic namespaced PNG textures;
- namespaced language JSON resources under `assets/<namespace>/lang/`.

For 1.21.1, the runtime catalog uses the bundled normalized
`vanilla-block-registry-1.21.1.json` and `VanillaBehaviorRegistry`. For other
selected releases, entries are derived from the downloaded resources and their
behavior/default-state support remains unknown unless separately verified.
English display names come independently from the selected JAR's `en_us.json`;
visual resources come from its blockstates/models/textures. Missing visual
resources therefore cannot erase canonical registry state or behavior metadata.

### Version-aware support levels

Every release entry exposed by Mojang's official release manifest may be
selected and the browser attempts to download that exact client JAR. Download
success is reported separately from editor resource support:

- `verified`: the exact Minecraft Java 1.21.1 profile, including the checked
  registry and behavior metadata;
- `resource-compatible`: a modern JSON blockstate/model resource layout that
  can be normalized generically, without borrowing 1.21.1 behavior data;
- `legacy-limited`: legitimate older resources were extracted, but generic
  model reconstruction is intentionally limited;
- `unsupported-resource-format`: the archive was read but contains no resource
  families currently understood by the provider.

The status and activity feed distinguish cache lookup, official metadata,
download/checksum verification, normalization, cache save, and activation.
Activity is ephemeral (bounded to the most recent 100 events) and is not part
of `ProjectDocument`. A format mismatch is never reported as a network failure
and does not cause an unknown block to be replaced with `minecraft:air`.

The normalized registry is generated from Minecraft Java 1.21.1 data-generator
output `reports/blocks.json` with:

```text
node tools/generate-vanilla-block-registry.mjs <reports/blocks.json> public/assets/vanilla-block-registry-1.21.1.json
```

Generation fails if an entry has anything other than exactly one state marked
`default: true`, or if a default value is absent from its property's allowed
values. The authoritative report contains 1060 block entries. The earlier
blockstate-derived count of 1062 also included `minecraft:item_frame` and
`minecraft:glow_item_frame`; those are entity visuals and are not block registry
entries.

Textures use cached object URLs and shared decoded Three.js textures with
nearest-neighbor filtering. Resolver/model failures preserve the registry ID and
BlockState and retain the fallback cube with diagnostics metadata. No client JAR
or extracted tree is committed; official resources are normalized locally in the
browser.

## 13. Active provider lifecycle and render diagnostics

`VanillaAssetsService` owns the single active asset provider and its paired
`VanillaBlockVisualProvider`. Import or IndexedDB restore replaces both as one
generation. The previous visual provider disposes decoded texture/cache state,
thumbnail URLs are cleared, the catalog is regenerated, and both Three.js
viewports receive the new visual provider through their existing reactive sync.
This rebuilds placed visuals and ghosts without replacing the project, camera,
selection, mode, or current Y.

Fallback results are not retained across provider generations. Resolver output
records the blockstate resource, matched variant, selected model IDs, parent
resources, element/face counts, and resolved texture resources. The visual stage
records PNG availability, decode success, geometry/mesh creation, final bounds,
and a render mode of `real`, `partial`, or `fallback`. Missing model, missing PNG,
decode failure, geometry failure, and unexpected provider failures have explicit
diagnostic codes rather than being silently swallowed.

Verified catalog entries are downgraded from declared `full` support when their
default state cannot resolve a model or required PNG in the active bundle. Theme
updates skip real-model materials, so switching Light/Dark changes viewport
helpers and overlays without replacing texture maps.

Startup intentionally allows the viewport and asset restore to proceed
independently:

1. the editor mounts a demand-rendered Three.js scene with an asset-independent
   bootstrap grid and bounds;
2. the active project ID is restored from a small browser-storage pointer while
   the project document itself remains in IndexedDB;
3. the asset cache opens and migrates compatible metadata in place;
4. a validated `VanillaAssetProvider` becomes the active provider generation;
5. the catalog, placed visuals, thumbnails, and ghost refresh against that same
   generation without replacing the camera or project.

Development diagnostics report project/cache status, cache schema, provider
generation, resource count, Stone blockstate/model/texture availability, canvas
dimensions, renderer/scene/camera/controls creation, theme and resize state,
grid/bounds presence, and demand-render count. Diagnostics are emitted only on
bootstrap/state transitions, never once per frame. The asset UI distinguishes
loading cached assets, no assets, ready, import required, and cache errors.

## 14. Full-catalog coverage audit

The headless `VanillaAssetCoverageAuditor` scans every authoritative registry entry
without creating a viewport or one renderer per block. It records default-state
provenance, blockstate kind/match, selected models and parents, elements/faces,
PNG availability/decode, geometry bounds, render mode, thumbnail availability,
and structured failure reasons. Work is batched, reports progress, and supports
an abort signal for browser/dev-tool callers.

Support is split into independent concepts:

- Behavior Support: `full`, `partial`, or `unknown`, covering placement,
  neighbor, support, and multi-block rules.
- Visual Support: `real`, `partial`, or `fallback`, covering blockstate/model,
  texture, geometry, and thumbnail rendering.

The generated reports are `Docs/vanilla-asset-coverage-1.21.1.json` and
`Docs/vanilla-asset-coverage-1.21.1.md`. All 1060 entries now have authoritative
defaults. The current remaining visual gaps are classified separately as
standard JSON failures, `SPECIAL_RENDERER_REQUIRED`, or
`INTENTIONALLY_INVISIBLE`; special/runtime-rendered blocks are not counted as
successful generic JSON geometry.

## 15. Asset bundles and default source priority

`AssetBundle` is the normalized resource contract shared by vanilla and future
mod imports. For an active project, startup resolves the exact Minecraft version
from IndexedDB, then downloads the official client through Mojang's Piston
metadata flow, and finally offers an explicit File API JAR import fallback. The
raw client JAR is parsed in the browser and is never uploaded by the editor. The
Block Browser presents a thumbnail/name/source grid;
technical support diagnostics remain in details/debug paths. Static special
visual adapters currently cover beds, containers, signs, banners, heads, and
shulker boxes without changing canonical behavior or block-entity data.

Block Browser thumbnails use one lazy offscreen Three.js renderer per active
asset provider. Results are cached by provider generation, registry ID, state,
and thumbnail renderer version; when WebGL generation fails, the existing
asset-backed texture thumbnail remains the fallback. Bed special visuals use the
verified `textures/entity/bed/<color>.png` resource when available and remain
Partial because they do not implement block-entity runtime behavior.

Vanilla Bed uses `assets/minecraft/textures/entity/bed/<dye-color>.png`, not a
normal block-model texture. Its special visual is represented by a versioned
provider and a reusable renderer-independent `SpecialModelDescriptor`:
provider metadata, texture size/resource, ModelPart hierarchy, cuboids, pivots,
rotations, mirror flag, state transform, and bounds. The verified Java 1.21.1
Bed provider is reused when the selected provider exposes the same bed
state/resource contract; it is not disabled solely because the version string
differs. Later vanilla/mod providers can coexist without changing the Three.js
descriptor consumer. A custom Java-only renderer remains Partial/Fallback
rather than guessed or executed in the browser.

Special ModelPart descriptors retain raw model-space cuboid coordinates and a
pitch/yaw/roll transform. The Three.js evaluator converts cuboid vertices from
Minecraft units once, applies the explicit `rotationZYX(roll, yaw, pitch)`
order, and preserves descriptor hierarchy. Geometry is never bounds-centred or
otherwise normalised in the world renderer.
# Java 1.21.1 Sign block entities

MinecraftBuilder keeps the four canonical registry forms for each verified
vanilla wood family: `<wood>_sign`, `<wood>_wall_sign`,
`<wood>_hanging_sign`, and `<wood>_wall_hanging_sign`. Each is an explicit
placement contract in the current editor; placement never switches an ID based
on the clicked face. Imported project data always retains its exact registry ID.

The Java 1.21.1 special-visual provider uses ModelPart descriptors and the
`entity/signs/<wood>` or `entity/signs/hanging/<wood>` texture resource. It
handles standing/wall stick visibility, hanging attached chains, and the wall
hanging plank without a viewport-specific mesh path. Sign text is persisted as
front/back four-line data with colour, glow, waxed, and optional filtered-message
preservation. Rich JSON text components remain in raw extension data until NBT
import/export is implemented.

Text width currently uses an isolated conservative fallback metric service:
normal signs are 90 pixels / 10 line-height and hanging signs are 60 pixels / 9
line-height. A future Java font-atlas metric provider can replace it without
changing project data or the inspector.

# Java 1.21.1 Decorated Pot

Decorated Pots use the dedicated special visual provider rather than the
generic block-model path. The provider requests the verified entity resources
`decorated_pot_base` plus one independent side resource for each physical side;
missing resources produce Partial diagnostics while preserving the pot and its
canonical state.

Project block-entity data stores named `back`, `left`, `right`, and `front`
sherds. The NBT mapper emits those values in Minecraft's codec order and omits
`sherds` when all sides are the default `minecraft:brick`. Unknown sherd IDs
fall back to the blank side texture and are never used to construct arbitrary
resource paths. The current local asset cache remains the only source for
textures; no vanilla JAR or extracted asset tree is committed.

# Java 1.21.1 Conduit

Conduit is an entity-rendered block in the local visual pipeline. The static
editor adapter loads only `minecraft:entity/conduit/base` and renders the
vanilla inactive shell at its source 6/16 voxel size. Activation frame checks,
eye state, wind layers, ticks, particles, and target entities remain runtime
Minecraft behavior and are not simulated by the editor.

# Java 1.21.1 Water and Lava

`minecraft:water` and `minecraft:lava` use a dedicated neighbor-aware fluid
surface path rather than generic block-model geometry. The viewport passes an
O(1) project coordinate map so level-derived heights, weighted corner slopes,
static flow UV orientation, and same-fluid face culling remain local and
deterministic.

The normal palette identity is `minecraft:water_bucket` or
`minecraft:lava_bucket`; the stored structure block remains water/lava with a
canonical `level` property. No fluid ticks, spreading, source regeneration,
water/lava reactions, or bucket inventory behavior are implemented.

Water and lava use the local `water_still`/`water_flow` and
`lava_still`/`lava_flow` resources. When a `.png.mcmeta` descriptor is
available, the renderer creates a nearest-filtered static animation-frame view
without mutating the shared texture cache. Water uses a neutral preview tint
because biome color data is not part of the project model; water-overlay
selection and biome sampling remain future work.
## Decorations resources

The local asset provider retains `data/<namespace>/painting_variant/*.json` and
`data/<namespace>/tags/painting_variant/*.json` alongside block resources. The
editor uses the verified Java 1.21.1 fallback painting table when data resources
are unavailable. Painting textures resolve from `textures/painting/<id>.png`;
frame visuals use the existing namespaced texture provider. Item-frame item
search indexes item model paths and language data only; item model resolution is
lazy when a frame is rendered.

## Version-aware common behavior and compatibility reports

The verified 1.21.1 behavior registry is evidence for that exact version; it is
not a global gate for every later or earlier resource bundle. Other versions are
evaluated against common resource/state contracts first. A matching contract can
reuse generic behavior (for example doors, buttons, stairs, and compatible
connection families) while a changed contract is reported as requiring a delta.
Unknown or mod-specific behavior remains `unknown` and is never inferred only
from a registry-name heuristic.

Common default states carry provenance: `compatible-common` means a complete
contract supplied the canonical defaults, `resource-derived` means semantic
resource defaults were justified, and `resource-render-fallback` means a
deterministic renderable branch was selected without semantic proof. This
provenance is catalog metadata and is not written into `ProjectDocument`.

`VanillaAssetsService` generates an in-memory compatibility report after a
provider is activated. The report separates `compatible-reused`,
`changed-needs-delta`, `new-generic-supported`, and `unsupported` entries and
can be exported as a versioned JSON diagnostics file from Asset Manager. It is
not a project-file or asset-cache dependency.

Manual imports, official downloads, and normalized cache writes are protected
operations. The browser receives a `beforeunload` warning while one is active;
editor navigation asks for the same confirmation and otherwise leaves project
data untouched.

## Version-aware behavior and special-resource compatibility

The active Vanilla provider discovers blockstate IDs, tags, models, and entity
resources for the selected version. Common behavior is reused only after its
state contract is validated: connection families require fence/pane evidence,
walls retain the `none|low|tall` domain, and complete multi-block/candle/fluid/
placement contracts provide deterministic defaults. A changed contract is
reported as a delta and its target evidence is not overwritten.

Special adapters (beds, containers, signs, banners, heads, shulkers, pots, and
conduits) expose a compatibility/resource inventory. The renderer can show a
partial special visual with diagnostics when a required texture is absent; the
compatibility report marks that family as missing-resource. Adapter model names
identify the geometry baseline only and are not runtime version gates.

Standing/wall logical items are formed from concrete IDs discovered in the
active catalog. Vanilla pairs require both counterparts; non-vanilla pairs need
explicit behavior metadata. Unknown mod content remains generic or unknown and
is never silently replaced with `minecraft:air`.

## Target item definitions and cache schema

The Vanilla extractor retains the selected version's normalized blockstate,
model, texture, language, tag, decoration, and
`assets/<namespace>/items/*.json` resources. Modern item definitions are
normalized as `TargetItemEvidence`; a legacy adapter may use
`models/item/*.json` when that is the only available item signal. Raw client JAR
bytes are never stored in IndexedDB.

The normalized Vanilla cache schema is `3`. Changing the retained resource set
invalidates older bundles so a selected version is rebuilt instead of appearing
ready with incomplete item evidence. BlockCatalog and PlaceableItem catalog
remain separate: internal world blocks are preserved for rendering and import,
while palette entries require item evidence or a verified logical rule.

## Generic render normalization

Blockstate-derived default values are independent from behavior compatibility,
so ordinary target blocks remain renderable even when placement behavior is not
verified. Texture maps accept legacy strings and structured sprite values;
`force_translucent` is preserved as a render hint. Configured model x/y/z
rotations share one representation, and element shade-direction metadata is
applied through the renderer's deterministic unlit directional factor.

The current renderer applies explicit shade-direction metadata as a stable
directional material factor while retaining legacy `shade` semantics. This is
an editor approximation, not biome/light simulation. Classic entity-bed visuals
remain resource-contract dependent; unknown/new bed families can retain shared
behavior while falling back to generic JSON when the classic entity texture is
absent.

The final domain classifier keeps Painting, Item Frame, and Glow Item Frame in
the Decoration route rather than the BlockCatalog/PlaceableItem route. An item
resource proves that an item exists, not that a same-ID world block is
placeable; direct palette eligibility combines target item evidence with world
block evidence and conservative Java semantic rules.

## Item/catalog source boundary

Every normalized source exposes `blocks` and an independent `targetItems`
catalog. `BlockLibraryService` uses both inputs. A target item may map to a
different concrete world block (for example Water Bucket -> Water or Lava
Bucket -> Lava); the item and block registry IDs are never conflated. If an
inspected target has no usable item evidence, the normal palette stays
conservative rather than treating every blockstate as an item. Legacy item
models are accepted as existence evidence, including nested resource paths.

The content classifier only applies Vanilla suffix semantics inside the
`minecraft` namespace. Internal world variants (wall signs, potted blocks,
crop states, and similar concrete forms) remain in the world catalog and can
be serialized, but are not independent palette entries. Item Frame, Glow Item
Frame, and Painting are decorations and are serialized through the decoration
route, not as voxel blocks.

Default-state reporting distinguishes a semantic `resource-derived` value from
a merely renderable `resource-render-fallback` branch. The latter must not
override authoritative, fixture, or compatible-common state evidence.

The committed 26.3 report was generated from the official client JAR after
extraction with:

```text
tar -xf client.jar -C extracted
cd Frontend
node tools/audit-vanilla-assets.mjs ../extracted 26.3
```

The command writes `Docs/vanilla-asset-coverage-26.3.json` and `.md` without
copying the JAR or extracted assets into the repository.

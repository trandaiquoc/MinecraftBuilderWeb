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

Any local generated cache directory must be excluded by `.gitignore`.

Recommended local-only cache name:

```text
Frontend/.minecraft-assets/
```

If this directory is adopted, add:

```gitignore
Frontend/.minecraft-assets/
```

to the repository `.gitignore`.

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

1. Target Minecraft Java Edition `1.21.1`.
2. Do not invent vanilla block/model behavior when a fixture can be checked.
3. Do not silently replace missing or unsupported blocks with `minecraft:air`.
4. Keep parsing/model-resolution code independent from Angular UI.
5. Keep Three.js render objects out of persistent project/domain data.
6. Add representative fixtures before expanding support for a new model family.
7. Preserve registry IDs and BlockState data even when visual support is partial.
8. Stop and inspect real assets when behavior cannot be verified from the current fixture set.

## 11. Checkpoint status

This asset-source checkpoint is considered complete because:

- a local Minecraft Java 1.21.1 JAR source has been identified;
- the required resource directory structure has been verified;
- `en_us.json` has been verified;
- the representative BlockState fixture set has been verified;
- the repository policy avoids depending on a committed full vanilla asset tree;
- the asset source can be rediscovered or selected on another development machine.

The next implementation stage may proceed using this policy and the representative fixture set.

## 12. Browser asset loading implementation

MinecraftBuilder accepts a user-selected Minecraft Java 1.21.1 JAR or ZIP in
the Block Browser. The browser reads the ZIP central directory locally and only
extracts namespaced JSON/PNG resources under `assets/`. The file is never sent
to a server and the application does not depend on the machine-specific
Modrinth path.

Normalized resources are cached in IndexedDB database
`minecraft-builder-assets`, store `asset-bundles`, under version key `1.21.1`.
Project documents contain no asset bytes. A cached bundle is restored on the
next editor session; selecting another JAR replaces that local asset bundle.
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
- `assets/minecraft/lang/en_us.json`.

The runtime catalog entry set, property definitions, and default BlockStates
come from the bundled normalized `vanilla-block-registry-1.21.1.json`. English
display names come independently from the selected JAR's `en_us.json`; visual
resources come from its blockstates/models/textures; verified behavior comes
from `VanillaBehaviorRegistry`. Missing visual resources therefore cannot erase
canonical registry state or behavior metadata.

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
BlockState and retain the fallback cube with diagnostics metadata. No full JAR,
extracted tree, or texture cache is committed; `Frontend/.minecraft-assets/` is
reserved and gitignored for optional developer extraction workflows.

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
mod imports. Startup resolves an optional gitignored local development bundle at
`Frontend/public/local-assets/vanilla/1.21.1/asset-bundle.json`, then IndexedDB,
and finally an explicit File API JAR import. Generate the local-only bundle from
a user-owned JAR with `node tools/build-local-vanilla-bundle.mjs <jar-path>`.
It is never committed. The Block Browser presents a thumbnail/name/source grid;
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
Bed provider is selected only for that exact asset-provider version. Later
vanilla/mod providers can coexist without changing the Three.js descriptor
consumer. A custom Java-only renderer remains Partial/Fallback rather than
guessed or executed in the browser.

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

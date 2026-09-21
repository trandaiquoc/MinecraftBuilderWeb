# Vanilla Asset Coverage - Minecraft Java 26.3

Generated from `Mojang official Java 26.3 client.jar` at 2026-09-21T17:25:47.883Z.

## Summary

- Total authoritative block entries: **1286**
- Visual: REAL **1190**, PARTIAL **70**, FALLBACK **26**
- Special renderer required: **91**
- Intentionally invisible: **5**
- Behavior: Full **142**, Partial **194**, Unknown **950**
- Thumbnail: real **1190**, fallback **70**, unavailable **26**
- Default state: known **1286**, unknown **0**

## Methodology

- Catalog entries and default states come from the selected Minecraft 26.3 asset source.
- Display names come from the active en_us language resource; visual resources and behavior metadata remain independent.
- Geometry is built headlessly through the production resolver/geometry provider without a viewport.
- PNG decode uses createImageBitmap when available and a strict PNG container check in headless tooling.

## Top Failure Reasons

- NO_ELEMENTS: **96**
- SPECIAL_RENDERER_REQUIRED: **91**
- INTENTIONALLY_INVISIBLE: **5**

## Representative Samples

### NO_ELEMENTS (96)

- `minecraft:air`
- `minecraft:barrier`
- `minecraft:black_banner`
- `minecraft:black_shulker_box`
- `minecraft:black_wall_banner`
- `minecraft:blue_banner`
- `minecraft:blue_shulker_box`
- `minecraft:blue_wall_banner`
- `minecraft:brown_banner`
- `minecraft:brown_shulker_box`

### SPECIAL_RENDERER_REQUIRED (91)

- `minecraft:barrier`
- `minecraft:black_banner`
- `minecraft:black_shulker_box`
- `minecraft:black_wall_banner`
- `minecraft:blue_banner`
- `minecraft:blue_shulker_box`
- `minecraft:blue_wall_banner`
- `minecraft:brown_banner`
- `minecraft:brown_shulker_box`
- `minecraft:brown_wall_banner`

### INTENTIONALLY_INVISIBLE (5)

- `minecraft:air`
- `minecraft:cave_air`
- `minecraft:light`
- `minecraft:structure_void`
- `minecraft:void_air`

## Family Distribution

- other: 732
- slabs: 101
- stairs: 97
- banners-signs: 84
- plants: 64
- walls: 32
- containers: 29
- doors: 22
- trapdoors: 22
- panes-bars: 18
- beds: 17
- crops: 16
- fences: 14
- heads-skulls: 14
- redstone-like: 12
- torches: 7
- rails: 3
- fluids: 2

## Current Manual Visual Observations

- Slabs: Real 101, Partial 0, Fallback 0; `minecraft:stone_slab` is REAL (no asset diagnostic).
- Stairs: Real 97, Partial 0, Fallback 0; `minecraft:oak_stairs` is REAL (no asset diagnostic).
- Bed: `minecraft:red_bed` is REAL (no asset diagnostic).
- Trapdoor: `minecraft:oak_trapdoor` is REAL (no asset diagnostic).
- Wall Torch: REAL (no asset diagnostic).
- Fence: REAL (no asset diagnostic); neighbor refresh is covered by the rule-engine smoke tests.
- Door: REAL (no asset diagnostic); atomic lower/upper placement is covered by the rule-engine smoke tests.
- Sunflower: REAL (no asset diagnostic); atomic lower/upper placement is covered by the rule-engine smoke tests.
- Dandelion: REAL (no asset diagnostic).
- Glass Pane: REAL (no asset diagnostic).
- Wall: REAL (no asset diagnostic).

These classifications only describe the asset/model pipeline. A Real visual does not imply correct placement or neighbor behavior.

## Remaining Follow-ups

1. Add dedicated renderers for entries classified SPECIAL_RENDERER_REQUIRED.
2. Add verified render-layer/tint metadata after profiling the affected Partial set; do not infer it from registry names.
3. Keep behavior issues in the rule engine; visual audit results are not evidence of placement correctness.


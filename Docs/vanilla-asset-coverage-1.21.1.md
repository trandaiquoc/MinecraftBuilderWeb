# Vanilla Asset Coverage - Minecraft Java 1.21.1

Generated from `1.21.1-0.19.2.jar` at 2026-09-17T15:49:43.344Z.

## Summary

- Total authoritative block entries: **1060**
- Visual: REAL **919**, PARTIAL **1**, FALLBACK **140**
- Special renderer required: **135**
- Intentionally invisible: **5**
- Behavior: Full **114**, Partial **41**, Unknown **905**
- Thumbnail: real **919**, fallback **1**, unavailable **140**
- Default state: known **1060**, unknown **0**

## Methodology

- Catalog entries and default states come from the normalized Minecraft 1.21.1 reports/blocks.json registry.
- Display names come from the active en_us language resource; visual resources and behavior metadata remain independent.
- Geometry is built headlessly through the production resolver/geometry provider without a viewport.
- PNG decode uses createImageBitmap when available and a strict PNG container check in headless tooling.

## Top Failure Reasons

- NO_ELEMENTS: **140**
- SPECIAL_RENDERER_REQUIRED: **135**
- INTENTIONALLY_INVISIBLE: **5**
- TEXTURE_NOT_FOUND: **1**

## Representative Samples

### NO_ELEMENTS (140)

- `minecraft:acacia_hanging_sign`
- `minecraft:acacia_sign`
- `minecraft:acacia_wall_hanging_sign`
- `minecraft:acacia_wall_sign`
- `minecraft:air`
- `minecraft:bamboo_hanging_sign`
- `minecraft:bamboo_sign`
- `minecraft:bamboo_wall_hanging_sign`
- `minecraft:bamboo_wall_sign`
- `minecraft:barrier`

### SPECIAL_RENDERER_REQUIRED (135)

- `minecraft:acacia_hanging_sign`
- `minecraft:acacia_sign`
- `minecraft:acacia_wall_hanging_sign`
- `minecraft:acacia_wall_sign`
- `minecraft:bamboo_hanging_sign`
- `minecraft:bamboo_sign`
- `minecraft:bamboo_wall_hanging_sign`
- `minecraft:bamboo_wall_sign`
- `minecraft:barrier`
- `minecraft:birch_hanging_sign`

### INTENTIONALLY_INVISIBLE (5)

- `minecraft:air`
- `minecraft:cave_air`
- `minecraft:light`
- `minecraft:structure_void`
- `minecraft:void_air`

### TEXTURE_NOT_FOUND (1)

- `minecraft:heavy_core`

## Family Distribution

- other: 632
- banners-signs: 76
- slabs: 60
- stairs: 56
- plants: 52
- walls: 25
- containers: 21
- doors: 20
- trapdoors: 20
- panes-bars: 18
- beds: 16
- crops: 16
- heads-skulls: 14
- fences: 12
- redstone-like: 12
- torches: 5
- rails: 3
- fluids: 2

## Current Manual Visual Observations

- Slabs: Real 60, Partial 0, Fallback 0; `minecraft:stone_slab` is REAL (no asset diagnostic).
- Stairs: Real 56, Partial 0, Fallback 0; `minecraft:oak_stairs` is REAL (no asset diagnostic).
- Bed: `minecraft:red_bed` is FALLBACK (NO_ELEMENTS, SPECIAL_RENDERER_REQUIRED).
- Trapdoor: `minecraft:oak_trapdoor` is REAL (no asset diagnostic).
- Wall Torch: REAL (no asset diagnostic).
- Fence: REAL (no asset diagnostic); connection refresh remains a behavior issue.
- Door: REAL (no asset diagnostic); placement failure remains a behavior issue.
- Sunflower: REAL (no asset diagnostic); placement failure remains a behavior issue.
- Dandelion: REAL (no asset diagnostic).
- Glass Pane: REAL (no asset diagnostic).
- Wall: REAL (no asset diagnostic).

These classifications only describe the asset/model pipeline. A Real visual does not imply correct placement or neighbor behavior.

## Remaining Follow-ups

1. Add dedicated renderers for entries classified SPECIAL_RENDERER_REQUIRED.
2. Add verified render-layer/tint metadata after profiling the affected Partial set; do not infer it from registry names.
3. Keep behavior issues in the rule engine; visual audit results are not evidence of placement correctness.

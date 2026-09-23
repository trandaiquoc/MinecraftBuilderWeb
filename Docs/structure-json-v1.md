# MinecraftBuilder Structure JSON v1

Structure JSON is MinecraftBuilder's small, human-readable block-layout exchange format. It is separate from:

- **Project Backup**, which stores the complete editor project and uses `minecraftbuilder-project`.
- **Minecraft Structure (NBT)**, the native Minecraft structure format, which is not implemented yet.

## Contract

The top-level object contains:

- `format`: exactly `minecraftbuilder-structure`
- `formatVersion`: exactly `1`
- `minecraftVersion`: the target Minecraft version
- `name`: the exported project name (optional in the public contract)
- `blocks`: voxel blocks sorted by coordinate

Each exported block contains `id`, integer `x`, `y`, `z`, and an explicit `state` object. State keys are sorted alphabetically and values remain the canonical strings stored by MinecraftBuilder. Missing or unresolved blocks are exported exactly like resolved blocks; their namespaced IDs are preserved.

Exports use two-space indentation and a trailing newline. Blocks are ordered by X, then Y, then Z, then ID. Structure JSON does not include project IDs, schema versions, editor settings, groups, decorations, timestamps, block-entity data, sign text, inventories, or other NBT payloads.

## Canonical example

```json
{
  "format": "minecraftbuilder-structure",
  "formatVersion": 1,
  "minecraftVersion": "1.21.1",
  "name": "Example Structure",
  "blocks": [
    {
      "id": "minecraft:stone_bricks",
      "x": 0,
      "y": 0,
      "z": 0,
      "state": {}
    },
    {
      "id": "minecraft:oak_stairs",
      "x": 1,
      "y": 0,
      "z": 0,
      "state": {
        "facing": "north",
        "half": "bottom",
        "shape": "straight",
        "waterlogged": "false"
      }
    }
  ]
}
```

## External AI handoff

Copy the exported JSON together with these instructions:

> You are editing a MinecraftBuilder Structure JSON document. Return only valid `minecraftbuilder-structure` formatVersion 1 JSON. Preserve `format` and `formatVersion`. Use Minecraft Java block IDs in `namespace:path` form. Keep `x`, `y`, and `z` as integer coordinates. Keep state values as strings. Follow the requested design while respecting this schema. Do not include prose outside the JSON.

Importing Structure JSON is intentionally deferred to a later phase. The v1 export is read-only and does not provide semantics for block entities, decorations, groups, or editor metadata.

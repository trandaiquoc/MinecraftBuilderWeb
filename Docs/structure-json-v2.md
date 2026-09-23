# MinecraftBuilder Structure JSON v2

Version 2 extends the blocks-only v1 exchange format with a strict `decorations` array. The top-level `format` remains `minecraftbuilder-structure`; `formatVersion` is `2`.

## Decorations

Supported public kinds are `painting`, `item-frame`, and `glow-item-frame`. Each entry stores integer `anchor` coordinates and a canonical `facing`. Paintings store a non-empty `variantId`. Frames may store an item (`id`, optional positive `count`, extensible `components`), `rotation` (`0..7`), `invisible`, `fixed`, and `itemDropChance` (`0..1`). Internal instance IDs, entity IDs, group membership, browser metadata, and opaque `raw` fields are intentionally omitted.

Missing painting variants are reported as non-blocking asset diagnostics. Invalid bounds, support, collisions, or malformed decoration data block an import. Import validation uses the final candidate block layout so a decoration can be supported by a block in the same file.

## Import modes

- **Replace** replaces blocks and decorations. A v1 document remains blocks-only and preserves the current project decorations.
- **Merge** adds both collections and rejects coordinate/attachment conflicts.
- **New group** adds both collections and assigns the new group ID to imported blocks and decorations.

Every applied import is one history transaction. Existing v1 files and the v1 schema remain available for older tools.

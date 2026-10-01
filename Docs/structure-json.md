# MinecraftBuilder Structure JSON

Structure JSON is the current human-readable interchange format for blocks, supported decorations, and verified semantic block entities. It is separate from Project Backup, which keeps its own versioned package contract and remains the lossless backup format.

The top-level shape is:

```json
{
  "format": "minecraftbuilder-structure",
  "minecraftVersion": "1.21.1",
  "name": "Example",
  "blocks": [],
  "decorations": []
}
```

`blocks` contain namespaced `id`, integer `x/y/z`, optional canonical string `state` values, and optional verified semantic `blockEntity` data. Supported block entities are `container` (items by slot), `decorated-pot`, and `sign`; raw NBT is never embedded. Item `count` defaults to 1 and is omitted when it is 1. Components are accepted as semantic item data in this interchange format, but the NBT mapper reports an explicit unsupported diagnostic when it cannot represent them losslessly. Unsupported block-entity data is omitted from the public projection and shown as a warning in the export dialog; use Project Backup for full fidelity.

The public contract has no `formatVersion`. For migration, the parser accepts exactly the old top-level `formatVersion: 2` shape and normalizes it away. Other version values and unknown top-level fields are rejected. This narrow compatibility path does not change the public TypeScript/schema contract.

Replace import always replaces both `blocks` and `decorations`; an empty decorations array therefore clears current decorations. Merge and new-group modes append the imported content according to the import dialog's conflict checks.

The importer validates block-entity host compatibility, slot bounds, and item stack counts against the active catalog. Known max stack sizes come from the local vanilla item registry (`vanilla-item-registry-1.21.1.json`); unknown mod items are allowed only with count 1 and are never silently clamped. New exports and examples always use the canonical shape above; Project Backup compatibility is handled by its separate versioned package format.

The Import dialog's **Create with AI** tab builds a copy-ready prompt locally. It includes canonical instructions, the active Minecraft asset source/version, imported mod metadata and exact active external IDs, a canonical example, and the user's exact description. It does not contact an AI service, fetch or execute mod code, or dump the full vanilla catalog. The prompt explicitly preserves intentional Air gaps, avoids invented scaffolding, and keeps coordinates, states, IDs, counts, and multi-block objects valid.

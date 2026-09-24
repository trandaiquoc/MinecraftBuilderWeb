# MinecraftBuilder Structure JSON

Structure JSON is the current human-readable interchange format for blocks and supported decorations. It is separate from Project Backup, which keeps its own versioned package contract.

The top-level shape is:

```json
{
  "format": "minecraftbuilder-structure",
  "formatVersion": 2,
  "minecraftVersion": "1.21.1",
  "name": "Example",
  "blocks": [],
  "decorations": []
}
```

`blocks` contain only namespaced `id`, integer `x/y/z`, and optional canonical string `state` values. `decorations` contain supported paintings and item frames using their public anchor/facing/item fields. Project IDs, schema metadata, groups, editor settings, timestamps, block-entity data, and opaque decoration metadata are not exported.

Replace import always replaces both `blocks` and `decorations`; an empty decorations array therefore clears current decorations. Merge and new-group modes append the imported content according to the import dialog's conflict checks.

The importer accepts the current contract only. New exports and examples always use the canonical shape above; Project Backup compatibility is handled by its separate versioned package format.

AI instructions should request the current `minecraftbuilder-structure` schema, preserve integer coordinates and canonical Minecraft state values, and return JSON without prose.

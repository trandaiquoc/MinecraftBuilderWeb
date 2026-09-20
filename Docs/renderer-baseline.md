# Renderer Baseline

The viewport keeps persistent block and decoration entries across ordinary `ThreeViewportEngine.update()` calls. Structural changes are reconciled by coordinate/instance identity; selection, group highlights, move previews, ghosts, and camera changes are transient overlays.

Diagnostics are intentionally structural rather than timing assertions:

- `fullSceneRebuilds`: full persistent reconciliation passes caused by a project/provider/filter change;
- `blockAdds`, `blockUpdates`, `blockRemovals`: incremental voxel entry operations;
- `decorationAdds`, `decorationUpdates`, `decorationRemovals`: incremental decoration instance operations;
- `blockVisualCreations` and `decorationVisualCreations`: created persistent visual entries;
- `fallbackGeometryConstructions` and `fallbackMaterialCreations`: fallback-only resource construction;
- `modelResolutions`: calls into the configured block visual provider.
- `resolvedModelCacheHits` / `resolvedModelCacheMisses`: resolver reuse;
- `geometryCacheHits` / `geometryCacheMisses`: shared standard JSON face geometry;
- `textureCacheHits` / `textureCacheMisses`: provider texture promise reuse.

Deterministic small (256 blocks), medium (2,048 blocks), and large (8,192 blocks) fixtures live beside the benchmark specs. Normal `npm test` runs only the small structural checks. Run the explicit medium/large benchmark with:

```text
npm run benchmark:renderer
```

The explicit benchmark reports counters and elapsed time for comparison. Timing is informational; tests assert deterministic reconciliation/resource behavior rather than machine-dependent thresholds. Standard JSON geometry is provider-owned and shared by geometry signature; materials remain per visual instance so reference opacity cannot leak between blocks. Fluid and special visuals are intentionally not placed in this cache.
The benchmark also reports provider resource counts before and after disposal; disposed caches are expected to return zero retained models, geometries, textures, fluid views, and thumbnails.

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
- `fallbackMeshCreations`: actual per-voxel fallback meshes allocated; reusable-template cache hits do not increase this counter;
- `cachedTemplateInsertions`: instance members inserted directly from a retained reusable template set;
- `cameraMovementFrames`, `cameraMovementRenderCalls`, `cameraChangeEventsDuringMovement`, and `cameraRenderRequestsSuppressed`: demand-render evidence for keyboard camera movement. OrbitControls change events are suppressed while an explicit movement-frame render is in progress, so one keyboard frame produces at most one render request.

Deterministic small (256 blocks), medium (2,048 blocks), and large (8,192 blocks) fixtures live beside the benchmark specs. Normal `npm test` runs only the small structural checks. Run the explicit medium/large benchmark with:

```text
npm run benchmark:renderer
```

The explicit benchmark reports counters and elapsed time for comparison. Timing is informational; tests assert deterministic reconciliation/resource behavior rather than machine-dependent thresholds. Standard JSON geometry is provider-owned and shared by geometry signature; materials remain per visual instance so reference opacity cannot leak between blocks. Fluid and special visuals are intentionally not placed in this cache.
The benchmark also reports provider resource counts before and after disposal; disposed caches are expected to return zero retained models, geometries, textures, fluid views, and thumbnails.

## Resident Y-layer presentation boundary

The renderer now has a separate `YLayerPresentationOwner` for the narrow,
verified case where the complete project is already represented by resident
Y-partitioned static instance batches and visibility cannot change culling or
other renderer-family ownership. It owns only the current layer visibility
scope and on-demand selection/raycast entries; it owns no Three.js resources.
For eligible visibility-only transitions, `ThreeViewportEngine` updates batch
visibility/normal-reference roles and does not create a per-voxel projection
delta, materialize a visible-entry map, hydrate blocks, or write instance
matrices. Layer counts and occupied-layer indexes provide diagnostics without
scanning the canonical block array.

Eligibility is deliberately fail-closed. Exposed-face rendering, hidden groups,
isolation, selection-volume filtering, incomplete residency, placeholders,
pending render work, active interior culling, and terrain/fluid/surface or other
non-instance representations remain on the cooperative projection and
reconciliation path. Adjacency alone is not a reason to reject direct
presentation when the current presentation has no culled representations.
Switching from a whole-structure presentation that already removed fully
enclosed block representations remains a fallback until those representations
have been made resident again. Direct presentation does not run the optional
whole-voxel interior-block elimination pass; opaque resident geometry remains
present and neighboring opaque faces occlude one another. This can increase
overdraw, but does not remove visible surfaces or alter transparent content.

`yLayerPresentationTransitions`, `yLayerPresentationFallbacks`, and
`yLayerProjectionVoxelVisits` distinguish direct transitions from fallback
work. `visibleEntries` intentionally remains empty while direct presentation is
active; callers that need one selected/raycasted entry resolve it lazily against
the canonical spatial index. Canonical mutations continue through mutation
reconciliation and hydration; provider/project identity changes clear the
presentation scope. The 110,592-block Vitest fixture now completes resident
All Below/Whole/current transitions in 1.1-2.3 ms after preparation, with zero
projection voxel visits, zero matrix writes, and zero new provider creations;
its earlier 450-740 ms transitions visited 221,184 projection voxels. These are
headless timings, not browser frame or GPU readiness evidence. Real Chrome/WebGL
presentation, long tasks, input-to-stable-frame, and GPU memory remain
unverified.

Terrain chunk compilation also exposes an internal A/B terrain atlas mode. The
strict `off` path remains the baseline reference; `on` uses append-only atlas
pages with per-face strict fallback and reports atlas page/sprite/material
evidence. The atlas is renderer-owned and is reset with provider generation
changes.

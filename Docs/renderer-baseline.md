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

`YLayerPresentationOwner` owns the active Y visibility scope and resolves
selection/raycast entries lazily; it does not own Three.js resources. Once all
canonical blocks have resident, layer-partitioned representations, eligible
visibility-only transitions update batch/layer visibility and normal/reference
roles without creating a per-voxel projection delta, hydrating blocks, or
writing instance matrices. Current ownership supports static instances,
surface batches, standalone objects, placeholders, and fluid layer/group
buckets. Group visibility and isolation are presentation state. Canonical
mutations still use mutation reconciliation and invalidate affected visual
ownership.

Readiness is deliberately split. `YLayerVisualPreloadEvidence` reports reusable
template preparation; `YLayerRepresentationPrewarmEvidence` reports retained
CPU-side representation ownership; both continue to report GPU presentation as
`viewport-dependent`. The inactive viewport does not create a renderer until
it is mounted. After both modes have been visited, both mounted viewport
engines retain their own WebGL renderer and GPU resources; GPU memory is not
currently bounded or measured across the pair. CPU residency is not proof of
GPU upload or a stable presented frame. A partial prewarm report is not itself
readiness. The direct-path
decision checks live representation ownership and pending work; it falls back
whenever those live counts do not cover the canonical blocks. The
standalone-object cap can therefore leave prewarm partial until ordinary
hydration supplies the remaining representations.

Terrain chunk/exposed-face rendering and active interior-culling ownership are
not currently resident-layer presentations. They retain the correctness-first
projection/reconciliation path until their chunk boundary dependencies can be
updated without destroying unchanged geometry. Visibility transitions that
encounter these representations are not counted as direct. Adjacent opaque
geometry continues to use the established renderer/culling path; this boundary
does not alter texture, alpha/depth, or raycast semantics.

`yLayerPresentationTransitions`, `yLayerPresentationFallbacks`, and
`yLayerProjectionVoxelVisits` distinguish direct transitions from fallback
work. `visibleEntries` remains empty while direct presentation is active. The
runtime trace heartbeat reads the last committed projection count rather than
rebuilding all visible signatures; explicit ownership diagnostics may still
perform a full scan when requested. Prewarming is owned by the Y-layer engine;
the 3D engine no longer starts a redundant Y-template scan.

The 110,592-block Vitest fixture after the resident-presentation changes
measured a 12.8 ms first switch after preload, 1.8 ms All Below expansion,
1.6 ms Whole expansion, and 1.7 ms contraction. It reported 110,592 resident
representations, zero skipped representations, zero visibility-time matrix
writes, hydration jobs, and projection voxel visits, and 384 batch visibility
updates. This is CPU-side structural evidence, not a GPU/frame-time result.

### Local Chrome evidence (2026-10-10)

The browser fixture contained 110,592 blocks across 48 layers: stone, stairs,
slabs, glass, water, lanterns, and unresolved external blocks, plus one group.
It did not cover decorations or every special/mod renderer family. Saved-Y
startup reached a ready, direct-presentation state with all 110,592
representations resident at about 38 seconds after navigation. In a saved-3D
startup, the active viewport was hydration-complete and the inactive Y engine
had completed CPU residency at about 77 seconds; the first-frame timestamp was
not captured separately. Both are startup/preload costs, not warm switching
latencies.

After readiness, 12 state-changing Y visibility/layer transitions and one
3D-to-Y return produced zero additional hydration starts, projection voxel
visits, instance-matrix writes, full-reconcile fallbacks, or terrain chunk
rebuilds. The measured first rendered frame was p50 14 ms, p95 79.7 ms, max
79.7 ms. A separate consecutive-frame sample contained gaps up to 3.5 seconds
under headless Chrome SwiftShader; the profiler attributed only about 0.6 s of
JavaScript samples to a 4.3 s window, and the clean long-task observer saw
63 ms and 72 ms tasks. This gap is not attributed to voxel projection, but it
fails the no-multi-second-stall acceptance and needs hardware-browser
confirmation. The WebGL renderer was `ANGLE ... SwiftShader`; hardware GPU
behavior is not verified. The browser heap was about 0.83-0.85 GB after warm
Y residency and reached about 1.16 GB at the observed saved-3D startup point;
GPU allocation bytes were not available from this browser run.

These browser observations are not a before/after comparison on the same
Chrome fixture. No trustworthy Chrome baseline capture was available for this
worktree, so only the structural Vitest comparison and current-browser evidence
are reported. Warm batch presentation is validated; complete GPU readiness,
startup cost, full renderer-family coverage, and smooth stable-frame behavior
remain open acceptance items.

Terrain chunk compilation also exposes an internal A/B terrain atlas mode. The
strict `off` path remains the baseline reference; `on` uses append-only atlas
pages with per-face strict fallback and reports atlas page/sprite/material
evidence. The atlas is renderer-owned and is reset with provider generation
changes.

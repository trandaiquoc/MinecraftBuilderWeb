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
perform a full scan when requested. `YLayerRepresentationPrewarmOwner` owns the
all-layer representation preparation lifecycle. `ViewportPreparationScheduler`
is one root-scoped active-first queue for both retained viewport components; it
invalidates work by project, provider, and visual revision scope.

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

### Active-first viewport preparation follow-up (2026-10-10)

The viewport components now schedule inactive preparation only after content
restore is terminal and the active viewport has reached usable finalization.
The idle callback is scoped to project identity, block/decor arrays, provider
identity/generation, and catalog visual revision. Switching the inactive
viewport to active cancels pending idle work; a changed scope can schedule a
new run. Provider/resolver setters no longer launch a competing Y-layer scan.
For saved Y-layer mode, inactive preparation uses the saved visibility options
and suppresses the initial Current Only bootstrap. The Y engine owns the
all-layer resource prewarm; the 3D engine does not repeat that scan.

The reusable-template scan now checks elapsed work every 128 blocks and yields
after roughly 6 ms, publishing progress at each yield. Y-layer static/surface
batches allocate for one horizontal render region (32 x 32 entries), while
placeholder batches use their 16 x 16 chunk plane. This reduces per-part
instance-matrix allocations from 32,768 to 1,024 entries for static/surface
batches and from 4,096 to 256 for placeholders; 3D batch capacity is unchanged.
The bounded standalone residency limit is 16,384, enough for the observed
13,824 unbatchable grass fallbacks in the fixture while remaining bounded.

Vitest benchmark (`npm run benchmark:renderer`, 110,592 blocks / 48 layers,
fixture canonicalized to `minecraft:stone` for deterministic static template
coverage, without decorations/fluids/mod visuals) measured active current-layer
hydration at 103.8 ms, all-layer template and representation preparation at
1,604.1 ms, first switch before preload at 192.3 ms, first switch after preload
at 14.2 ms, repeated switching at 30.5 ms, All Below expansion at 1.8 ms, Whole
expansion at 1.1 ms, and contraction at 1.2 ms. All 110,592 CPU representations
were resident; visibility transitions performed zero provider object
creations, zero instance-matrix writes, and zero projection voxel visits (384
batch visibility updates). Process RSS was about 482 MB and JS heap about 284
MB. Vitest has no WebGL context, so these figures do not demonstrate GPU
readiness or browser responsiveness.

The same benchmark recorded at the pre-extraction HEAD measured 99.8 ms active
current-layer hydration, 1,895.4 ms all-layer preparation, 12.8 ms first switch
after preparation, 29.0 ms repeated switching, 2.6 ms All Below expansion,
1.4 ms Whole expansion, and 1.3 ms contraction. The post-extraction run reduced
all-layer preparation by about 15% and All Below expansion by about 31%; first
post-preload and repeated switches were respectively 1.4 ms and 1.5 ms slower,
while Whole expansion and contraction were effectively unchanged. RSS and heap
fell by about 143 MB and 148 MB respectively, but single Vitest process-memory
samples are noisy and do not establish peak browser/GPU memory. This is an
indicative same-fixture CPU comparison, not a multi-run Chrome/WebGL baseline.

In a previously captured Chrome 154 headless SwiftShader session on the persisted
110,592-block project, with Y-layer active, the engine reached 110,592/110,592
CPU representations and terminal hydration. Its inactive 3D engine also
reached 110,592/110,592 representations and terminal hydration without a
renderer or canvas. Thus
inactive viewport preparation is automatic and CPU-ready, but GPU presentation
remains `viewport-dependent`, not preloaded. On first 3D activation after that
CPU preparation, the first rendered frame was observed on RAF 2; the measured
interaction-to-four-following-frames interval was 976.5 ms, with 692.4 ms max
RAF gap and 116/148 ms long tasks. After both contexts had been mounted, a
separate warm toggle sample still contained 2,004 ms and 576 ms RAF gaps. This
headless session therefore does not pass smooth mode activation or no-stall
acceptance. Heap at the warm sample was about 628 MB; GPU allocation bytes were
unavailable.

No trustworthy before measurement from the same Chrome build, fixture, saved
mode, and machine state exists. The historical Chrome observations above are
not a controlled baseline/after comparison. The code-level and Vitest CPU
improvements are verified; active/inactive GPU readiness, startup p50/p95,
hardware-GPU behavior, mixed 110K renderer-family coverage, and multi-second
headless stalls remain open. Overall startup/preload acceptance is PARTIAL.

## Viewport orchestration ownership

`ThreeViewportEngine` remains the public viewport facade and composition root.
`ViewportStructureUpdatePlanner` classifies project, mutation, presentation,
and layer-transition inputs without applying renderer changes.
`ViewportStructureReconciliationOwner` owns full canonical block-to-render
reconciliation, while `ViewportLocalMutationOwner` owns bounded mutation and
metadata-delta application. `ViewportHydrationSettlementOwner` is the source of
truth for adopting and checking physical terminal block ownership across
terrain, surface, instance, fluid, object, culling, and placeholder families.

`YLayerProjectionCommitOwner` applies committed projection deltas and finalizes
their hydration/render effects. `YLayerRepresentationPrewarmOwner` owns the
prewarm generation, scoped queues, retained template work, and cancellation;
`YLayerPresentationLifecycleOwner` owns direct-presentation eligibility and
batch role/visibility updates. `ViewportHydrationLifecycleOwner` owns progress,
scheduling gates, cancellation, and terminal accounting;
`ViewportHydrationFinalizationOwner` owns watchdog ownership audits and repair
of unresolved visible representations. The provider refresh policy lives in
`ViewportProviderRefreshOwner`, layered over the existing generation pipeline.
These owners use the same representation and GPU resource owners described
above; they do not introduce parallel ledgers or disposal.

Viewport preparation is one active-first scheduled lifecycle across 3D and
Y-layer components. Attempts report `completed`, `accepted`, `in-progress`, or
`rejected`; only owner-confirmed `completed` attempts enter the scheduler's
completed state. Accepted/in-progress Y-layer prewarm waits for a scoped terminal
notification from the prewarm owner, in addition to hydration/projection
transitions; the notification carries project blocks, provider identity and
generation, phase, attempt id, and ready/partial/cancelled/failed outcome.
Stale and disposed attempts do not notify. The Y-layer component retries
ready/partial/failed terminals only; cancellation is paired with scope
replacement or task unregister, avoiding an immediate restart of invalidated
work. Rejected tasks are retried only after an explicit owner notification, a
readiness transition, or scope change, not on repeated unchanged effect updates.
Task completion means the synchronous sync or preparation request reached its
declared terminal point; it does not claim CPU representation settlement,
WebGL upload, or a stable presented frame. Empty projects and cached-template
prewarms can notify terminal without hydration or projection work. Removing or
unregistering a task removes its completion state with it.

# Renderer Baseline

The renderer currently rebuilds the visible block and decoration groups on each `ThreeViewportEngine.update()` call. The baseline counters in `core/renderer/renderer-diagnostics.ts` measure that behavior without changing it:

- `fullSceneRebuilds`: full `update()` calls;
- `blockVisualCreations`: visible voxel fallback/visual slots created during an update;
- `decorationVisualCreations`: decoration visuals created during an update;
- `geometryConstructions` and `materialCreations`: fallback voxel geometry/material construction;
- `modelResolutions`: calls into the configured block visual provider.

Deterministic small (256 blocks), medium (2,048 blocks), and large (8,192 blocks) fixtures live beside the benchmark spec. Run the baseline with:

```text
npm run benchmark:renderer
```

The benchmark reports structural counters and elapsed time for comparison. Timing is informational; tests intentionally assert rebuild/resource counts rather than machine-dependent thresholds. Incremental rendering, scene diffing, and renderer/resource caches are deliberately deferred to the next optimization phase.

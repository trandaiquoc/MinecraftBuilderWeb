import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from './three-viewport-engine';
import { RendererDiagnostics } from './renderer-diagnostics';
import { rendererBenchmarkProject } from './renderer-benchmark-fixtures';

describe('renderer baseline benchmark', () => {
  it('measures the current full-rebuild path for representative edits', () => {
    const project = rendererBenchmarkProject('medium');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const started = Date.now();

    engine.update(project, undefined);
    const initial = diagnostics.snapshot();
    expect(initial.fullSceneRebuilds).toBe(1);
    expect(initial.blockVisualCreations).toBe(project.blocks.length);
    expect(initial.decorationVisualCreations).toBe(project.decorations?.length ?? 0);

    const added = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 31, y: 15, z: 31 }, state: {} };
    const afterAdd = { ...project, blocks: [...project.blocks, added] };
    engine.update(afterAdd, undefined);
    expect(diagnostics.snapshot().blockVisualCreations).toBe(project.blocks.length + afterAdd.blocks.length);

    const afterDelete = { ...afterAdd, blocks: afterAdd.blocks.slice(0, -1) };
    engine.update(afterDelete, undefined);
    const afterStateEdit = { ...afterDelete, blocks: afterDelete.blocks.map((block, index) => index === 1 ? { ...block, state: { ...block.state, half: 'top' } } : block) };
    engine.update(afterStateEdit, undefined, { selected: afterStateEdit.blocks[1]?.position });
    const afterDecorationAdd = { ...afterStateEdit, decorations: [...(afterStateEdit.decorations ?? []), ...(project.decorations?.slice(0, 1) ?? []).map((decoration) => ({ ...decoration, instanceId: 'benchmark-added-frame', anchor: { x: 2, y: 2, z: 0 } }))] };
    engine.update(afterDecorationAdd, undefined);
    const afterDecorationUpdate = { ...afterDecorationAdd, decorations: (afterDecorationAdd.decorations ?? []).map((decoration, index) => index === 0 ? { ...decoration, anchor: { x: 3, y: 2, z: 0 } } : decoration) };
    engine.update(afterDecorationUpdate, undefined);
    const afterDecorationRemove = { ...afterDecorationUpdate, decorations: (afterDecorationUpdate.decorations ?? []).slice(0, -1) };
    engine.update(afterDecorationRemove, undefined);
    const finalCounters = diagnostics.snapshot();
    expect(finalCounters.fullSceneRebuilds).toBe(7);
    expect(finalCounters.decorationVisualCreations).toBe((project.decorations?.length ?? 0) * 7 + 2);

    const elapsedMs = Date.now() - started;
    console.info(`[renderer benchmark] medium blocks=${project.blocks.length} initialRebuild=1 blockEdits=3 selectionEdit=1 decorationEdits=3 finalRebuilds=${finalCounters.fullSceneRebuilds} blockVisuals=${finalCounters.blockVisualCreations} decorations=${finalCounters.decorationVisualCreations} elapsedMs=${elapsedMs}`);
  });

  it('provides deterministic small, medium and large fixtures', () => {
    expect(rendererBenchmarkProject('small').blocks).toHaveLength(256);
    expect(rendererBenchmarkProject('medium').blocks).toHaveLength(2048);
    expect(rendererBenchmarkProject('large').blocks).toHaveLength(8192);
  });
});

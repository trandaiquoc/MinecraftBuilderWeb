import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument, ResolvedPlacedBlock } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { YLayerProjectionCoordinator, type VisibleBlockProjectionEntry } from './y-layer-projection-coordinator';

function project(blocks: readonly ResolvedPlacedBlock[] = []): ProjectDocument {
  return {
    schemaVersion: 3,
    id: 'projection-test',
    metadata: { name: 'Projection test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
    size: { x: 8, y: 8, z: 8 },
    structureMode: 'vanilla-structure-block',
    blocks,
    groups: [],
    editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
  };
}

function block(x: number): ResolvedPlacedBlock {
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state: {} };
}

function entry(value: ResolvedPlacedBlock, signature = 'stone'): VisibleBlockProjectionEntry {
  return { block: value, role: 'normal', signature, occlusionClass: 'opaque-full-cube' };
}

function options(layerY: number, visibility: ViewportRenderOptions['visibility'] = 'current-only'): ViewportRenderOptions {
  return { layerY, visibility };
}

describe('YLayerProjectionCoordinator', () => {
  it('owns the visible-entry list, coordinate map, and index as one projection cache', () => {
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: () => undefined,
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: () => undefined,
      onWorkFailure: () => undefined,
      record: () => undefined,
      recordMax: () => undefined,
    });
    const document = project();
    const first = block(1);
    const second = block(2);
    coordinator.replaceVisible(document, options(0), [entry(first), entry(second)]);

    expect(coordinator.visibleEntries).toHaveLength(2);
    expect(coordinator.visibleEntry(coordinateKey(first.position))?.block).toBe(first);
    expect(coordinator.hasVisibleProjection(document, options(0))).toBe(true);

    coordinator.cacheVisibleEntry(coordinateKey(first.position), entry(first, 'updated'));
    coordinator.removeVisibleEntry(coordinateKey(second.position));
    expect(coordinator.visibleEntries).toEqual([entry(first, 'updated')]);
    expect(coordinator.visibleEntriesByKey.size).toBe(1);
    expect(coordinator.hasVisibleEntry(coordinateKey(second.position))).toBe(false);

    coordinator.clear();
    expect(coordinator.visibleEntries).toEqual([]);
    expect(coordinator.visibleProject).toBeUndefined();
  });

  it('coalesces frame requests and commits the latest layer projection', async () => {
    let frame: FrameRequestCallback | undefined;
    const applied: number[][] = [];
    const committed = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: (_project, _options, delta) => { applied.push([...delta.layers]); },
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: committed,
      onWorkFailure: () => undefined,
      record: () => undefined,
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = project();
    coordinator.setCommitted(document, options(0));
    coordinator.request(document, options(1));
    coordinator.request(document, options(3));

    expect(coordinator.state.activity).toBe('applying');
    expect(frame).toBeDefined();
    frame?.(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(applied).toEqual([[0, 3]]);
    expect(committed).toHaveBeenCalledWith(document, options(3));
    expect(coordinator.committedOptionsFor(document)).toEqual(options(3));
    expect(coordinator.revision).toBe(1);
  });

  it('invalidates in-flight projection work on cancel without committing stale results', async () => {
    let frame: FrameRequestCallback | undefined;
    const committed = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: () => undefined,
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: committed,
      onWorkFailure: () => undefined,
      record: () => undefined,
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = project();
    coordinator.setCommitted(document, options(0));
    coordinator.request(document, options(1));
    frame?.(0);
    coordinator.cancel();
    await Promise.resolve();

    expect(committed).not.toHaveBeenCalled();
    expect(coordinator.state.activity).toBe('idle');
  });

  it('owns cooperative layer slicing, yields, and terminal hydration handoff', async () => {
    let frame: FrameRequestCallback | undefined;
    const blocks = Array.from({ length: 600 }, (_, index) => ({ ...block(index), position: { x: index, y: 9, z: 0 } }));
    const layers = new Map([[9, blocks]]);
    const indexed = { blocksAtY: (y: number) => layers.get(y) ?? [], occupiedLayers: () => Array.from({ length: 10 }, (_, y) => y), allBlocks: () => blocks };
    const applied: number[] = [];
    const metrics: string[] = [];
    const finish = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: (_document, _options, delta) => { applied.push(delta.blockOverrides?.get(9)?.length ?? 0); },
      finishCooperativeWork: finish,
      keySettled: () => true,
      onCommit: () => undefined,
      onWorkFailure: () => undefined,
      record: (metric) => metrics.push(metric),
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = { ...project(blocks), size: { x: 600, y: 12, z: 1 } };
    coordinator.setCommitted(document, { layerY: 0, visibility: 'all-below', layerIndex: indexed });
    coordinator.request(document, { layerY: 9, visibility: 'all-below', layerIndex: indexed }, indexed);
    frame?.(0);
    for (let count = 0; count < 100 && coordinator.committedOptionsFor(document)?.layerY !== 9; count += 1) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applied).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 384, 216]);
    expect(metrics.filter((metric) => metric === 'yLayerProjectionSlices')).toHaveLength(11);
    expect(metrics.filter((metric) => metric === 'yLayerProjectionYields')).toHaveLength(10);
    expect(finish).toHaveBeenCalledOnce();
    expect(coordinator.committedOptionsFor(document)?.layerY).toBe(9);
    coordinator.dispose();
  });

  it('cooperatively slices a dense single-layer visibility change outside all-below mode', async () => {
    let frame: FrameRequestCallback | undefined;
    const blocks = Array.from({ length: 600 }, (_, index) => ({ ...block(index), position: { x: index, y: 9, z: 0 } }));
    const index = { blocksAtY: (y: number) => y === 9 ? blocks : [], occupiedLayers: () => [9], allBlocks: () => blocks };
    const applied: number[] = [];
    const metrics: string[] = [];
    const committed = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: (_document, _options, delta) => { applied.push(delta.blockOverrides?.get(9)?.length ?? 0); },
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: committed,
      onWorkFailure: () => undefined,
      record: (metric) => metrics.push(metric),
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = { ...project(blocks), size: { x: 600, y: 12, z: 1 } };
    coordinator.setCommitted(document, { layerY: 9, visibility: 'current-only', layerIndex: index });
    coordinator.request(document, { layerY: 9, visibility: 'whole-structure', layerIndex: index }, index);
    frame?.(0);
    for (let count = 0; count < 100 && coordinator.committedOptionsFor(document)?.visibility !== 'whole-structure'; count += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(applied).toEqual([384, 216]);
    expect(metrics.filter((metric) => metric === 'yLayerProjectionSlices')).toHaveLength(2);
    expect(metrics.filter((metric) => metric === 'yLayerProjectionYields')).toHaveLength(1);
    expect(committed).toHaveBeenCalledOnce();
    expect(coordinator.committedOptionsFor(document)?.visibility).toBe('whole-structure');
    coordinator.dispose();
  });

  it('stops a cancelled cooperative projection between slices without committing stale work', async () => {
    let frame: FrameRequestCallback | undefined;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => { started = resolve; });
    const blocksByLayer = new Map<number, ResolvedPlacedBlock[]>([[9, Array.from({ length: 600 }, (_, i) => ({ ...block(i), position: { x: i, y: 9, z: 0 } }))]]);
    const index = { blocksAtY: (y: number) => blocksByLayer.get(y) ?? [], occupiedLayers: () => Array.from({ length: 10 }, (_, y) => y), allBlocks: () => [] };
    const applied: number[][] = [];
    const document = { ...project([...blocksByLayer.values()][0]), size: { x: 600, y: 12, z: 1 } };
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: (_doc, _opts, delta) => { applied.push([...delta.layers]); if (applied.length === 1) started(); },
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: () => undefined,
      onWorkFailure: () => undefined,
      record: () => undefined,
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    coordinator.setCommitted(document, { layerY: 0, visibility: 'all-below', layerIndex: index });
    coordinator.request(document, { layerY: 9, visibility: 'all-below', layerIndex: index }, index);
    frame?.(0);
    await firstStarted;
    coordinator.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied).toHaveLength(1);
    expect(coordinator.state.activity).toBe('idle');
    coordinator.dispose();
  });

  it('settles projection activity after a synchronous viewport-delta failure', async () => {
    let frame: FrameRequestCallback | undefined;
    const onWorkFailure = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyDelta: () => { throw new Error('delta failed'); },
      finishCooperativeWork: () => undefined,
      keySettled: () => true,
      onCommit: () => undefined,
      onWorkFailure,
      record: () => undefined,
      recordMax: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = project();
    coordinator.setCommitted(document, options(0));
    coordinator.request(document, options(1));
    frame?.(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(coordinator.state.activity).toBe('idle');
    expect(coordinator.committedOptionsFor(document)).toEqual(options(0));
    expect(onWorkFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'delta failed' }));
    coordinator.dispose();
  });
});

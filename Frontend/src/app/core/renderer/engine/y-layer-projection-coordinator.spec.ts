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
      applyLayers: async () => true,
      keySettled: () => true,
      onCommit: () => undefined,
      record: () => undefined,
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
      applyLayers: async (_project, _options, layers) => { applied.push([...layers]); return true; },
      keySettled: () => true,
      onCommit: committed,
      record: () => undefined,
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
    let resolveWork!: (completed: boolean) => void;
    const committed = vi.fn();
    const coordinator = new YLayerProjectionCoordinator({
      isDisposed: () => false,
      isSuspended: () => false,
      applyLayers: () => new Promise((resolve) => { resolveWork = resolve; }),
      keySettled: () => true,
      onCommit: committed,
      record: () => undefined,
    }, (callback) => { frame = callback; return 1; }, () => undefined);
    const document = project();
    coordinator.setCommitted(document, options(0));
    coordinator.request(document, options(1));
    frame?.(0);
    coordinator.cancel();
    resolveWork(true);
    await Promise.resolve();

    expect(committed).not.toHaveBeenCalled();
    expect(coordinator.state.activity).toBe('idle');
  });
});

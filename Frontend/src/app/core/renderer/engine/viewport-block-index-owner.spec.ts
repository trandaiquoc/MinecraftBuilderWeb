import { describe, expect, it, vi } from 'vitest';
import { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type { ProjectDocument } from '../../domain/project.types';
import { ProjectBlockRuntimeIndex } from '../../editor/runtime/project-block-runtime-index';
import { blockMutationHint } from '../../editor/mutations/project-mutation-hint';

describe('viewport block index owner', () => {
  it('keeps index identity for incremental project transitions', () => {
    const record = vi.fn();
    const owner = new ViewportBlockIndexOwner(record);
    const first = project('first');
    const next = { ...first, metadata: { ...first.metadata, updatedAt: 'next' } };

    owner.ensure(first);
    const lookup = owner;
    owner.ensure(next, false, true);

    expect(owner).toBe(lookup);
    expect(owner.currentProject).toBe(next);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('owns replacement and special-id tracking without rebuilding the index', () => {
    const owner = new ViewportBlockIndexOwner(() => undefined);
    const first = project('first');
    owner.ensure(first);
    const lookup = owner;
    owner.replace(first.blocks[0].position, { ...first.blocks[0], id: 'minecraft:dirt' });

    expect(owner).toBe(lookup);
    expect(owner.get({ x: 0, y: 0, z: 0 })?.id).toBe('minecraft:dirt');
    expect(owner.has({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(owner.specialVisualIdsFor(undefined, [])).toContain('minecraft:dirt');
  });

  it('records only new lookup work and clears terminal state', () => {
    const metrics = new Map<string, number>();
    const owner = new ViewportBlockIndexOwner((name, delta = 1) =>
      metrics.set(name, (metrics.get(name) ?? 0) + delta),
    );
    owner.ensure(project('first'));
    owner.get({ x: 0, y: 0, z: 0 });
    owner.recordLookupDelta();
    owner.recordLookupDelta();
    expect(metrics.get('spatialIndexLookups')).toBe(1);
    owner.clear();
    expect(owner.hasIndex).toBe(false);
    expect(owner.currentProject).toBeUndefined();
  });

  it('shares the canonical runtime lookup across viewport owners and mutations', () => {
    const metrics = vi.fn();
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    const firstViewport = new ViewportBlockIndexOwner(metrics, runtimeIndex);
    const secondViewport = new ViewportBlockIndexOwner(metrics, runtimeIndex);
    const first = project('shared');
    firstViewport.ensure(first);
    secondViewport.ensure(first);

    const before = first.blocks[0];
    const after = { ...before, id: 'minecraft:dirt' };
    const next = { ...first, blocks: [after] };
    expect(
      runtimeIndex.adoptTransition(
        first,
        next,
        blockMutationHint([{ position: before.position, before, after }]),
      ),
    ).toBe(true);
    firstViewport.ensure(next, false, true);
    firstViewport.replace(before.position, after);
    secondViewport.ensure(next, false, true);

    expect(firstViewport.get(after.position)).toBe(after);
    expect(secondViewport.get(after.position)).toBe(after);
    expect(firstViewport.specialVisualIdsFor(undefined, [])).toContain('minecraft:dirt');
    expect(metrics).toHaveBeenCalledTimes(1);
  });

  it('refreshes an in-place mutation once for multiple viewport owners', () => {
    const metrics = vi.fn();
    const runtimeIndex = new ProjectBlockRuntimeIndex();
    const firstViewport = new ViewportBlockIndexOwner(metrics, runtimeIndex);
    const secondViewport = new ViewportBlockIndexOwner(metrics, runtimeIndex);
    const current = project('in-place');
    firstViewport.ensure(current);
    secondViewport.ensure(current);

    const replacement = { ...current.blocks[0], id: 'minecraft:dirt' };
    (current.blocks as (typeof current.blocks)[number][])[0] = replacement;
    firstViewport.ensure(current, true);
    secondViewport.ensure(current, true);

    expect(firstViewport.get(replacement.position)).toBe(replacement);
    expect(secondViewport.get(replacement.position)).toBe(replacement);
    expect(runtimeIndex.rebuildCountFor('forced-refresh')).toBe(1);
    expect(metrics).toHaveBeenCalledTimes(2);
  });
});

function project(id: string): ProjectDocument {
  return {
    schemaVersion: 3,
    id,
    metadata: { name: id, minecraftVersion: '1.21.1', createdAt: 'initial', updatedAt: 'initial' },
    size: { x: 2, y: 2, z: 2 },
    structureMode: 'vanilla-structure-block',
    blocks: [
      {
        kind: 'resolved',
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      },
    ],
    groups: [],
    editorSettings: {
      currentY: 0,
      layerVisibility: 'whole-structure',
      referenceLayerOpacity: 0.28,
    },
    decorations: [],
  };
}

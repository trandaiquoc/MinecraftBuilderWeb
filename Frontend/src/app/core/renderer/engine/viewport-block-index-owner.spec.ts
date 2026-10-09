import { describe, expect, it, vi } from 'vitest';
import { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type { ProjectDocument } from '../../domain/project.types';

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
    const owner = new ViewportBlockIndexOwner((name, delta = 1) => metrics.set(name, (metrics.get(name) ?? 0) + delta));
    owner.ensure(project('first'));
    owner.get({ x: 0, y: 0, z: 0 });
    owner.recordLookupDelta();
    owner.recordLookupDelta();
    expect(metrics.get('spatialIndexLookups')).toBe(1);
    owner.clear();
    expect(owner.hasIndex).toBe(false);
    expect(owner.currentProject).toBeUndefined();
  });
});

function project(id: string): ProjectDocument {
  return {
    schemaVersion: 3,
    id,
    metadata: { name: id, minecraftVersion: '1.21.1', createdAt: 'initial', updatedAt: 'initial' },
    size: { x: 2, y: 2, z: 2 },
    structureMode: 'vanilla-structure-block',
    blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} }],
    groups: [],
    editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
    decorations: [],
  };
}

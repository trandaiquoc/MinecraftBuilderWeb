import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationRenderLifecycle } from './decoration-render-lifecycle';

const decoration: PlacedDecoration = {
  instanceId: 'frame-1',
  kind: 'item-frame',
  entityTypeId: 'minecraft:item_frame',
  anchor: { x: 1, y: 3, z: 1 },
  facing: 'north',
  rotation: 0,
  invisible: false,
  fixed: false,
  itemDropChance: 1,
};
const itemFrame: PlacedDecoration = { ...decoration, item: { id: 'minecraft:diamond', count: 1 } };

function project(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    schemaVersion: 3,
    id: 'project-1',
    metadata: { name: 'Project', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
    size: { x: 8, y: 8, z: 8 },
    structureMode: 'vanilla-structure-block',
    blocks: [],
    groups: [],
    editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
    ...overrides,
  };
}

describe('decoration render lifecycle', () => {
  it('owns visible decoration queue and commits visuals through its group', () => {
    const group = new THREE.Group();
    const scheduleHydration = vi.fn();
    const scheduleRender = vi.fn();
    const complete = vi.fn();
    const record = vi.fn();
    const lifecycle = new DecorationRenderLifecycle({
      group,
      textureUrl: () => undefined,
      textureCache: () => undefined,
      paintingResource: () => undefined,
      itemResources: () => undefined,
      itemVisual: () => undefined,
      itemPreview: () => undefined,
      isSelected: () => false,
      providerGeneration: () => 0,
      scheduleRender,
      scheduleHydration,
      complete,
      record,
    });

    expect(lifecycle.reconcile(project({ decorations: [decoration] }), { layerY: 3 }, 4)).toEqual([
      decoration,
    ]);
    expect(lifecycle.queuedCount).toBe(1);
    expect(lifecycle.pendingCount).toBe(1);
    expect(scheduleHydration).toHaveBeenCalledOnce();

    expect(lifecycle.processBatch(4, Number.POSITIVE_INFINITY, 1)).toBe(1);
    expect(lifecycle.get(decoration.instanceId)?.decoration).toEqual(decoration);
    expect(group.children).toHaveLength(1);
    expect(lifecycle.pendingCount).toBe(0);
    expect(complete).toHaveBeenCalledWith(4, decoration.instanceId);
    expect(scheduleRender).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith('decorationVisualCreations');
  });

  it('removes entries that become hidden or leave the active layer', () => {
    const group = new THREE.Group();
    const record = vi.fn();
    const lifecycle = new DecorationRenderLifecycle({
      group,
      textureUrl: () => undefined,
      textureCache: () => undefined,
      paintingResource: () => undefined,
      itemResources: () => undefined,
      itemVisual: () => undefined,
      itemPreview: () => undefined,
      isSelected: () => false,
      providerGeneration: () => 0,
      scheduleRender: () => undefined,
      scheduleHydration: () => undefined,
      complete: () => undefined,
      record,
    });
    lifecycle.reconcile(project({ decorations: [decoration] }), { layerY: 3 }, 2);
    lifecycle.processBatch(2, Number.POSITIVE_INFINITY, 1);

    expect(lifecycle.reconcile(project({ decorations: [decoration] }), { layerY: 4 }, 2)).toEqual(
      [],
    );
    expect(group.children).toHaveLength(0);
    expect(lifecycle.size).toBe(0);

    lifecycle.reconcile(
      project({
        groups: [{ id: 'hidden', name: 'Hidden', visible: false, locked: false }],
        decorations: [{ ...decoration, groupIds: ['hidden'] }],
      }),
      { visibility: 'whole-structure' },
      2,
    );
    expect(lifecycle.queuedCount).toBe(0);
    expect(lifecycle.size).toBe(0);
    expect(record).toHaveBeenCalledWith('decorationRemovals');
  });

  it('applies group visibility metadata atomically to current presentation ownership', () => {
    const group = new THREE.Group();
    const lifecycle = new DecorationRenderLifecycle({
      group,
      textureUrl: () => undefined,
      textureCache: () => undefined,
      paintingResource: () => undefined,
      itemResources: () => undefined,
      itemVisual: () => undefined,
      itemPreview: () => undefined,
      isSelected: () => false,
      providerGeneration: () => 0,
      scheduleRender: () => undefined,
      scheduleHydration: () => undefined,
      complete: () => undefined,
      record: () => undefined,
    });
    const before = project({
      decorations: [{ ...decoration, groupIds: ['group-1'] }],
      groups: [{ id: 'group-1', name: 'Group', visible: true, locked: false }],
    });
    const after = {
      ...before,
      groups: [{ id: 'group-1', name: 'Group', visible: false, locked: false }],
    };
    lifecycle.reconcile(before, { visibility: 'whole-structure' }, 1);
    lifecycle.processBatch(1, Number.POSITIVE_INFINITY, 1);

    lifecycle.applyMetadataChanges(
      [{ id: decoration.instanceId, before: before.decorations![0], after: after.decorations![0] }],
      before,
      { visibility: 'whole-structure' },
      after,
      { visibility: 'whole-structure' },
      1,
    );
    expect(lifecycle.get(decoration.instanceId)).toBeUndefined();
    expect(group.children).toHaveLength(0);
    expect(lifecycle.pendingCount).toBe(0);
  });

  it('hydrates normalized item previews only for the selected decoration', () => {
    const group = new THREE.Group();
    const itemPreview = vi.fn(async () => undefined);
    let selectedId: string | undefined;
    const lifecycle = new DecorationRenderLifecycle({
      group,
      textureUrl: () => undefined,
      textureCache: () => undefined,
      paintingResource: () => undefined,
      itemResources: () => undefined,
      itemVisual: () => undefined,
      itemPreview: () => itemPreview,
      isSelected: (id) => selectedId === id,
      providerGeneration: () => 0,
      scheduleRender: () => undefined,
      scheduleHydration: () => undefined,
      complete: () => undefined,
      record: () => undefined,
    });
    lifecycle.reconcile(project({ decorations: [itemFrame] }), {}, 1);
    lifecycle.processBatch(1, Number.POSITIVE_INFINITY, 1);
    expect(itemPreview).not.toHaveBeenCalled();

    selectedId = itemFrame.instanceId;
    lifecycle.hydrateSelectedItemPreview(itemFrame.instanceId);
    expect(itemPreview).toHaveBeenCalledWith(itemFrame.item);
  });
});

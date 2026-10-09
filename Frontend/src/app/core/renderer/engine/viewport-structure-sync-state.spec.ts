import { describe, expect, it } from 'vitest';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { ViewportStructureSyncState } from './viewport-structure-sync-state';

const project = (): ProjectDocument => ({
  schemaVersion: 3,
  id: 'project-a',
  metadata: { name: 'Project A', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  structureMode: 'vanilla-structure-block',
  size: { x: 8, y: 4, z: 8 },
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 },
});

describe('ViewportStructureSyncState', () => {
  it('owns project identity, block reference/count, and render-filter sync key', () => {
    const state = new ViewportStructureSyncState();
    const current = project();
    state.commit(current, state.keyFor(current, 'normal'));
    expect(state.snapshot()).toMatchObject({ syncKey: 'project-a|8,4,8|normal', project: current, blockCount: 0, blocksReference: current.blocks });
    expect(state.hasInPlaceBlockMutation(current)).toBe(false);
    expect(state.keyFor(undefined, 'normal')).toBe('empty');
  });

  it('detects in-place block collection replacement or length mutation only for the committed project', () => {
    const state = new ViewportStructureSyncState();
    const current = project();
    state.commit(current, 'key');
    const mutable = current as unknown as { blocks: ProjectDocument['blocks'] };
    mutable.blocks = [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {}, groupIds: [] }];
    expect(state.hasInPlaceBlockMutation(current)).toBe(true);
    state.commit(current, 'key');
    (current.blocks as unknown as ProjectDocument['blocks'][number][]).push({ kind: 'resolved', id: 'minecraft:dirt', namespace: 'minecraft', position: { x: 1, y: 0, z: 0 }, state: {}, groupIds: [] });
    expect(state.hasInPlaceBlockMutation(current)).toBe(true);
    expect(state.hasInPlaceBlockMutation(project())).toBe(false);
  });

  it('invalidates the sync key without dropping the committed project snapshot', () => {
    const state = new ViewportStructureSyncState();
    const current = project();
    state.commit(current, 'key');
    state.invalidateKey();
    expect(state.snapshot()).toMatchObject({ syncKey: '', project: current, blockCount: 0, blocksReference: current.blocks });
    state.clear();
    expect(state.snapshot()).toEqual({ syncKey: '' });
  });

  it('reports suspended refresh needs for structure, filter, or decoration changes', () => {
    const state = new ViewportStructureSyncState();
    const current = project();
    state.commit(current, 'key');
    expect(state.requiresSuspendedRefresh(current, false, false)).toBe(false);
    expect(state.requiresSuspendedRefresh(current, true, false)).toBe(true);
    expect(state.requiresSuspendedRefresh(current, false, true)).toBe(true);
    expect(state.requiresSuspendedRefresh(project(), false, false)).toBe(true);
  });

  it('owns the previous visible projection positions without cloning the map for culling consumers', () => {
    const state = new ViewportStructureSyncState();
    state.rememberVisiblePosition({ x: 2, y: 3, z: 4 });
    const positions = state.previousVisiblePositionsSnapshot();

    expect(positions.get('2,3,4')).toEqual({ x: 2, y: 3, z: 4 });
    expect(state.previousVisiblePosition('2,3,4')).toBe(positions.get('2,3,4'));

    state.forgetVisiblePosition('2,3,4');
    expect(positions.has('2,3,4')).toBe(false);
    state.replaceVisiblePositions([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    expect([...positions.keys()]).toEqual(['0,0,0', '1,0,0']);
    state.clear();
    expect(positions.size).toBe(0);
  });

  it('accepts a visible projection iterable directly', () => {
    const state = new ViewportStructureSyncState();
    function* entries(): Iterable<{ readonly block: { readonly position: VoxelCoordinate } }> {
      yield { block: { position: { x: 4, y: 1, z: 2 } } };
      yield { block: { position: { x: 5, y: 1, z: 2 } } };
    }

    state.replaceVisibleProjection(entries());

    expect([...state.previousVisiblePositionsSnapshot().keys()]).toEqual(['4,1,2', '5,1,2']);
  });
});

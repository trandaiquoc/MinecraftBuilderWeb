import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';
import { viewportThemePalette } from '../engine/viewport-theme';
import { BlockGhostPresenter } from './block-ghost-presenter';
import { DecorationGhostPresenter } from './decoration-ghost-presenter';
import { EditingPlanePresenter } from './editing-plane-presenter';
import { GroupHighlightPresenter } from './group-highlight-presenter';
import { MovePreviewPresenter } from './move-preview-presenter';
import { SelectionOverlayPresenter } from './selection-overlay-presenter';

describe('viewport presentation presenters', () => {
  it('keeps selection and editing-plane visuals separate from the scene owner', () => {
    const scene = new THREE.Scene();
    const palette = viewportThemePalette('dark');
    const selection = new SelectionOverlayPresenter(scene, palette, 256);
    selection.mount();
    selection.update({ selected: { x: 2, y: 3, z: 4 }, selectedPositions: [{ x: 2, y: 3, z: 4 }] });
    expect(selection.logicalSelectionGroup.children).toHaveLength(1);
    const plane = new EditingPlanePresenter(scene, palette);
    const project = { id: 'p', size: { x: 8, y: 4, z: 8 }, blocks: [], groups: [] } as never;
    plane.set(2, project);
    expect(plane.plane?.position.y).toBeCloseTo(2.002);
    expect(plane.grid?.position.y).toBeCloseTo(2.004);
    plane.setPreviewY(3);
    expect(plane.plane?.position.y).toBeCloseTo(3.002);
    selection.dispose();
    plane.dispose();
  });

  it('filters group and usage highlights through the shared visibility callbacks', () => {
    const scene = new THREE.Scene();
    const project = rendererBenchmarkProject('small');
    const block = project.blocks[0];
    const presenter = new GroupHighlightPresenter(scene, viewportThemePalette('dark'), {
      visibleBlock: (key) => key === `${block.position.x},${block.position.y},${block.position.z}` ? { block } : undefined,
      blockAt: (position) => position.x === block.position.x && position.y === block.position.y && position.z === block.position.z ? block : undefined,
      isolated: () => true,
      isolationActive: () => false,
      decorationIsolated: () => true,
    });
    presenter.mount();
    presenter.createUsageOverlay();
    presenter.updateActiveGroup({ ...project, groups: [{ id: 'g', name: 'G', locked: false, visible: true } as never], blocks: [{ ...block, groupIds: ['g'] }] }, 'g', [block.position]);
    expect(presenter.group.children).toHaveLength(1);
    presenter.updateUsage(block.id, [block.position]);
    expect(presenter.usageOverlay?.count).toBe(1);
    presenter.dispose();
  });

  it('clears move previews and block ghosts without mutating project state', () => {
    const palette = viewportThemePalette('dark');
    const move = new MovePreviewPresenter(palette, { getBlock: () => undefined, textureCache: () => undefined });
    const project = rendererBenchmarkProject('small');
    move.update(project, { offset: { x: 1, y: 0, z: 0 }, valid: true, positions: [], decorationIds: [] } as never);
    expect(move.group.children).toHaveLength(0);
    move.dispose();
    const scene = new THREE.Scene();
    const ghost = new BlockGhostPresenter(scene, palette, { provider: () => undefined, providerGeneration: () => 0, blockLookup: () => undefined, record: vi.fn(), scheduleRender: vi.fn() });
    ghost.update({ x: 1, y: 2, z: 3 }, project, { id: 'minecraft:stone', state: {} } as never, 'valid');
    expect(ghost.ghost.visible).toBe(true);
    ghost.clear();
    expect(ghost.ghost.visible).toBe(false);
    ghost.dispose();
  });

  it('resets decoration ghost identity even when the visual is already empty', () => {
    const presenter = new DecorationGhostPresenter(viewportThemePalette('dark'), { textureCache: () => undefined, scheduleRender: vi.fn() });
    presenter.currentKey = 'stale';
    presenter.clear();
    expect(presenter.currentKey).toBe('');
  });
});

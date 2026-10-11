import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { viewportThemePalette } from '../engine/viewport-theme';
import { SelectionOverlayPresenter } from './selection-overlay-presenter';

describe('SelectionOverlayPresenter', () => {
  it("keeps box geometry equal to the user's dragged region instead of aggregate block bounds", () => {
    const presenter = new SelectionOverlayPresenter(
      new THREE.Scene(),
      viewportThemePalette('dark'),
      256,
    );
    presenter.mount();

    presenter.update({
      kind: 'box',
      count: 1,
      selectedPositions: [{ x: 5, y: 6, z: 7 }],
      aggregateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 99, y: 40, z: 99 } },
      box: { min: { x: 2, y: 3, z: 4 }, max: { x: 8, y: 9, z: 10 } },
    });

    expect(presenter.selectionBox.visible).toBe(true);
    expect(presenter.selectionBox.box.min.toArray()).toEqual([2, 3, 4]);
    expect(presenter.selectionBox.box.max.toArray()).toEqual([9, 10, 11]);
    expect(presenter.logicalSelectionGroup.children).toHaveLength(1);
    presenter.dispose();
  });

  it('keeps the drag box for large selections and avoids per-block outlines', () => {
    const presenter = new SelectionOverlayPresenter(
      new THREE.Scene(),
      viewportThemePalette('dark'),
      4,
    );
    presenter.mount();
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 10, z: 30 } };
    const selectedPositions = Array.from({ length: 300 }, (_, index) => ({
      x: index,
      y: 0,
      z: 0,
    }));

    presenter.update({
      kind: 'box',
      count: 300,
      selectedPositions,
      aggregateBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 299, y: 0, z: 0 } },
      box,
    });

    expect(presenter.selectionBox.box.min.toArray()).toEqual([0, 0, 0]);
    expect(presenter.selectionBox.box.max.toArray()).toEqual([31, 11, 31]);
    expect(presenter.logicalSelectionGroup.children).toHaveLength(0);
    presenter.dispose();
  });

  it('keeps the selected empty box visible without interpreting it as selected blocks', () => {
    const presenter = new SelectionOverlayPresenter(
      new THREE.Scene(),
      viewportThemePalette('light'),
      256,
    );
    presenter.mount();

    presenter.update({
      kind: 'box',
      count: 0,
      selectedPositions: [],
      box: { min: { x: 4, y: 2, z: 1 }, max: { x: 4, y: 2, z: 1 } },
    });

    expect(presenter.selectionBox.visible).toBe(true);
    expect(presenter.selectionBox.box.min.toArray()).toEqual([4, 2, 1]);
    expect(presenter.selectionBox.box.max.toArray()).toEqual([5, 3, 2]);
    expect(presenter.logicalSelectionGroup.children).toHaveLength(0);
    presenter.dispose();
  });

  it('uses aggregate bounds for large non-box selections', () => {
    const presenter = new SelectionOverlayPresenter(
      new THREE.Scene(),
      viewportThemePalette('dark'),
      4,
    );
    presenter.mount();

    presenter.update({
      kind: 'all',
      count: 100,
      aggregateBounds: { min: { x: 1, y: 2, z: 3 }, max: { x: 7, y: 8, z: 9 } },
    });

    expect(presenter.selectionBox.visible).toBe(true);
    expect(presenter.selectionBox.box.min.toArray()).toEqual([1, 2, 3]);
    expect(presenter.selectionBox.box.max.toArray()).toEqual([8, 9, 10]);
    presenter.dispose();
  });
});

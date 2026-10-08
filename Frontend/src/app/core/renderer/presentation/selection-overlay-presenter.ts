import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { ViewportThemePalette } from '../engine/viewport-theme';

export const DETAILED_SELECTION_OUTLINE_LIMIT = 256;

export interface SelectionOverlayInput {
  readonly selected?: VoxelCoordinate;
  readonly selectedPositions?: readonly VoxelCoordinate[];
  readonly kind?: string;
  readonly count?: number;
  readonly aggregateBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  readonly box?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
}

/** Owns selection-only geometry and keeps aggregate selection rendering bounded. */
export class SelectionOverlayPresenter {
  readonly selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false }));
  readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  readonly logicalSelectionGroup = new THREE.Group();
  readonly logicalSelectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
  readonly logicalSelectionMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false });
  private lastPositions?: readonly VoxelCoordinate[];
  private lastBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  private lastKind?: string;
  private lastCount = -1;
  private lastSelected?: VoxelCoordinate;
  private lastBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };

  constructor(private readonly scene: THREE.Scene, private palette: ViewportThemePalette, private readonly detailedLimit: number) {
    (this.selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    (this.selectionBox.material as THREE.LineBasicMaterial).depthWrite = false;
    this.selectionOutline.renderOrder = 2000;
    this.selectionBox.renderOrder = 2000;
    this.logicalSelectionGroup.renderOrder = 2000;
    this.selectionBox.visible = false;
    this.selectionOutline.visible = false;
  }

  mount(): void {
    this.scene.add(this.selectionOutline, this.selectionBox, this.logicalSelectionGroup);
    this.selectionOutline.renderOrder = 1001;
    this.selectionBox.renderOrder = 1001;
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    this.logicalSelectionMaterial.color.setHex(palette.selection);
  }

  update(input: SelectionOverlayInput): void {
    const positions = input.selectedPositions ?? [];
    const selectedCount = input.count ?? positions.length;
    const aggregate = input.kind === 'all' || selectedCount > this.detailedLimit ? input.aggregateBounds : undefined;
    this.applyTheme(this.palette);
    const unchanged = this.lastPositions === input.selectedPositions && this.lastBounds === aggregate && this.lastKind === input.kind && this.lastCount === selectedCount && sameVoxel(this.lastSelected, input.selected) && this.lastBox === input.box;
    if (unchanged) return;
    this.lastPositions = input.selectedPositions;
    this.lastBounds = aggregate;
    this.lastKind = input.kind;
    this.lastCount = selectedCount;
    this.lastSelected = input.selected;
    this.lastBox = input.box;
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
    this.selectionOutline.visible = !!input.selected && !positions.length && !aggregate;
    if (input.selected) this.selectionOutline.position.set(input.selected.x + .5, input.selected.y + .5, input.selected.z + .5);
    const visualBox = aggregate ?? input.box;
    this.selectionBox.visible = !!visualBox;
    if (visualBox) this.selectionBox.box.set(new THREE.Vector3(visualBox.min.x, visualBox.min.y, visualBox.min.z), new THREE.Vector3(visualBox.max.x + 1, visualBox.max.y + 1, visualBox.max.z + 1));
    if (aggregate) return;
    for (const position of positions) {
      const outline = new THREE.LineSegments(this.logicalSelectionGeometry, this.logicalSelectionMaterial);
      outline.position.set(position.x + .5, position.y + .5, position.z + .5);
      outline.renderOrder = 2001;
      this.logicalSelectionGroup.add(outline);
    }
  }

  dispose(): void {
    this.scene.remove(this.selectionOutline, this.selectionBox, this.logicalSelectionGroup);
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
    this.selectionOutline.geometry.dispose();
    (this.selectionOutline.material as THREE.Material).dispose();
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    this.logicalSelectionGeometry.dispose();
    this.logicalSelectionMaterial.dispose();
  }
}

function sameVoxel(a: VoxelCoordinate | undefined, b: VoxelCoordinate | undefined): boolean { return a?.x === b?.x && a?.y === b?.y && a?.z === b?.z; }

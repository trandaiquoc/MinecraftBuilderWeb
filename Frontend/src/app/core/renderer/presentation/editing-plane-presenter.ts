import * as THREE from 'three';
import type { ProjectDocument } from '../../domain/project.types';
import type { ViewportThemePalette } from '../engine/viewport-theme';

export type EditingGridFactory = (sizeX: number, sizeZ: number, color: number) => THREE.LineSegments;

/** Owns only the transient Y-layer plane and grid visuals. */
export class EditingPlanePresenter {
  private editingPlane?: THREE.Mesh;
  private editingGrid?: THREE.LineSegments;

  constructor(private readonly scene: THREE.Scene, private readonly createGrid: EditingGridFactory, private palette: ViewportThemePalette) {}

  get plane(): THREE.Mesh | undefined { return this.editingPlane; }
  get grid(): THREE.LineSegments | undefined { return this.editingGrid; }

  set(y: number | undefined, project: ProjectDocument | undefined): void {
    if (!project || y === undefined) {
      if (this.editingPlane) this.editingPlane.visible = false;
      if (this.editingGrid) this.editingGrid.visible = false;
      return;
    }
    if (!this.editingPlane) {
      this.editingPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.editingPlane.rotation.x = -Math.PI / 2;
      this.scene.add(this.editingPlane);
    }
    this.editingGrid?.geometry.dispose();
    (this.editingGrid?.material as THREE.Material | undefined)?.dispose();
    if (this.editingGrid) this.scene.remove(this.editingGrid);
    this.editingGrid = this.createGrid(project.size.x, project.size.z, this.palette.editingGrid);
    this.scene.add(this.editingGrid);
    this.editingPlane.geometry.dispose();
    this.editingPlane.geometry = new THREE.PlaneGeometry(project.size.x, project.size.z);
    this.editingPlane.position.set(project.size.x / 2, y + 0.002, project.size.z / 2);
    this.editingPlane.visible = true;
    this.editingGrid.position.y = y + 0.004;
    this.editingGrid.visible = true;
  }

  setPreviewY(y: number): void {
    if (!this.editingPlane || !this.editingGrid) return;
    this.editingPlane.position.y = y + 0.002;
    this.editingGrid.position.y = y + 0.004;
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    (this.editingGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.editingGrid);
  }

  dispose(): void {
    if (this.editingPlane) { this.scene.remove(this.editingPlane); this.editingPlane.geometry.dispose(); (this.editingPlane.material as THREE.Material).dispose(); }
    if (this.editingGrid) { this.scene.remove(this.editingGrid); this.editingGrid.geometry.dispose(); (this.editingGrid.material as THREE.Material).dispose(); }
    this.editingPlane = undefined;
    this.editingGrid = undefined;
  }
}

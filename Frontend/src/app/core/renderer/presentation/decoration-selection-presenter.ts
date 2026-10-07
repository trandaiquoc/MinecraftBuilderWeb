import * as THREE from 'three';
import type { ViewportThemePalette } from '../engine/viewport-theme';
import { disposeObject } from './renderer-resource-disposal';

export interface DecorationSelectionPresenterCallbacks {
  readonly selected: (id: string) => { readonly object: THREE.Object3D } | undefined;
}

/** Owns the selection outline for a rendered decoration instance. */
export class DecorationSelectionPresenter {
  readonly group = new THREE.Group();

  constructor(private palette: ViewportThemePalette, private readonly callbacks: DecorationSelectionPresenterCallbacks) {}

  update(selectedId: string | undefined): void {
    for (const child of [...this.group.children]) { disposeObject(child); this.group.remove(child); }
    if (!selectedId) return;
    const entry = this.callbacks.selected(selectedId);
    if (!entry) return;
    const bounds = new THREE.Box3().setFromObject(entry.object);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .05), Math.max(.04, bounds.max.y - bounds.min.y + .05), Math.max(.04, bounds.max.z - bounds.min.z + .05))), new THREE.LineBasicMaterial({ color: this.palette.selection, depthTest: false, depthWrite: false }));
    outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.userData['decorationInstanceId'] = selectedId; outline.renderOrder = 2001; this.group.add(outline);
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.group.traverse((object) => { if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(palette.selection); });
  }

  dispose(): void { for (const child of [...this.group.children]) { disposeObject(child); this.group.remove(child); } }
}
